import { check, HintError } from '@placemarkio/check-geojson';

export type DiagnosticSeverity = 'info' | 'warning' | 'error';

export interface Diagnostic {
  code: 'invalid-geojson';
  severity: DiagnosticSeverity;
  message: string;
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

export type InspectionReport =
  | {
      valid: true;
      summary: InspectionSummary;
      diagnostics: [];
    }
  | {
      valid: false;
      summary: null;
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

function validReport(summary: InspectionSummary): InspectionReport {
  return {
    valid: true,
    summary,
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
    return validReport(summarize(originalTree as ValidatedGeoJSON));
  } catch (error: unknown) {
    return invalidReport(error);
  }
}
