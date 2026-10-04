import { check, HintError } from '@placemarkio/check-geojson';

export type DiagnosticSeverity = 'info' | 'warning' | 'error';

export interface Diagnostic {
  code:
    | 'invalid-geojson'
    | 'duplicate-consecutive-position'
    | 'mixed-coordinate-dimensions'
    | 'coordinate-out-of-range'
    | 'unclosed-polygon-ring'
    | 'excess-coordinate-precision';
  severity: DiagnosticSeverity;
  message: string;
  featureId?: string | number;
  featureIndex?: number;
  /** Zero-based index path from a feature's (or root geometry's) geometry. */
  coordinatePath?: number[];
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
export type GeometryType = GeoJSONGeometry['type'];
type JsonObject = Record<string, unknown>;

type Position = [number, number, ...number[]];
type MeasurementGeometry =
  | { type: 'Point'; coordinates: Position }
  | { type: 'MultiPoint'; coordinates: Position[] }
  | { type: 'LineString'; coordinates: Position[] }
  | { type: 'MultiLineString'; coordinates: Position[][] }
  | { type: 'Polygon'; coordinates: Position[][] }
  | { type: 'MultiPolygon'; coordinates: Position[][][] }
  | { type: 'GeometryCollection'; geometries: MeasurementGeometry[] };

export interface CoordinateZValue {
  /** Index path through coordinate arrays and GeometryCollection.geometries. */
  path: number[];
  longitude: number;
  latitude: number;
  z: number | null;
}

export interface DistanceSummary {
  /** Sum of measured segments, or null when no segment could be measured. */
  meters: number | null;
  measuredSegments: number;
  totalSegments: number;
  complete: boolean;
  /** True when a finite segment sum could not be represented as a number. */
  rangeExceeded: boolean;
}

export interface LineSegmentMeasurement {
  horizontalMeters: number | null;
  verticalChangeMeters: number | null;
  distance3DMeters: number | null;
  gradePercent: number | null;
}

export interface LineProfileCoordinate {
  coordinateIndex: number;
  x: number;
  y: number;
  z: number | null;
  distanceAlongMeters: number | null;
}

export interface LineProfile {
  /** GeometryCollection child and MultiLineString component indexes. */
  path: number[];
  coordinates: LineProfileCoordinate[];
  segments: LineSegmentMeasurement[];
  horizontalLength: DistanceSummary;
  threeDimensionalLength: DistanceSummary;
}

export interface ZStatistics {
  minimum: number | null;
  maximum: number | null;
  mean: number | null;
  measuredCoordinates: number;
  missingCoordinates: number;
}

export interface GeometryMeasurementSummary {
  geometryType: GeometryType;
  coordinateCount: number;
  dimensions: CoordinateDimensions;
  zRange: ZRange | null;
  zStatistics: ZStatistics;
  coordinateZ: CoordinateZValue[];
  lineProfiles: LineProfile[];
  horizontalLength: DistanceSummary;
  threeDimensionalLength: DistanceSummary;
}

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
const MAX_SIGNIFICANT_COORDINATE_DIGITS = 15;

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

const SPHERICAL_EARTH_RADIUS_METERS = 6_371_008.8;

function horizontalDistanceMeters(from: Position, to: Position): number | null {
  const [fromLongitude, fromLatitude] = from;
  const [toLongitude, toLatitude] = to;
  if (
    !Number.isFinite(fromLongitude) ||
    !Number.isFinite(fromLatitude) ||
    !Number.isFinite(toLongitude) ||
    !Number.isFinite(toLatitude) ||
    Math.abs(fromLongitude) > 180 ||
    Math.abs(toLongitude) > 180 ||
    Math.abs(fromLatitude) > 90 ||
    Math.abs(toLatitude) > 90
  ) {
    return null;
  }

  const radians = Math.PI / 180;
  const latitudeDelta = (toLatitude - fromLatitude) * radians;
  const longitudeDelta = (toLongitude - fromLongitude) * radians;
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude * radians) *
      Math.cos(toLatitude * radians) *
      Math.sin(longitudeDelta / 2) ** 2;
  const centralAngle = 2 * Math.asin(Math.min(1, Math.sqrt(haversine)));
  return SPHERICAL_EARTH_RADIUS_METERS * centralAngle;
}

