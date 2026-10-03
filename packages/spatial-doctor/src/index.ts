import { check, HintError } from '@placemarkio/check-geojson';

export type DiagnosticSeverity = 'info' | 'warning' | 'error';

export interface Diagnostic {
  code: 'invalid-geojson';
  severity: DiagnosticSeverity;
  message: string;
  featureId?: string | number;
  featureIndex?: number;
  sourceLocation?: {
    /** Zero-based UTF-16 offset in the original source text. */
    start: number;
    /** Exclusive zero-based UTF-16 offset in the original source text. */
    end: number;
  };
}

type ValidatedGeoJSON = ReturnType<typeof check>;
type GeoJSONGeometry = Exclude<
  ValidatedGeoJSON,
  { type: 'Feature' | 'FeatureCollection' }
>;
type GeometryType = GeoJSONGeometry['type'];
type JsonObject = Record<string, unknown>;

export interface InspectionSummary {
  featureCount: number;
  geometryCounts: Partial<Record<GeometryType, number>>;
}

export type CoordinateDimensions = 'XY' | 'XYZ' | 'mixed' | 'empty';

export interface CoordinateBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface ZRange {
  min: number;
  max: number;
}

export interface CoordinateSummary {
  coordinateCount: number;
  dimensions: CoordinateDimensions;
  bounds: CoordinateBounds | null;
  zRange: ZRange | null;
}

export type InspectionReport =
  | {
      valid: true;
      summary: InspectionSummary;
      coordinates: CoordinateSummary;
      diagnostics: Diagnostic[];
    }
  | {
      valid: false;
      summary: null;
      coordinates: null;
      diagnostics: Diagnostic[];
    };

const FALLBACK_MESSAGE = 'Input is not valid GeoJSON.';

function countGeometry(
  geometry: GeoJSONGeometry,
  geometryCounts: Partial<Record<GeometryType, number>>,
): void {
  geometryCounts[geometry.type] = (geometryCounts[geometry.type] ?? 0) + 1;

  if (geometry.type === 'GeometryCollection') {
    for (const child of geometry.geometries) {
      countGeometry(child, geometryCounts);
    }
  }
}

function summarize(input: ValidatedGeoJSON): InspectionSummary {
  let featureCount = 0;
  const geometryCounts: Partial<Record<GeometryType, number>> = {};

  if (input.type === 'FeatureCollection') {
    featureCount = input.features.length;
    for (const feature of input.features) {
      if (feature.geometry !== null) {
        countGeometry(feature.geometry, geometryCounts);
      }
    }
  } else if (input.type === 'Feature') {
    featureCount = 1;
    if (input.geometry !== null) {
      countGeometry(input.geometry, geometryCounts);
    }
  } else {
    countGeometry(input, geometryCounts);
  }

  return { featureCount, geometryCounts };
}

interface CoordinateAccumulator {
  coordinateCount: number;
  sawXY: boolean;
  sawXYZ: boolean;
  bounds: CoordinateBounds | null;
  zRange: ZRange | null;
}

function isPosition(value: unknown): value is number[] {
  if (!Array.isArray(value) || value.length < 2) return false;
  return value.every((ordinate: unknown) => typeof ordinate === 'number');
}

function includePosition(
  position: number[],
  accumulator: CoordinateAccumulator,
): void {
  accumulator.coordinateCount += 1;
  if (position.length >= 3) accumulator.sawXYZ = true;
  else accumulator.sawXY = true;

  const [x, y] = position;
  if (x === undefined || y === undefined) return;

  if (accumulator.bounds === null) {
    accumulator.bounds = { minX: x, maxX: x, minY: y, maxY: y };
  } else {
    accumulator.bounds.minX = Math.min(accumulator.bounds.minX, x);
    accumulator.bounds.maxX = Math.max(accumulator.bounds.maxX, x);
    accumulator.bounds.minY = Math.min(accumulator.bounds.minY, y);
    accumulator.bounds.maxY = Math.max(accumulator.bounds.maxY, y);
  }

  const z = position[2];
  if (z !== undefined) {
    if (accumulator.zRange === null) {
      accumulator.zRange = { min: z, max: z };
    } else {
      accumulator.zRange.min = Math.min(accumulator.zRange.min, z);
      accumulator.zRange.max = Math.max(accumulator.zRange.max, z);
    }
  }
}

function collectPositions(
  value: unknown,
  accumulator: CoordinateAccumulator,
): void {
  if (!Array.isArray(value)) return;
  if (isPosition(value)) {
    includePosition(value, accumulator);
    return;
  }

  for (const child of value) {
    collectPositions(child, accumulator);
  }
}

