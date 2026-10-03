import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectGeoJSON } from '../.test-dist/index.js';

const validDocuments = [
  {
    type: 'FeatureCollection',
    features: [],
  },
  {
    type: 'Feature',
    geometry: null,
    properties: null,
  },
  { type: 'Point', coordinates: [1, 2] },
  { type: 'MultiPoint', coordinates: [[1, 2], [3, 4]] },
  { type: 'LineString', coordinates: [[1, 2], [3, 4]] },
  { type: 'MultiLineString', coordinates: [[[1, 2], [3, 4]]] },
  { type: 'Polygon', coordinates: [[[1, 2], [3, 2], [3, 4], [1, 2]]] },
  {
    type: 'MultiPolygon',
    coordinates: [[[[1, 2], [3, 2], [3, 4], [1, 2]]]],
  },
  {
    type: 'GeometryCollection',
    geometries: [{ type: 'Point', coordinates: [1, 2] }],
  },
];

test('accepts each standard GeoJSON root form, including a null Feature geometry', () => {
  for (const input of validDocuments) {
    assert.deepEqual(inspectGeoJSON(input), { valid: true, diagnostics: [] });
  }
});

test('returns an independent valid report for each call', () => {
  const first = inspectGeoJSON(validDocuments[0]);
  first.diagnostics.push({
    code: 'invalid-geojson',
    severity: 'error',
    message: 'caller mutation',
  });

  assert.deepEqual(inspectGeoJSON(validDocuments[0]), {
    valid: true,
    diagnostics: [],
  });
});

test('returns stable invalid-input diagnostics for parseable non-GeoJSON values', () => {
  const invalidInput = { type: 'Feature', geometry: null };
  const first = inspectGeoJSON(invalidInput);
  const second = inspectGeoJSON(invalidInput);

  assert.deepEqual(first, second);
  assert.equal(first.valid, false);
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
    assert.equal(inspectGeoJSON(input).valid, false);
  }
});
