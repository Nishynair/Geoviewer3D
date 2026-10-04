import type { Feature, GeoJSON as GeoJSONValue } from 'geojson';
import type { SourceTextLocation } from './diagnosticNavigation';
import {
  hasDiagnosticSourceLocation,
  resolveDiagnosticFeatureIndex,
  getGeoJSONFeature,
  type DiagnosticReference,
} from './diagnosticNavigation';
import { hasExplicitJsonFgSignature } from './jsonFg';

interface JsonSourceNode {
  kind: 'object' | 'array' | 'string' | 'primitive';
  start: number;
  end: number;
  members?: Map<string, JsonSourceNode>;
  items?: JsonSourceNode[];
}

type JsonObject = Record<string, unknown>;

class JsonSourceScanner {
  private offset = 0;

  constructor(private readonly source: string) {}

  parse(): JsonSourceNode | null {
    try {
      this.skipWhitespace();
      const root = this.parseValue();
      this.skipWhitespace();
      return this.offset === this.source.length ? root : null;
    } catch {
      return null;
    }
  }

  private parseValue(): JsonSourceNode {
    this.skipWhitespace();
    const start = this.offset;
    const current = this.source[this.offset];

    if (current === '{') return this.parseObject(start);
    if (current === '[') return this.parseArray(start);
    if (current === '"') {
      JSON.parse(this.parseString());
      return { kind: 'string', start, end: this.offset };
    }

    while (this.offset < this.source.length && !this.isValueDelimiter(this.source[this.offset]!)) {
      this.offset += 1;
    }
    if (this.offset === start) throw new SyntaxError('Expected a JSON value.');
    JSON.parse(this.source.slice(start, this.offset));
    return { kind: 'primitive', start, end: this.offset };
  }

  private parseObject(start: number): JsonSourceNode {
    this.offset += 1;
    this.skipWhitespace();
    const members = new Map<string, JsonSourceNode>();
    if (this.consume('}')) return { kind: 'object', start, end: this.offset, members };

    while (this.offset < this.source.length) {
      this.skipWhitespace();
      const key = JSON.parse(this.parseString()) as string;
      this.skipWhitespace();
      this.expect(':');
      const value = this.parseValue();
      // JSON.parse keeps the last value for duplicate keys, so source lookup does too.
      members.set(key, value);
      this.skipWhitespace();
      if (this.consume('}')) return { kind: 'object', start, end: this.offset, members };
      this.expect(',');
    }

    throw new SyntaxError('Unclosed JSON object.');
  }

  private parseArray(start: number): JsonSourceNode {
    this.offset += 1;
    this.skipWhitespace();
    const items: JsonSourceNode[] = [];
    if (this.consume(']')) return { kind: 'array', start, end: this.offset, items };

    while (this.offset < this.source.length) {
      items.push(this.parseValue());
      this.skipWhitespace();
      if (this.consume(']')) return { kind: 'array', start, end: this.offset, items };
      this.expect(',');
    }

    throw new SyntaxError('Unclosed JSON array.');
  }

  private parseString(): string {
    const start = this.offset;
    this.expect('"');

    while (this.offset < this.source.length) {
      const current = this.source[this.offset]!;
      if (current === '"') {
        this.offset += 1;
        return this.source.slice(start, this.offset);
      }
      if (current === '\\') {
        this.offset += 2;
      } else {
        this.offset += 1;
      }
    }

    throw new SyntaxError('Unclosed JSON string.');
  }

  private skipWhitespace(): void {
    while (this.isJSONWhitespace(this.source[this.offset])) {
      this.offset += 1;
    }
  }

  private isValueDelimiter(value: string): boolean {
    return value === ',' || value === ']' || value === '}' || this.isJSONWhitespace(value);
  }

  private isJSONWhitespace(value: string | undefined): boolean {
    return value === ' ' || value === '\t' || value === '\n' || value === '\r';
  }

  private consume(expected: string): boolean {
    if (this.source[this.offset] !== expected) return false;
    this.offset += 1;
    return true;
  }

  private expect(expected: string): void {
    if (!this.consume(expected)) throw new SyntaxError(`Expected ${expected}.`);
  }
}