function distanceSummary(values: Array<number | null>): DistanceSummary {
  let meters = 0;
  let measuredSegments = 0;
  let rangeExceeded = false;
  for (const value of values) {
    if (value === null || !Number.isFinite(value)) continue;
    measuredSegments += 1;
    const nextMeters = meters + value;
    if (!Number.isFinite(nextMeters)) {
      rangeExceeded = true;
    } else if (!rangeExceeded) {
      meters = nextMeters;
    }
  }

  return {
    meters: measuredSegments > 0 && !rangeExceeded ? meters : null,
    measuredSegments,
    totalSegments: values.length,
    complete: measuredSegments === values.length && !rangeExceeded,
    rangeExceeded,
  };
}

function lineProfile(path: number[], positions: Position[]): LineProfile {
  const coordinates: LineProfileCoordinate[] = [];
  const segments: LineSegmentMeasurement[] = [];
  let distanceAlongMeters = 0;
  const firstPosition = positions[0];
  let distanceAlongIsAvailable =
    firstPosition !== undefined && horizontalDistanceMeters(firstPosition, firstPosition) !== null;

  positions.forEach((position, coordinateIndex) => {
    const [x, y] = position;
    const z = position[2] ?? null;
    if (coordinateIndex > 0) {
      const previous = positions[coordinateIndex - 1];
      if (previous === undefined) {
        distanceAlongIsAvailable = false;
      } else {
        const horizontalMeters = horizontalDistanceMeters(previous, position);
        if (horizontalMeters === null) {
          distanceAlongIsAvailable = false;
        }

        const previousZ = previous[2] ?? null;
        const rawVerticalChangeMeters =
          previousZ === null || z === null ? null : z - previousZ;
        const verticalChangeMeters =
          rawVerticalChangeMeters === null || !Number.isFinite(rawVerticalChangeMeters)
            ? null
            : rawVerticalChangeMeters;
        const rawDistance3DMeters =
          horizontalMeters === null || verticalChangeMeters === null
            ? null
            : Math.hypot(horizontalMeters, verticalChangeMeters);
        const distance3DMeters =
          rawDistance3DMeters === null || !Number.isFinite(rawDistance3DMeters)
            ? null
            : rawDistance3DMeters;
        const rawGradePercent =
          horizontalMeters === null ||
          horizontalMeters === 0 ||
          verticalChangeMeters === null
            ? null
            : (verticalChangeMeters / horizontalMeters) * 100;
        segments.push({
          horizontalMeters,
          verticalChangeMeters,
          distance3DMeters,
          gradePercent:
            rawGradePercent === null || !Number.isFinite(rawGradePercent)
              ? null
              : rawGradePercent,
        });

        if (horizontalMeters === null) {
          distanceAlongIsAvailable = false;
        } else if (distanceAlongIsAvailable) {
          const nextDistanceAlongMeters = distanceAlongMeters + horizontalMeters;
          if (Number.isFinite(nextDistanceAlongMeters)) {
            distanceAlongMeters = nextDistanceAlongMeters;
          } else {
            distanceAlongIsAvailable = false;
          }
        }
      }
    }

    coordinates.push({
      coordinateIndex,
      x,
      y,
      z,
      distanceAlongMeters: distanceAlongIsAvailable ? distanceAlongMeters : null,
    });
  });

  return {
    path,
    coordinates,
    segments,
    horizontalLength: distanceSummary(segments.map((segment) => segment.horizontalMeters)),
    threeDimensionalLength: distanceSummary(
      segments.map((segment) => segment.distance3DMeters),
    ),
  };
}

