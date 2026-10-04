import { inspectGeoJSON, type InspectionReport } from '@nish-andran/spatial-doctor';

export type GeoJSONRepairKind =
  | 'remove-duplicate-vertices'
  | 'close-unclosed-rings'
  | 'remove-z';

export interface RepairSourceSnapshot {
  name: string;
  rawText: string;
}

export interface RepairMeasurements {
  coordinatePositionsBefore: number;
  coordinatePositionsAfter: number;
  duplicatePositionsRemoved: number;
  ringsClosed: number;
  zOrdinatesRemoved: number;
  bboxZRangesRemoved: number;
}

export type GeoJSONRepairPreview =
  | {
      status: 'ready';
      kind: GeoJSONRepairKind;
      source: RepairSourceSnapshot;
      outputRawText: string;
      measurements: RepairMeasurements;
    }
  | {
      status: 'unavailable';
      kind: GeoJSONRepairKind;
      source: RepairSourceSnapshot;
      reason: string;
    };

export interface AppliedGeoJSONRepair {
  previous: RepairSourceSnapshot;
  current: RepairSourceSnapshot;
}

type MutableRecord = Record<string, unknown>;
type SequenceKind = 'point' | 'multi-point' | 'line' | 'ring';
type RepairInspector = (input: unknown) => InspectionReport;

const GEOMETRY_TYPES = new Set([
  'Point',
  'MultiPoint',
  'LineString',
  'MultiLineString',
  'Polygon',
  'MultiPolygon',
  'GeometryCollection',
]);

function isRecord(value: unknown): value is MutableRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isGeometry(value: unknown): value is MutableRecord {
  return isRecord(value) && typeof value.type === 'string' && GEOMETRY_TYPES.has(value.type);
}

function samePosition(left: unknown, right: unknown): boolean {
  return Array.isArray(left)
    && Array.isArray(right)
    && left.length === right.length
    && left.every((ordinate, index) => ordinate === right[index]);
}

function isConsistentPositionSequence(value: unknown): value is number[][] {
  if (!Array.isArray(value) || value.length === 0) return false;
  const dimension = Array.isArray(value[0]) ? value[0].length : -1;
  return (dimension === 2 || dimension === 3)
    && value.every((position) =>
      Array.isArray(position)
      && position.length === dimension
      && position.every((ordinate) => typeof ordinate === 'number' && Number.isFinite(ordinate)),
    );
}

function visitGeometry(
  geometry: unknown,
  visitObject: (object: MutableRecord) => string | null,
  visitSequence: (sequence: unknown, kind: SequenceKind) => string | null,
): string | null {
  if (!isGeometry(geometry)) return null;
  const objectFailure = visitObject(geometry);
  if (objectFailure) return objectFailure;

  const coordinates = geometry.coordinates;
  switch (geometry.type) {
    case 'Point':
      return visitSequence(coordinates, 'point');
    case 'MultiPoint':
      return visitSequence(coordinates, 'multi-point');
    case 'LineString':
      return visitSequence(coordinates, 'line');
    case 'MultiLineString':
      if (Array.isArray(coordinates)) {
        for (const line of coordinates) {
          const failure = visitSequence(line, 'line');
          if (failure) return failure;
        }
      }
      return null;
    case 'Polygon':
      if (Array.isArray(coordinates)) {
        for (const ring of coordinates) {
          const failure = visitSequence(ring, 'ring');
          if (failure) return failure;
        }
      }
      return null;
    case 'MultiPolygon':
      if (Array.isArray(coordinates)) {
        for (const polygon of coordinates) {
          if (!Array.isArray(polygon)) continue;
          for (const ring of polygon) {
            const failure = visitSequence(ring, 'ring');
            if (failure) return failure;
          }
        }
      }
      return null;
    case 'GeometryCollection':
      if (Array.isArray(geometry.geometries)) {
        for (const child of geometry.geometries) {
          const failure = visitGeometry(child, visitObject, visitSequence);
          if (failure) return failure;
        }
      }
      return null;
  }
  return null;
}

function visitDocument(
  value: unknown,
  visitObject: (object: MutableRecord) => string | null,
  visitSequence: (sequence: unknown, kind: SequenceKind) => string | null,
): string | null {
  if (!isRecord(value)) return null;
  const rootFailure = visitObject(value);
  if (rootFailure) return rootFailure;

  if (value.type === 'FeatureCollection') {
    if (!Array.isArray(value.features)) return null;
    for (const feature of value.features) {
      if (!isRecord(feature)) continue;
      const featureFailure = visitObject(feature);
      if (featureFailure) return featureFailure;
      const geometryFailure = visitGeometry(feature.geometry, visitObject, visitSequence);
      if (geometryFailure) return geometryFailure;
    }
    return null;
  }

  if (value.type === 'Feature') {
    return visitGeometry(value.geometry, visitObject, visitSequence);
  }

  return visitGeometry(value, visitObject, visitSequence);
}