export function findFeatureSourceLocation(
  rawText: string,
  geojson: GeoJSONValue,
  featureIndex: number,
): SourceTextLocation | null {
  if (!Number.isSafeInteger(featureIndex) || featureIndex < 0) return null;

  const root = new JsonSourceScanner(rawText).parse();
  if (!root) return null;

  let feature: Feature | undefined;
  let sourceNode: JsonSourceNode | undefined;
  if (geojson.type === 'Feature') {
    if (featureIndex !== 0 || root.kind !== 'object') return null;
    feature = geojson;
    sourceNode = root;
  } else if (geojson.type === 'FeatureCollection') {
    if (root.kind !== 'object' || !Array.isArray(geojson.features)) return null;
    const featureNodes = root.members?.get('features');
    if (featureNodes?.kind !== 'array' || featureIndex >= geojson.features.length) return null;
    feature = geojson.features[featureIndex];
    sourceNode = featureNodes.items?.[featureIndex];
  } else {
    return null;
  }

  if (!feature || sourceNode?.kind !== 'object') return null;
  const sourceFeatureText = rawText.slice(sourceNode.start, sourceNode.end);

  try {
    if (JSON.stringify(JSON.parse(sourceFeatureText)) !== JSON.stringify(feature)) return null;
  } catch {
    return null;
  }

  return { start: sourceNode.start, end: sourceNode.end };
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCoordinateTuple(value: unknown): value is number[] {
  return Array.isArray(value)
    && value.length >= 2
    && value.every((ordinate) => typeof ordinate === 'number' && Number.isFinite(ordinate));
}

function findCoordinateNode(
  geometry: unknown,
  geometryNode: JsonSourceNode | undefined,
  coordinatePath: number[],
): JsonSourceNode | null {
  if (!isJsonObject(geometry) || geometryNode?.kind !== 'object') return null;

  if (geometry.type === 'GeometryCollection') {
    const childIndex = coordinatePath[0];
    const children = geometry.geometries;
    const childrenNode = geometryNode.members?.get('geometries');
    if (
      childIndex === undefined
      || !Number.isSafeInteger(childIndex)
      || childIndex < 0
      || !Array.isArray(children)
      || childrenNode?.kind !== 'array'
    ) return null;

    const child = children[childIndex];
    const childNode = childrenNode.items?.[childIndex];
    return child === undefined
      ? null
      : findCoordinateNode(child, childNode, coordinatePath.slice(1));
  }

  const coordinates = geometry.coordinates;
  let coordinateNode = geometryNode.members?.get('coordinates');
  if (!Array.isArray(coordinates) || coordinateNode?.kind !== 'array') return null;

  let value: unknown = coordinates;
  for (const index of coordinatePath) {
    if (
      !Number.isSafeInteger(index)
      || index < 0
      || !Array.isArray(value)
      || coordinateNode.kind !== 'array'
    ) return null;
    value = value[index];
    coordinateNode = coordinateNode.items?.[index];
    if (value === undefined || coordinateNode === undefined) return null;
  }

  return isCoordinateTuple(value) && coordinateNode?.kind === 'array'
    ? coordinateNode
    : null;
}

export function findDiagnosticCoordinateSourceLocation(
  rawText: string,
  geojson: GeoJSONValue | null,
  diagnostic: DiagnosticReference,
): SourceTextLocation | null {
  if (!Array.isArray(diagnostic.coordinatePath)) return null;

  const rootNode = new JsonSourceScanner(rawText).parse();
  if (!rootNode) return null;

  let rootValue: unknown;
  try {
    rootValue = JSON.parse(rawText);
    if (geojson !== null) {
      const isJsonFgProjection = hasExplicitJsonFgSignature(rootValue);
      if (!isJsonFgProjection && JSON.stringify(rootValue) !== JSON.stringify(geojson)) return null;
      if (
        !isJsonObject(rootValue)
        || !isJsonObject(geojson)
        || rootValue.type !== geojson.type
      ) return null;
    }
  } catch {
    return null;
  }

  let geometryValue: unknown = rootValue;
  let geometryNode: JsonSourceNode | undefined = rootNode;

  if (diagnostic.featureIndex !== undefined) {
    if (!Number.isSafeInteger(diagnostic.featureIndex) || diagnostic.featureIndex < 0) return null;
    let featureValue: unknown;
    let featureNode: JsonSourceNode | undefined;
    if (isJsonObject(rootValue) && rootValue.type === 'FeatureCollection') {
      const features = rootValue.features;
      const featuresNode = rootNode.members?.get('features');
      if (!Array.isArray(features) || featuresNode?.kind !== 'array') return null;
      featureValue = features[diagnostic.featureIndex];
      featureNode = featuresNode.items?.[diagnostic.featureIndex];
    } else if (
      isJsonObject(rootValue)
      && rootValue.type === 'Feature'
      && diagnostic.featureIndex === 0
    ) {
      featureValue = rootValue;
      featureNode = rootNode;
    } else {
      return null;
    }

    if (!isJsonObject(featureValue) || featureValue.type !== 'Feature' || featureNode?.kind !== 'object') {
      return null;
    }
    if (diagnostic.featureId !== undefined && featureValue.id !== diagnostic.featureId) return null;
    const projectedFeature = geojson === null
      ? null
      : getGeoJSONFeature(geojson, diagnostic.featureIndex);
    if (
      geojson !== null
      && (!projectedFeature
        || projectedFeature.id !== featureValue.id
        || JSON.stringify(projectedFeature.geometry) !== JSON.stringify(featureValue.geometry))
    ) return null;
    geometryValue = featureValue.geometry;
    geometryNode = featureNode.members?.get('geometry');
  } else if (diagnostic.featureId !== undefined) {
    return null;
  }

  const coordinateNode = findCoordinateNode(
    geometryValue,
    geometryNode,
    diagnostic.coordinatePath,
  );
  if (!coordinateNode || coordinateNode.start < 0 || coordinateNode.end > rawText.length) return null;
  return { start: coordinateNode.start, end: coordinateNode.end };
}

export function resolveMapFeatureSelection(
  rawText: string,
  geojson: GeoJSONValue | null,
  featureIndex: number,
): { featureIndex: number; sourceLocation: SourceTextLocation | null } | null {
  const feature = getGeoJSONFeature(geojson, featureIndex);
  if (!feature || geojson === null) return null;
  return {
    featureIndex,
    sourceLocation: findFeatureSourceLocation(rawText, geojson, featureIndex),
  };
}

export function resolveDiagnosticSourceLocation(
  rawText: string,
  geojson: GeoJSONValue | null,
  diagnostic: DiagnosticReference,
): SourceTextLocation | null {
  if (Array.isArray(diagnostic.coordinatePath)) {
    return findDiagnosticCoordinateSourceLocation(rawText, geojson, diagnostic);
  }

  if (hasDiagnosticSourceLocation(diagnostic, rawText.length)) {
    return diagnostic.sourceLocation!;
  }

  const featureIndex = resolveDiagnosticFeatureIndex(geojson, diagnostic);
  return featureIndex === null || geojson === null
    ? null
    : findFeatureSourceLocation(rawText, geojson, featureIndex);
}