function collectCoordinateZ(
  geometry: MeasurementGeometry,
  path: number[],
  coordinateZ: CoordinateZValue[],
): void {
  const include = (position: Position, coordinatePath: number[]) => {
    coordinateZ.push({
      path: coordinatePath,
      longitude: position[0],
      latitude: position[1],
      z: position[2] ?? null,
    });
  };

  switch (geometry.type) {
    case 'Point':
      include(geometry.coordinates, path);
      return;
    case 'MultiPoint':
      geometry.coordinates.forEach((position, index) => include(position, [...path, index]));
      return;
    case 'LineString':
      geometry.coordinates.forEach((position, index) => include(position, [...path, index]));
      return;
    case 'MultiLineString':
      geometry.coordinates.forEach((line, lineIndex) =>
        line.forEach((position, positionIndex) =>
          include(position, [...path, lineIndex, positionIndex]),
        ),
      );
      return;
    case 'Polygon':
      geometry.coordinates.forEach((ring, ringIndex) =>
        ring.forEach((position, positionIndex) =>
          include(position, [...path, ringIndex, positionIndex]),
        ),
      );
      return;
    case 'MultiPolygon':
      geometry.coordinates.forEach((polygon, polygonIndex) =>
        polygon.forEach((ring, ringIndex) =>
          ring.forEach((position, positionIndex) =>
            include(position, [...path, polygonIndex, ringIndex, positionIndex]),
          ),
        ),
      );
      return;
    case 'GeometryCollection':
      geometry.geometries.forEach((child, childIndex) =>
        collectCoordinateZ(child, [...path, childIndex], coordinateZ),
      );
  }
}

function collectLineProfiles(
  geometry: MeasurementGeometry,
  path: number[],
  profiles: LineProfile[],
): void {
  switch (geometry.type) {
    case 'LineString':
      profiles.push(lineProfile(path, geometry.coordinates));
      return;
    case 'MultiLineString':
      geometry.coordinates.forEach((line, index) =>
        profiles.push(lineProfile([...path, index], line)),
      );
      return;
    case 'GeometryCollection':
      geometry.geometries.forEach((child, childIndex) =>
        collectLineProfiles(child, [...path, childIndex], profiles),
      );
  }
}

function isGeometryType(value: unknown): value is GeometryType {
  return (
    value === 'Point' ||
    value === 'MultiPoint' ||
    value === 'LineString' ||
    value === 'MultiLineString' ||
    value === 'Polygon' ||
    value === 'MultiPolygon' ||
    value === 'GeometryCollection'
  );
}

/**
 * Validates and measures a GeoJSON geometry, returning null for invalid input.
 * Horizontal distances use a spherical lon/lat approximation; Z is used as a
 * raw meter value for arithmetic only. No vertical datum conversion or
 * inference is performed.
 */