function collectGeometryCoordinates(
  geometry: GeoJSONGeometry,
  accumulator: CoordinateAccumulator,
): void {
  if (geometry.type === 'GeometryCollection') {
    for (const child of geometry.geometries) {
      collectGeometryCoordinates(child, accumulator);
    }
    return;
  }

  collectPositions(geometry.coordinates, accumulator);
}

function summarizeCoordinates(input: ValidatedGeoJSON): CoordinateSummary {
  const accumulator: CoordinateAccumulator = {
    coordinateCount: 0,
    sawXY: false,
    sawXYZ: false,
    bounds: null,
    zRange: null,
  };

  if (input.type === 'FeatureCollection') {
    for (const feature of input.features) {
      if (feature.geometry !== null) {
        collectGeometryCoordinates(feature.geometry, accumulator);
      }
    }
  } else if (input.type === 'Feature') {
    if (input.geometry !== null) {
      collectGeometryCoordinates(input.geometry, accumulator);
    }
  } else {
    collectGeometryCoordinates(input, accumulator);
  }

  const dimensions: CoordinateDimensions =
    accumulator.coordinateCount === 0
      ? 'empty'
      : accumulator.sawXY && accumulator.sawXYZ
        ? 'mixed'
        : accumulator.sawXYZ
          ? 'XYZ'
          : 'XY';

  return {
    coordinateCount: accumulator.coordinateCount,
    dimensions,
    bounds: accumulator.bounds,
    zRange: accumulator.zRange,
  };
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isGeometryCollection(value: unknown): value is JsonObject {
  return isObject(value) && value.type === 'GeometryCollection';
}

function rootGeometries(input: unknown): unknown[] {
  if (!isObject(input)) return [];

  if (input.type === 'FeatureCollection' && Array.isArray(input.features)) {
    return input.features.flatMap((feature) =>
      isObject(feature) && feature.type === 'Feature' ? [feature.geometry] : [],
    );
  }

  if (input.type === 'Feature') return [input.geometry];
  return [input];
}

function removeNestedCollections(
  collection: JsonObject,
  pending: JsonObject[],
): void {
  if (!Array.isArray(collection.geometries)) return;

  collection.geometries = collection.geometries.filter((geometry: unknown) => {
    if (!isGeometryCollection(geometry)) return true;
    pending.push(geometry);
    return false;
  });
}

function validateWithNestedCollections(input: unknown): void {
  const pending: JsonObject[] = [];

  for (const geometry of rootGeometries(input)) {
    if (isGeometryCollection(geometry)) {
      removeNestedCollections(geometry, pending);
    }
  }

  const rootInput = JSON.stringify(input);
  if (typeof rootInput !== 'string') throw new TypeError(FALLBACK_MESSAGE);
  check(rootInput);

  for (let index = 0; index < pending.length; index += 1) {
    const collection = pending[index];
    removeNestedCollections(collection, pending);

    const serializedCollection = JSON.stringify(collection);
    if (typeof serializedCollection !== 'string') {
      throw new TypeError(FALLBACK_MESSAGE);
    }
    check(serializedCollection);
  }
}

function validReport(
  summary: InspectionSummary,
  coordinates: CoordinateSummary,
): InspectionReport {
  return {
    valid: true,
    summary,
    coordinates,
    diagnostics: [],
  };
}

function invalidReport(error?: unknown): InspectionReport {
  const issues = error instanceof HintError ? error.issues : [];
  const diagnostics: Diagnostic[] = issues.map((issue) => ({
    code: 'invalid-geojson',
    severity: 'error',
    message: issue.message || FALLBACK_MESSAGE,
  }));

  return {
    valid: false,
    summary: null,
    coordinates: null,
    diagnostics:
      diagnostics.length > 0
        ? diagnostics
        : [{
            code: 'invalid-geojson',
            severity: 'error',
            message: FALLBACK_MESSAGE,
          }],
  };
}

/** Validates an already-parsed GeoJSON value and reports deterministic diagnostics. */
export function inspectGeoJSON(input: unknown): InspectionReport {
  try {
    const serializedInput = JSON.stringify(input);
    if (typeof serializedInput !== 'string') return invalidReport();

    const originalTree: unknown = JSON.parse(serializedInput);
    const validationTree: unknown = JSON.parse(serializedInput);
    validateWithNestedCollections(validationTree);

    // The validator checks the original root plus each removed GeometryCollection.
    const validatedInput = originalTree as ValidatedGeoJSON;
    return validReport(summarize(validatedInput), summarizeCoordinates(validatedInput));
  } catch (error: unknown) {
    return invalidReport(error);
  }
}
