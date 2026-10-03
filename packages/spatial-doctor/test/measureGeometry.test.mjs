import assert from 'node:assert/strict';
import { test } from 'vitest';
import { measureGeoJSONGeometry } from '../src/index.ts';

const zLine = {
  type: 'LineString',
  coordinates: [[0, 0, 0], [0, 0.001, 10], [0, 0.002, 20]],
};

function assertOnlyFiniteNumbers(value) {
  if (typeof value === 'number') {
    assert.ok(Number.isFinite(value), `expected finite number, got ${value}`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(assertOnlyFiniteNumbers);
    return;
  }
  if (typeof value === 'object' && value !== null) {
    Object.values(value).forEach(assertOnlyFiniteNumbers);
  }
}

test('reports ordered Z profile and 2D, 3D, and segment grade for a complete line', () => {
  const result = measureGeoJSONGeometry(zLine);

  assert.ok(result);
  assert.deepEqual(result.coordinateZ, [
    { path: [0], longitude: 0, latitude: 0, z: 0 },
    { path: [1], longitude: 0, latitude: 0.001, z: 10 },
    { path: [2], longitude: 0, latitude: 0.002, z: 20 },
  ]);
  assert.equal(result.dimensions, 'XYZ');
  assert.equal(result.zRange?.min, 0);
  assert.equal(result.zRange?.max, 20);
  assert.deepEqual(result.zStatistics, {
    minimum: 0,
    maximum: 20,
    mean: 10,
    measuredCoordinates: 3,
    missingCoordinates: 0,
  });
  assert.equal(result.lineProfiles.length, 1);
  const [line] = result.lineProfiles;
  assert.deepEqual(line?.path, []);
  assert.equal(line?.horizontalLength.complete, true);
  assert.equal(line?.horizontalLength.measuredSegments, 2);
  assert.equal(line?.horizontalLength.totalSegments, 2);
  assert.equal(line?.threeDimensionalLength.complete, true);
  assert.equal(line?.threeDimensionalLength.measuredSegments, 2);
  assert.ok((line?.horizontalLength.meters ?? 0) > 220);
  assert.ok((line?.threeDimensionalLength.meters ?? 0) > (line?.horizontalLength.meters ?? 0));
  assert.ok((line?.segments[0]?.gradePercent ?? 0) > 0);
  assert.ok((line?.coordinates[2]?.distanceAlongMeters ?? 0) > (line?.coordinates[1]?.distanceAlongMeters ?? 0));
});

test('keeps horizontal measurement when Z is missing and marks 3D coverage partial', () => {
  const result = measureGeoJSONGeometry({
    type: 'LineString',
    coordinates: [[0, 0, 10], [0, 0.001, 20], [0, 0.002]],
  });

  assert.ok(result);
  assert.equal(result.dimensions, 'mixed');
  assert.deepEqual(result.coordinateZ.map(({ z }) => z), [10, 20, null]);
  assert.deepEqual(result.zStatistics, {
    minimum: 10,
    maximum: 20,
    mean: 15,
    measuredCoordinates: 2,
    missingCoordinates: 1,
  });
  const [line] = result.lineProfiles;
  assert.equal(line?.horizontalLength.complete, true);
  assert.equal(line?.threeDimensionalLength.complete, false);
  assert.equal(line?.threeDimensionalLength.measuredSegments, 1);
  assert.equal(line?.threeDimensionalLength.totalSegments, 2);
  assert.ok((line?.threeDimensionalLength.meters ?? 0) > 0);
  assert.equal(line?.segments[1]?.distance3DMeters, null);
  assert.equal(line?.segments[1]?.gradePercent, null);
});

test('marks horizontal and cumulative profile coverage partial for unsupported longitude', () => {
  const result = measureGeoJSONGeometry({
    type: 'LineString',
    coordinates: [[0, 0, 0], [0, 1, 1], [200, 1, 2]],
  });

  assert.ok(result);
  const [line] = result.lineProfiles;
  assert.equal(line?.horizontalLength.complete, false);
  assert.equal(line?.horizontalLength.measuredSegments, 1);
  assert.equal(line?.horizontalLength.totalSegments, 2);
  assert.equal(line?.threeDimensionalLength.complete, false);
  assert.equal(line?.segments[1]?.horizontalMeters, null);
  assert.equal(line?.segments[1]?.distance3DMeters, null);
  assert.equal(line?.coordinates[2]?.distanceAlongMeters, null);
});

test('does not report a 3D zero when all line coordinates lack Z', () => {
  const result = measureGeoJSONGeometry({
    type: 'LineString',
    coordinates: [[0, 0], [0, 0.001]],
  });

  assert.ok(result);
  assert.deepEqual(result.zStatistics, {
    minimum: null,
    maximum: null,
    mean: null,
    measuredCoordinates: 0,
    missingCoordinates: 2,
  });
  const [line] = result.lineProfiles;
  assert.equal(line?.threeDimensionalLength.meters, null);
  assert.equal(line?.threeDimensionalLength.measuredSegments, 0);
  assert.equal(line?.threeDimensionalLength.totalSegments, 1);
  assert.equal(line?.threeDimensionalLength.complete, false);
  assert.equal(line?.segments[0]?.gradePercent, null);
});

test('reports Z values for non-line coordinates without inventing a line measurement', () => {
  const result = measureGeoJSONGeometry({
    type: 'Polygon',
    coordinates: [[[0, 0, 1], [1, 0], [1, 1, 5], [0, 0, 1]]],
  });

  assert.ok(result);
  assert.equal(result.dimensions, 'mixed');
  assert.deepEqual(result.coordinateZ.map(({ path, z }) => ({ path, z })), [
    { path: [0, 0], z: 1 },
    { path: [0, 1], z: null },
    { path: [0, 2], z: 5 },
    { path: [0, 3], z: 1 },
  ]);
  assert.deepEqual(result.zStatistics, {
    minimum: 1,
    maximum: 5,
    mean: 7 / 3,
    measuredCoordinates: 3,
    missingCoordinates: 1,
  });
  assert.deepEqual(result.lineProfiles, []);
  assert.equal(result.horizontalLength.meters, null);
  assert.equal(result.threeDimensionalLength.meters, null);
});

test('keeps MultiLineString components separate and never adds a bridge segment', () => {
  const result = measureGeoJSONGeometry({
    type: 'MultiLineString',
    coordinates: [
      [[0, 0, 0], [0, 0.001, 0]],
      [[20, 20, 0], [20, 20.001, 0]],
    ],
  });

  assert.ok(result);
  assert.deepEqual(result.lineProfiles.map(({ path }) => path), [[0], [1]]);
  assert.deepEqual(result.lineProfiles.map(({ horizontalLength }) => horizontalLength.totalSegments), [1, 1]);
  assert.equal(result.horizontalLength.totalSegments, 2);
  assert.ok((result.horizontalLength.meters ?? 0) < 300);
});

test('tracks a line nested in a GeometryCollection and reports a zero-run grade as unavailable', () => {
  const result = measureGeoJSONGeometry({
    type: 'GeometryCollection',
    geometries: [
      { type: 'Point', coordinates: [4, 5, 6] },
      {
        type: 'GeometryCollection',
        geometries: [{ type: 'LineString', coordinates: [[1, 2, 0], [1, 2, 5]] }],
      },
    ],
  });

  assert.ok(result);
  assert.deepEqual(result.lineProfiles.map(({ path }) => path), [[1, 0]]);
  assert.equal(result.lineProfiles[0]?.segments[0]?.horizontalMeters, 0);
  assert.equal(result.lineProfiles[0]?.segments[0]?.gradePercent, null);
  assert.equal(result.coordinateZ.length, 3);
  assert.deepEqual(result.coordinateZ.map(({ path }) => path), [[0], [1, 0, 0], [1, 0, 1]]);
});

test('returns unavailable for non-geometry or invalid coordinate input without throwing', () => {
  for (const input of [null, { type: 'Feature', geometry: null }, { type: 'LineString', coordinates: [] }]) {
    assert.doesNotThrow(() => measureGeoJSONGeometry(input));
    assert.equal(measureGeoJSONGeometry(input), null);
  }
});

test('keeps Z means and deltas finite for valid extreme finite ordinates', () => {
  const result = measureGeoJSONGeometry({
    type: 'LineString',
    coordinates: [[0, 0, 1e308], [0, 0.001, 1e308], [0, 0.002, -1e308], [0, 0.003, 1e308]],
  });

  assert.ok(result);
  assert.equal(result.zStatistics.minimum, -1e308);
  assert.equal(result.zStatistics.maximum, 1e308);
  assert.equal(result.zStatistics.mean, 5e307);
  assert.equal(result.lineProfiles[0]?.segments[1]?.verticalChangeMeters, null);
  assert.equal(result.lineProfiles[0]?.segments[1]?.distance3DMeters, null);
  assert.equal(result.lineProfiles[0]?.segments[1]?.gradePercent, null);
  assert.equal(result.threeDimensionalLength.measuredSegments, 1);
  assertOnlyFiniteNumbers(result);
});

test('marks an unrepresentable aggregate 3D length and grade unavailable', () => {
  const result = measureGeoJSONGeometry({
    type: 'LineString',
    coordinates: [[0, 0, 0], [0, 0.000000001, 1.1e308], [0, 0.000000002, 0]],
  });

  assert.ok(result);
  assert.equal(result.lineProfiles[0]?.segments[0]?.gradePercent, null);
  assert.equal(result.threeDimensionalLength.meters, null);
  assert.equal(result.threeDimensionalLength.rangeExceeded, true);
  assert.equal(result.threeDimensionalLength.measuredSegments, 2);
  assert.equal(result.threeDimensionalLength.complete, false);
  assertOnlyFiniteNumbers(result);
});