export function measureGeoJSONGeometry(
  input: unknown,
): GeometryMeasurementSummary | null {
  try {
    const serializedInput = JSON.stringify(input);
    if (typeof serializedInput !== 'string') return null;

    const geometryTree: unknown = JSON.parse(serializedInput);
    const validationTree: unknown = JSON.parse(serializedInput);
    validateWithNestedCollections(validationTree);
    if (!isObject(geometryTree) || !isGeometryType(geometryTree.type)) return null;

    const geometry = geometryTree as unknown as MeasurementGeometry;
    const coordinates = summarizeCoordinates(geometry as ValidatedGeoJSON);
    const coordinateZ: CoordinateZValue[] = [];
    const lineProfiles: LineProfile[] = [];
    collectCoordinateZ(geometry, [], coordinateZ);
    collectLineProfiles(geometry, [], lineProfiles);
    const segments = lineProfiles.flatMap((line) => line.segments);
    const zValues = coordinateZ.flatMap(({ z }) => (z === null ? [] : [z]));
    let zMinimum: number | null = null;
    let zMaximum: number | null = null;
    let zMean: number | null = null;
    let zCount = 0;
    for (const z of zValues) {
      zMinimum = zMinimum === null ? z : Math.min(zMinimum, z);
      zMaximum = zMaximum === null ? z : Math.max(zMaximum, z);
      zCount += 1;
      const weightedMean =
        zMean === null
          ? z
          : zMean * ((zCount - 1) / zCount) + z / zCount;
      zMean = Math.min(zMaximum, Math.max(zMinimum, weightedMean));
    }

    return {
      geometryType: geometry.type,
      coordinateCount: coordinates.coordinateCount,
      dimensions: coordinates.dimensions,
      zRange: coordinates.zRange,
      zStatistics: {
        minimum: zMinimum,
        maximum: zMaximum,
        mean: zMean,
        measuredCoordinates: zValues.length,
        missingCoordinates: coordinateZ.length - zValues.length,
      },
      coordinateZ,
      lineProfiles,
      horizontalLength: distanceSummary(
        segments.map((segment) => segment.horizontalMeters),
      ),
      threeDimensionalLength: distanceSummary(
        segments.map((segment) => segment.distance3DMeters),
      ),
    };
  } catch {
    return null;
  }
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
  diagnostics: Diagnostic[],
): InspectionReport {
  return {
    valid: true,
    summary,
    coordinates,
    diagnostics,
  };
}

type CoordinateDiagnosticPosition = {
  position: number[];
  feature: JsonObject | null;
  featureIndex: number | undefined;
  coordinatePath: number[];
};

function isDiagnosticPosition(value: unknown): value is number[] {
  return Array.isArray(value)
    && value.length >= 2
    && value.every((ordinate) => typeof ordinate === 'number' && Number.isFinite(ordinate));
}

function sameCoordinateTuple(left: number[], right: number[]): boolean {
  return left.length === right.length
    && left.every((ordinate, index) => ordinate === right[index]);
}

function hasExcessiveSignificantDigits(value: number): boolean {
  const decimalMantissa = value.toString().split(/[eE]/, 1)[0] ?? '';
  const significantDigits = decimalMantissa
    .replace('-', '')
    .replace('.', '')
    .replace(/^0+/, '')
    .replace(/0+$/, '')
    .length;
  return significantDigits > MAX_SIGNIFICANT_COORDINATE_DIGITS;
}

function coordinateDiagnosticReference(
  position: CoordinateDiagnosticPosition,
): Pick<Diagnostic, 'featureId' | 'featureIndex' | 'coordinatePath'> {
  const reference: Pick<Diagnostic, 'featureId' | 'featureIndex' | 'coordinatePath'> = {
    coordinatePath: position.coordinatePath,
  };
  if (position.featureIndex !== undefined) reference.featureIndex = position.featureIndex;
  const featureId = position.feature?.id;
  if (typeof featureId === 'string' || typeof featureId === 'number') {
    reference.featureId = featureId;
  }
  return reference;
}