function countGeometryPositions(geometry: unknown): number {
  if (!isGeometry(geometry)) return 0;
  const coordinates = geometry.coordinates;
  switch (geometry.type) {
    case 'Point':
      return Array.isArray(coordinates) ? 1 : 0;
    case 'MultiPoint':
    case 'LineString':
      return Array.isArray(coordinates) ? coordinates.filter(Array.isArray).length : 0;
    case 'MultiLineString':
    case 'Polygon':
      return Array.isArray(coordinates)
        ? coordinates.reduce<number>((count, sequence) => count + (Array.isArray(sequence) ? sequence.filter(Array.isArray).length : 0), 0)
        : 0;
    case 'MultiPolygon':
      return Array.isArray(coordinates)
        ? coordinates.reduce<number>((count, polygon) =>
          count + (Array.isArray(polygon)
            ? polygon.reduce<number>((polygonCount, sequence) =>
              polygonCount + (Array.isArray(sequence) ? sequence.filter(Array.isArray).length : 0), 0)
            : 0), 0)
        : 0;
    case 'GeometryCollection':
      return Array.isArray(geometry.geometries)
        ? geometry.geometries.reduce<number>((count, child) => count + countGeometryPositions(child), 0)
        : 0;
  }
  return 0;
}

function countDocumentPositions(value: unknown): number {
  if (!isRecord(value)) return 0;
  if (value.type === 'FeatureCollection' && Array.isArray(value.features)) {
    return value.features.reduce<number>((count, feature) =>
      count + (isRecord(feature) ? countGeometryPositions(feature.geometry) : 0), 0);
  }
  if (value.type === 'Feature') return countGeometryPositions(value.geometry);
  return countGeometryPositions(value);
}

function reject(
  kind: GeoJSONRepairKind,
  source: RepairSourceSnapshot,
  reason: string,
): GeoJSONRepairPreview {
  return { status: 'unavailable', kind, source: { ...source }, reason };
}

function transformDuplicates(value: unknown): { changed: number; reason: string | null } {
  let removed = 0;
  const reason = visitDocument(value, () => null, (sequence, kind) => {
    if (kind === 'point' || !Array.isArray(sequence)) return null;
    const deduplicated: unknown[] = [];
    let sequenceRemoved = 0;
    for (const position of sequence) {
      if (deduplicated.length > 0 && samePosition(deduplicated[deduplicated.length - 1], position)) {
        removed += 1;
        sequenceRemoved += 1;
      } else {
        deduplicated.push(position);
      }
    }
    if (sequenceRemoved > 0 && kind === 'line' && deduplicated.length < 2) {
      return 'Removing duplicates would leave a line with fewer than two positions.';
    }
    if (sequenceRemoved > 0 && kind === 'ring') {
      const distinct = new Set(deduplicated.map((position) => JSON.stringify(position)));
      if (deduplicated.length < 4 || !samePosition(deduplicated[0], deduplicated[deduplicated.length - 1])) {
        return 'Removing duplicates would leave a polygon ring invalid.';
      }
      if (distinct.size < 3) return 'Removing duplicates would leave a polygon ring degenerate.';
    }
    sequence.splice(0, sequence.length, ...deduplicated);
    return null;
  });
  return { changed: removed, reason };
}

function transformOpenRings(value: unknown): { changed: number; reason: string | null } {
  let closed = 0;
  const reason = visitDocument(value, () => null, (sequence, kind) => {
    if (kind !== 'ring' || !Array.isArray(sequence) || sequence.length === 0) return null;
    if (!isConsistentPositionSequence(sequence)) {
      return 'An open ring is malformed or mixes coordinate dimensions and was left unchanged.';
    }
    if (samePosition(sequence[0], sequence[sequence.length - 1])) return null;
    const distinct = new Set(sequence.map((position) => JSON.stringify(position)));
    if (sequence.length < 3 || distinct.size < 3) {
      return 'An open ring needs at least three distinct valid vertices to be closed.';
    }
    sequence.push([...sequence[0]]);
    closed += 1;
    return null;
  });
  return { changed: closed, reason };
}

