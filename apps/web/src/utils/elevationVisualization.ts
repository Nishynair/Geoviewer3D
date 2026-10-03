import type { GeoJSON as GeoJSONValue } from 'geojson';
import { measureGeoJSONGeometry } from 'spatial-doctor';

export interface ElevationRange {
  min: number;
  max: number;
}

export interface FeatureElevationStyle {
  range: ElevationRange | null;
  colors: Map<number, string>;
}

const MIN_EXAGGERATION = 1;
const MAX_EXAGGERATION = 5;
const ELEVATION_STOPS = [
  { at: 0, rgb: [33, 102, 172] },
  { at: 0.5, rgb: [247, 247, 191] },
  { at: 1, rgb: [178, 24, 43] },
] as const;

function normalizeElevation(value: number, range: ElevationRange): number {
  const scale = Math.max(Math.abs(value), Math.abs(range.min), Math.abs(range.max));
  if (scale === 0) return 0.5;
  const normalizedMin = range.min / scale;
  const normalizedMax = range.max / scale;
  const normalizedValue = value / scale;
  return Math.min(
    1,
    Math.max(0, (normalizedValue - normalizedMin) / (normalizedMax - normalizedMin)),
  );
}

export function normalizeVerticalExaggeration(value: number): number {
  if (!Number.isFinite(value)) return MIN_EXAGGERATION;
  return Math.min(MAX_EXAGGERATION, Math.max(MIN_EXAGGERATION, value));
}

export function colorForElevation(
  elevation: number | null,
  range: ElevationRange | null,
): string | null {
  if (
    elevation === null ||
    !Number.isFinite(elevation) ||
    range === null ||
    !Number.isFinite(range.min) ||
    !Number.isFinite(range.max) ||
    range.min > range.max
  ) {
    return null;
  }

  const normalized = range.min === range.max ? 0.5 : normalizeElevation(elevation, range);
  const leftStop = normalized <= 0.5 ? ELEVATION_STOPS[0] : ELEVATION_STOPS[1];
  const rightStop = normalized <= 0.5 ? ELEVATION_STOPS[1] : ELEVATION_STOPS[2];
  const interpolation = (normalized - leftStop.at) / (rightStop.at - leftStop.at);
  const channels = leftStop.rgb.map((left, index) =>
    Math.round(left + (rightStop.rgb[index]! - left) * interpolation),
  );
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

export function getFeatureElevationStyle(geojson: GeoJSONValue): FeatureElevationStyle {
  const features = geojson.type === 'FeatureCollection'
    ? geojson.features
    : geojson.type === 'Feature'
      ? [geojson]
      : null;
  const geometries = features
    ? features.map((feature, index) => ({ index, geometry: feature.geometry }))
    : [{ index: 0, geometry: geojson }];
  const measurements = geometries.map(({ index, geometry }) => ({
    index,
    measurement: geometry === null ? null : measureGeoJSONGeometry(geometry),
  }));
  let minimum: number | null = null;
  let maximum: number | null = null;

  for (const { measurement } of measurements) {
    const zMinimum = measurement?.zStatistics.minimum;
    const zMaximum = measurement?.zStatistics.maximum;
    if (zMinimum === null || zMinimum === undefined || zMaximum === null || zMaximum === undefined) continue;
    minimum = minimum === null ? zMinimum : Math.min(minimum, zMinimum);
    maximum = maximum === null ? zMaximum : Math.max(maximum, zMaximum);
  }

  const range = minimum === null || maximum === null ? null : { min: minimum, max: maximum };
  const colors = new Map<number, string>();
  if (range !== null) {
    for (const { index, measurement } of measurements) {
      const color = colorForElevation(measurement?.zStatistics.mean ?? null, range);
      if (color !== null) colors.set(index, color);
    }
  }
  return { range, colors };
}

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function scalePosition(position: unknown[], factor: number): boolean {
  if (position.length < 2 || !position.every((ordinate) => typeof ordinate === 'number')) {
    return false;
  }
  if (position.length < 3) return true;

  const z = position[2];
  if (typeof z !== 'number' || !Number.isFinite(z)) return false;
  const scaledZ = z * factor;
  if (!Number.isFinite(scaledZ)) return false;
  position[2] = scaledZ;
  return true;
}

function scalePositionArray(value: unknown, factor: number): boolean {
  if (!Array.isArray(value)) return false;
  if (value.length === 0) return true;
  if (value.every((ordinate) => typeof ordinate === 'number')) {
    return scalePosition(value, factor);
  }
  return value.every((nested) => scalePositionArray(nested, factor));
}

function scaleGeometry(value: unknown, factor: number): boolean {
  if (!isObject(value) || typeof value.type !== 'string') return false;
  if (value.type === 'GeometryCollection') {
    return Array.isArray(value.geometries)
      && value.geometries.every((geometry) => scaleGeometry(geometry, factor));
  }

  if (
    value.type === 'Point' ||
    value.type === 'MultiPoint' ||
    value.type === 'LineString' ||
    value.type === 'MultiLineString' ||
    value.type === 'Polygon' ||
    value.type === 'MultiPolygon'
  ) {
    return scalePositionArray(value.coordinates, factor);
  }
  return false;
}

function scaleFeature(value: unknown, factor: number): boolean {
  return isObject(value)
    && value.type === 'Feature'
    && (value.geometry === null || scaleGeometry(value.geometry, factor));
}

/**
 * Creates the viewer-owned value for vertical exaggeration. Only existing Z
 * ordinates are scaled from the ellipsoid anchor at zero; the canonical input
 * and its XY coordinates are never modified.
 */
export function scaleGeoJSONHeights(
  input: GeoJSONValue,
  requestedFactor: number,
): GeoJSONValue | null {
  const factor = normalizeVerticalExaggeration(requestedFactor);
  try {
    const copy = JSON.parse(JSON.stringify(input)) as unknown;
    let valid = false;
    if (isObject(copy) && copy.type === 'FeatureCollection') {
      valid = Array.isArray(copy.features)
        && copy.features.every((feature) => scaleFeature(feature, factor));
    } else if (isObject(copy) && copy.type === 'Feature') {
      valid = scaleFeature(copy, factor);
    } else {
      valid = scaleGeometry(copy, factor);
    }
    return valid ? copy as GeoJSONValue : null;
  } catch {
    return null;
  }
}