function coordinateDiagnostics(input: ValidatedGeoJSON): Diagnostic[] {
  const duplicates: Diagnostic[] = [];
  const outOfRange: Diagnostic[] = [];
  const excessivePrecision: Diagnostic[] = [];
  let firstDimension: 'XY' | 'XYZ' | null = null;
  let mixedDimensionPosition: CoordinateDiagnosticPosition | null = null;

  const inspectPosition = (position: CoordinateDiagnosticPosition): void => {
    const dimension = position.position.length === 2 ? 'XY' : 'XYZ';
    if (firstDimension === null) {
      firstDimension = dimension;
    } else if (mixedDimensionPosition === null && dimension !== firstDimension) {
      mixedDimensionPosition = position;
    }

    const [longitude, latitude] = position.position;
    if (longitude === undefined || latitude === undefined) return;
    if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
      outOfRange.push({
        code: 'coordinate-out-of-range',
        severity: 'error',
        message: 'Longitude must be within -180 to 180 degrees and latitude within -90 to 90 degrees.',
        ...coordinateDiagnosticReference(position),
      });
    }

    if (position.position.some(hasExcessiveSignificantDigits)) {
      excessivePrecision.push({
        code: 'excess-coordinate-precision',
        severity: 'warning',
        message: 'At least one value in this coordinate is represented with more than 15 significant decimal digits. This numeric heuristic does not establish accuracy or recover the original JSON text.',
        ...coordinateDiagnosticReference(position),
      });
    }
  };

  const inspectSequence = (
    values: unknown,
    path: number[],
    feature: JsonObject | null,
    featureIndex: number | undefined,
  ): void => {
    if (!Array.isArray(values)) return;
    for (let index = 0; index < values.length; index += 1) {
      const value = values[index];
      if (!isDiagnosticPosition(value)) continue;

      const position: CoordinateDiagnosticPosition = {
        position: value,
        feature,
        featureIndex,
        coordinatePath: [...path, index],
      };
      inspectPosition(position);

      const previous = values[index - 1];
      if (isDiagnosticPosition(previous) && sameCoordinateTuple(previous, value)) {
        duplicates.push({
          code: 'duplicate-consecutive-position',
          severity: 'warning',
          message: 'The same full coordinate tuple appears in two consecutive positions.',
          ...coordinateDiagnosticReference(position),
        });
      }
    }
  };

  const inspectSinglePosition = (
    value: unknown,
    path: number[],
    feature: JsonObject | null,
    featureIndex: number | undefined,
  ): void => {
    if (!isDiagnosticPosition(value)) return;
    inspectPosition({
      position: value,
      feature,
      featureIndex,
      coordinatePath: path,
    });
  };

  const inspectGeometry = (
    geometry: unknown,
    path: number[],
    feature: JsonObject | null,
    featureIndex: number | undefined,
  ): void => {
    if (!isObject(geometry)) return;
    switch (geometry.type) {
      case 'Point':
        inspectSinglePosition(geometry.coordinates, path, feature, featureIndex);
        return;
      case 'MultiPoint':
      case 'LineString':
        inspectSequence(geometry.coordinates, path, feature, featureIndex);
        return;
      case 'MultiLineString':
      case 'Polygon':
        if (Array.isArray(geometry.coordinates)) {
          geometry.coordinates.forEach((sequence, index) =>
            inspectSequence(sequence, [...path, index], feature, featureIndex),
          );
        }
        return;
      case 'MultiPolygon':
        if (Array.isArray(geometry.coordinates)) {
          geometry.coordinates.forEach((polygon, polygonIndex) => {
            if (!Array.isArray(polygon)) return;
            polygon.forEach((ring, ringIndex) =>
              inspectSequence(ring, [...path, polygonIndex, ringIndex], feature, featureIndex),
            );
          });
        }
        return;
      case 'GeometryCollection':
        if (Array.isArray(geometry.geometries)) {
          geometry.geometries.forEach((child, index) =>
            inspectGeometry(child, [...path, index], feature, featureIndex),
          );
        }
    }
  };

  if (input.type === 'FeatureCollection') {
    input.features.forEach((feature, featureIndex) => {
      if (feature.geometry !== null) {
        inspectGeometry(feature.geometry, [], feature as unknown as JsonObject, featureIndex);
      }
    });
  } else if (input.type === 'Feature') {
    if (input.geometry !== null) {
      inspectGeometry(input.geometry, [], input as unknown as JsonObject, 0);
    }
  } else {
    inspectGeometry(input, [], null, undefined);
  }

  const mixedDimension: Diagnostic[] = mixedDimensionPosition === null
    ? []
    : [{
        code: 'mixed-coordinate-dimensions',
        severity: 'warning',
        message: 'This document contains both XY and XYZ coordinate positions.',
        ...coordinateDiagnosticReference(mixedDimensionPosition),
      }];

  return [...duplicates, ...mixedDimension, ...outOfRange, ...excessivePrecision];
}