function transformZ(value: unknown): { changed: number; bboxRanges: number; reason: string | null } {
  let removed = 0;
  let bboxRanges = 0;
  const reason = visitDocument(value, (object) => {
    const bbox = object.bbox;
    if (Array.isArray(bbox) && bbox.length !== 4 && bbox.length !== 6) {
      return 'A bounding box must have four or six values before Z can be removed.';
    }
    return null;
  }, (sequence, kind) => {
    const positions = kind === 'point' ? [sequence] : sequence;
    if (!Array.isArray(positions)) return null;
    for (const position of positions) {
      if (!Array.isArray(position)) return 'A coordinate position is malformed and was left unchanged.';
      if (position.length > 3) return 'Positions with more than three ordinates are unsupported for Z removal.';
      if (position.length !== 2 && position.length !== 3) {
        return 'Coordinate positions must have two or three ordinates for Z removal.';
      }
      if (position.length === 3) {
        position.splice(2, 1);
        removed += 1;
      }
    }
    return null;
  });
  if (reason || removed === 0) return { changed: removed, bboxRanges, reason };

  const bboxFailure = visitDocument(value, (object) => {
    const bbox = object.bbox;
    if (!Array.isArray(bbox) || bbox.length !== 6) return null;
    object.bbox = [bbox[0], bbox[1], bbox[3], bbox[4]];
    bboxRanges += 1;
    return null;
  }, () => null);
  return { changed: removed, bboxRanges, reason: bboxFailure };
}

export function previewGeoJSONRepair(
  source: RepairSourceSnapshot,
  kind: GeoJSONRepairKind,
  inspect: RepairInspector = inspectGeoJSON,
): GeoJSONRepairPreview {
  let candidate: unknown;
  try {
    candidate = JSON.parse(source.rawText) as unknown;
  } catch {
    return reject(kind, source, 'Repair previews require syntactically valid JSON.');
  }

  const positionsBefore = countDocumentPositions(candidate);
  let changes: number;
  let bboxRangesRemoved = 0;
  let reason: string | null;
  if (kind === 'remove-duplicate-vertices') {
    ({ changed: changes, reason } = transformDuplicates(candidate));
  } else if (kind === 'close-unclosed-rings') {
    ({ changed: changes, reason } = transformOpenRings(candidate));
  } else {
    ({ changed: changes, bboxRanges: bboxRangesRemoved, reason } = transformZ(candidate));
  }

  if (reason) return reject(kind, source, reason);
  if (changes === 0) {
    const noChangeReason = kind === 'remove-duplicate-vertices'
      ? 'No consecutive duplicate vertices were found.'
      : kind === 'close-unclosed-rings'
        ? 'No unclosed polygon rings were found.'
        : 'No XYZ coordinate positions were found.';
    return reject(kind, source, noChangeReason);
  }

  const report = inspect(candidate);
  if (!report.valid) {
    const diagnostic = report.diagnostics[0]?.message;
    return reject(
      kind,
      source,
      diagnostic
        ? `The proposed result is still invalid GeoJSON: ${diagnostic}`
        : 'The proposed result is still invalid GeoJSON.',
    );
  }

  return {
    status: 'ready',
    kind,
    source: { ...source },
    outputRawText: JSON.stringify(candidate, null, 2),
    measurements: {
      coordinatePositionsBefore: positionsBefore,
      coordinatePositionsAfter: countDocumentPositions(candidate),
      duplicatePositionsRemoved: kind === 'remove-duplicate-vertices' ? changes : 0,
      ringsClosed: kind === 'close-unclosed-rings' ? changes : 0,
      zOrdinatesRemoved: kind === 'remove-z' ? changes : 0,
      bboxZRangesRemoved: bboxRangesRemoved,
    },
  };
}

export function applyRepairPreview(
  current: RepairSourceSnapshot,
  preview: GeoJSONRepairPreview,
): AppliedGeoJSONRepair | null {
  if (
    preview.status !== 'ready'
    || current.name !== preview.source.name
    || current.rawText !== preview.source.rawText
  ) {
    return null;
  }
  return {
    previous: { ...current },
    current: { name: current.name, rawText: preview.outputRawText },
  };
}

export function undoAppliedRepair(
  current: RepairSourceSnapshot,
  applied: AppliedGeoJSONRepair,
): RepairSourceSnapshot | null {
  if (current.name !== applied.current.name || current.rawText !== applied.current.rawText) return null;
  return { ...applied.previous };
}
