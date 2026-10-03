import type { Feature, GeoJSON as GeoJSONValue } from 'geojson';
import type { SourceTextLocation } from './diagnosticNavigation';
import {
  hasDiagnosticSourceLocation,
  resolveDiagnosticFeatureIndex,
  type DiagnosticReference,
} from './diagnosticNavigation';

interface JsonSourceNode {
  kind: 'object' | 'array' | 'string' | 'primitive';
  start: number;
  end: number;
  members?: Map<string, JsonSourceNode>;
  items?: JsonSourceNode[];
}

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

export function resolveDiagnosticSourceLocation(
  rawText: string,
  geojson: GeoJSONValue | null,
  diagnostic: DiagnosticReference,
): SourceTextLocation | null {
  if (hasDiagnosticSourceLocation(diagnostic, rawText.length)) {
    return diagnostic.sourceLocation!;
  }

  const featureIndex = resolveDiagnosticFeatureIndex(geojson, diagnostic);
  return featureIndex === null || geojson === null
    ? null
    : findFeatureSourceLocation(rawText, geojson, featureIndex);
}