function unclosedRingDiagnostics(input: unknown): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  const inspectRing = (
    ring: unknown,
    path: number[],
    feature: JsonObject | null,
    featureIndex: number | undefined,
  ): void => {
    if (!Array.isArray(ring) || ring.length < 2 || !ring.every(isDiagnosticPosition)) return;
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (!first || !last || sameCoordinateTuple(first, last)) return;

    diagnostics.push({
      code: 'unclosed-polygon-ring',
      severity: 'error',
      message: 'The last position in this polygon ring does not match its first position; GeoJSON polygon rings must be closed.',
      ...coordinateDiagnosticReference({
        position: last,
        feature,
        featureIndex,
        coordinatePath: [...path, ring.length - 1],
      }),
    });
  };

  const inspectGeometry = (
    geometry: unknown,
    path: number[],
    feature: JsonObject | null,
    featureIndex: number | undefined,
  ): void => {
    if (!isObject(geometry)) return;
    if (geometry.type === 'Polygon' && Array.isArray(geometry.coordinates)) {
      geometry.coordinates.forEach((ring, ringIndex) =>
        inspectRing(ring, [...path, ringIndex], feature, featureIndex),
      );
      return;
    }
    if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) {
      geometry.coordinates.forEach((polygon, polygonIndex) => {
        if (!Array.isArray(polygon)) return;
        polygon.forEach((ring, ringIndex) =>
          inspectRing(ring, [...path, polygonIndex, ringIndex], feature, featureIndex),
        );
      });
      return;
    }
    if (geometry.type === 'GeometryCollection' && Array.isArray(geometry.geometries)) {
      geometry.geometries.forEach((child, childIndex) =>
        inspectGeometry(child, [...path, childIndex], feature, featureIndex),
      );
    }
  };

  if (!isObject(input)) return diagnostics;
  if (input.type === 'FeatureCollection' && Array.isArray(input.features)) {
    input.features.forEach((feature, featureIndex) => {
      if (
        isObject(feature)
        && feature.type === 'Feature'
        && feature.geometry !== null
      ) {
        inspectGeometry(feature.geometry, [], feature, featureIndex);
      }
    });
  } else if (input.type === 'Feature' && input.geometry !== null) {
    inspectGeometry(input.geometry, [], input, 0);
  } else {
    inspectGeometry(input, [], null, undefined);
  }

  return diagnostics;
}

function invalidReport(error?: unknown, extraDiagnostics: Diagnostic[] = []): InspectionReport {
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
    diagnostics: [
      ...(diagnostics.length > 0
        ? diagnostics
        : [{
            code: 'invalid-geojson' as const,
            severity: 'error' as const,
            message: FALLBACK_MESSAGE,
          }]),
      ...extraDiagnostics,
    ],
  };
}

/** Validates an already-parsed GeoJSON value and reports deterministic diagnostics. */
export function inspectGeoJSON(input: unknown): InspectionReport {
  try {
    const serializedInput = JSON.stringify(input);
    if (typeof serializedInput !== 'string') return invalidReport();

    const originalTree: unknown = JSON.parse(serializedInput);
    const validationTree: unknown = JSON.parse(serializedInput);
    try {
      validateWithNestedCollections(validationTree);
    } catch (error: unknown) {
      let ringDiagnostics: Diagnostic[] = [];
      try {
        ringDiagnostics = unclosedRingDiagnostics(originalTree);
      } catch {
        // Invalid input still returns the structural validation report when a
        // polygon ring cannot be inspected safely.
      }
      return invalidReport(error, ringDiagnostics);
    }

    // The validator checks the original root plus each removed GeometryCollection.
    const validatedInput = originalTree as ValidatedGeoJSON;
    return validReport(
      summarize(validatedInput),
      summarizeCoordinates(validatedInput),
      coordinateDiagnostics(validatedInput),
    );
  } catch (error: unknown) {
    return invalidReport(error);
  }
}
