import assert from 'node:assert/strict';
import { test } from 'vitest';
import { inspectGeoJSON } from '../src/index.ts';

const validCases = [
  {
    input: { type: 'FeatureCollection', features: [] },
    summary: { featureCount: 0, geometryCounts: {} },
    coordinates: {
      coordinateCount: 0,
      dimensions: 'empty',
      bounds: null,
      zRange: null,
    },
  },
  {
    input: { type: 'Feature', geometry: null, properties: null },
    summary: { featureCount: 1, geometryCounts: {} },
    coordinates: {
      coordinateCount: 0,
      dimensions: 'empty',
      bounds: null,
      zRange: null,
    },
  },
  {
    input: { type: 'Point', coordinates: [1, 2] },
    summary: { featureCount: 0, geometryCounts: { Point: 1 } },
    coordinates: {
      coordinateCount: 1,
      dimensions: 'XY',
      bounds: { minX: 1, maxX: 1, minY: 2, maxY: 2 },
      zRange: null,
    },
  },
  {
    input: { type: 'MultiPoint', coordinates: [[1, 2], [3, 4]] },
    summary: { featureCount: 0, geometryCounts: { MultiPoint: 1 } },
    coordinates: {
      coordinateCount: 2,
      dimensions: 'XY',
      bounds: { minX: 1, maxX: 3, minY: 2, maxY: 4 },
      zRange: null,
    },
  },
  {
    input: { type: 'LineString', coordinates: [[1, 2], [3, 4]] },
    summary: { featureCount: 0, geometryCounts: { LineString: 1 } },
    coordinates: {
      coordinateCount: 2,
      dimensions: 'XY',
      bounds: { minX: 1, maxX: 3, minY: 2, maxY: 4 },
      zRange: null,
    },
  },
  {
    input: { type: 'MultiLineString', coordinates: [[[1, 2], [3, 4]]] },
    summary: { featureCount: 0, geometryCounts: { MultiLineString: 1 } },
    coordinates: {
      coordinateCount: 2,
      dimensions: 'XY',
      bounds: { minX: 1, maxX: 3, minY: 2, maxY: 4 },
      zRange: null,
    },
  },
  {
    input: { type: 'Polygon', coordinates: [[[1, 2], [3, 2], [3, 4], [1, 2]]] },
    summary: { featureCount: 0, geometryCounts: { Polygon: 1 } },
    coordinates: {
      coordinateCount: 4,
      dimensions: 'XY',
      bounds: { minX: 1, maxX: 3, minY: 2, maxY: 4 },
      zRange: null,
    },
  },
  {
    input: {
      type: 'MultiPolygon',
      coordinates: [[[[1, 2], [3, 2], [3, 4], [1, 2]]]],
    },
    summary: { featureCount: 0, geometryCounts: { MultiPolygon: 1 } },
    coordinates: {
      coordinateCount: 4,
      dimensions: 'XY',
      bounds: { minX: 1, maxX: 3, minY: 2, maxY: 4 },
      zRange: null,
    },
  },
  {
    input: { type: 'GeometryCollection', geometries: [] },
    summary: { featureCount: 0, geometryCounts: { GeometryCollection: 1 } },
    coordinates: {
      coordinateCount: 0,
      dimensions: 'empty',
      bounds: null,
      zRange: null,
    },
  },
  {
    input: {
      type: 'GeometryCollection',
      geometries: [{ type: 'Point', coordinates: [1, 2] }],
    },
    summary: {
      featureCount: 0,
      geometryCounts: { GeometryCollection: 1, Point: 1 },
    },
    coordinates: {
      coordinateCount: 1,
      dimensions: 'XY',
      bounds: { minX: 1, maxX: 1, minY: 2, maxY: 2 },
      zRange: null,
    },
  },
  {
    input: {
      type: 'GeometryCollection',
      geometries: [{ type: 'GeometryCollection', geometries: [] }],
    },
    summary: { featureCount: 0, geometryCounts: { GeometryCollection: 2 } },
    coordinates: {
      coordinateCount: 0,
      dimensions: 'empty',
      bounds: null,
      zRange: null,
    },
  },
];

function nestedCollectionFixture() {
  return {
    type: 'GeometryCollection',
    geometries: [
      { type: 'Point', coordinates: [1, 2, 5] },
      {
        type: 'GeometryCollection',
        source: 'preserve this foreign member',
        geometries: [{ type: 'LineString', coordinates: [[1, 2], [3, 4]] }],
      },
    ],
  };
}

test('summarizes every standard GeoJSON root, including a null Feature geometry', () => {
  for (const { input, summary, coordinates } of validCases) {
    assert.deepEqual(inspectGeoJSON(input), {
      valid: true,
      summary,
      coordinates,
      diagnostics: [],
    });
  }
});

test('returns an independent valid report for each call', () => {
  const first = inspectGeoJSON(validCases[2].input);
  first.diagnostics.push({
    code: 'invalid-geojson',
    severity: 'error',
    message: 'caller mutation',
  });
  first.summary.geometryCounts.Point = 42;
  first.coordinates.coordinateCount = 42;
  first.coordinates.bounds.minX = 42;

  assert.deepEqual(inspectGeoJSON(validCases[2].input), {
    valid: true,
    summary: validCases[2].summary,
    coordinates: validCases[2].coordinates,
    diagnostics: [],
  });
});

test('returns stable invalid-input diagnostics for parseable non-GeoJSON values', () => {
  const invalidInput = { type: 'Feature', geometry: null };
  const first = inspectGeoJSON(invalidInput);
  const second = inspectGeoJSON(invalidInput);

  assert.deepEqual(first, second);
  assert.equal(first.valid, false);
  assert.equal(first.summary, null);
  assert.equal(first.coordinates, null);
  assert.ok(first.diagnostics.length > 0);
  for (const diagnostic of first.diagnostics) {
    assert.equal(diagnostic.code, 'invalid-geojson');
    assert.equal(diagnostic.severity, 'error');
    assert.equal(typeof diagnostic.message, 'string');
    assert.ok(diagnostic.message.length > 0);
  }
});

test('does not treat raw JSON text as an already-parsed GeoJSON value', () => {
  const result = inspectGeoJSON('{"type":"Point","coordinates":[1,2]}');

  assert.equal(result.valid, false);
  assert.equal(result.diagnostics[0]?.code, 'invalid-geojson');
});

test('returns an invalid outcome instead of throwing for unsupported values', () => {
  const circular = {};
  circular.self = circular;

  for (const input of [null, undefined, 1, [], circular]) {
    assert.doesNotThrow(() => inspectGeoJSON(input));
    const result = inspectGeoJSON(input);
    assert.equal(result.valid, false);
    assert.equal(result.summary, null);
    assert.equal(result.coordinates, null);
  }
});

test('counts nested GeometryCollections at geometry, Feature, and FeatureCollection roots', () => {
  const expectedGeometryCounts = {
    GeometryCollection: 2,
    Point: 1,
    LineString: 1,
  };
  const cases = [
    {
      input: nestedCollectionFixture(),
      featureCount: 0,
    },
    {
      input: {
        type: 'Feature',
        geometry: nestedCollectionFixture(),
        properties: {},
      },
      featureCount: 1,
    },
    {
      input: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: nestedCollectionFixture(),
            properties: {},
          },
          { type: 'Feature', properties: null, geometry: null },
        ],
      },
      featureCount: 2,
    },
  ];

  for (const { input, featureCount } of cases) {
    const originalText = JSON.stringify(input);
    assert.deepEqual(inspectGeoJSON(input), {
      valid: true,
      summary: { featureCount, geometryCounts: expectedGeometryCounts },
      coordinates: {
        coordinateCount: 3,
        dimensions: 'mixed',
        bounds: { minX: 1, maxX: 3, minY: 2, maxY: 4 },
        zRange: { min: 5, max: 5 },
      },
      diagnostics: [],
    });
    assert.equal(JSON.stringify(input), originalText);
  }
});

test('rejects invalid members and metadata inside nested GeometryCollections', () => {
  const invalidInputs = [
    {
      type: 'GeometryCollection',
      geometries: [
        { type: 'GeometryCollection', geometries: [{ type: 'Circle' }] },
      ],
    },
    {
      type: 'GeometryCollection',
      geometries: [
        { type: 'GeometryCollection', geometries: [], bbox: [0, 1, 2] },
      ],
    },
    {
      type: 'GeometryCollection',
      geometries: [
        { type: 'GeometryCollection', geometries: [], properties: {} },
      ],
    },
    {
      type: 'GeometryCollection',
      geometries: [{ type: 'GeometryCollection', geometries: null }],
    },
    {
      type: 'GeometryCollection',
      geometries: [{ type: 'GeometryCollection', geometries: [null] }],
    },
  ];

  for (const input of invalidInputs) {
    const first = inspectGeoJSON(input);
    assert.deepEqual(first, inspectGeoJSON(input));
    assert.equal(first.valid, false);
    assert.equal(first.summary, null);
    assert.equal(first.coordinates, null);
    assert.ok(first.diagnostics.length > 0);
  }
});

test('counts closed ring tuples and reports XYZ bounds and Z range', () => {
  const input = {
    type: 'Polygon',
    coordinates: [[[1, 2, 5], [4, 2, 7], [4, 6, 9], [1, 2, 5]]],
  };

  assert.deepEqual(inspectGeoJSON(input), {
    valid: true,
    summary: { featureCount: 0, geometryCounts: { Polygon: 1 } },
    coordinates: {
      coordinateCount: 4,
      dimensions: 'XYZ',
      bounds: { minX: 1, maxX: 4, minY: 2, maxY: 6 },
      zRange: { min: 5, max: 9 },
    },
    diagnostics: [],
  });
});

test('reports zero and negative Z values without interpreting altitude', () => {
  const input = {
    type: 'MultiPoint',
    coordinates: [[-8, 3, 0], [6, -4, -12]],
  };

  assert.deepEqual(inspectGeoJSON(input), {
    valid: true,
    summary: { featureCount: 0, geometryCounts: { MultiPoint: 1 } },
    coordinates: {
      coordinateCount: 2,
      dimensions: 'XYZ',
      bounds: { minX: -8, maxX: 6, minY: -4, maxY: 3 },
      zRange: { min: -12, max: 0 },
    },
    diagnostics: [],
  });
});
