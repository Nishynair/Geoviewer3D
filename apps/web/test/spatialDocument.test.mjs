import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSpatialDocument,
  getGeoJSONForViewer,
} from '../.test-dist/spatialDocument.js';
import { addAndFlyToIfCurrent } from '../.test-dist/utils/addViewerDataSource.js';

const featureCollectionText = JSON.stringify({
  type: 'FeatureCollection',
  features: [],
});

test('valid GeoJSON becomes the canonical parsed document and reaches the viewer', () => {
  const document = createSpatialDocument('collection.geojson', featureCollectionText);

  assert.equal(document.source.name, 'collection.geojson');
  assert.equal(document.source.rawText, featureCollectionText);
  assert.equal(document.format, 'geojson');
  assert.deepEqual(document.parsed, { type: 'FeatureCollection', features: [] });
  assert.equal(document.parseError, null);
  assert.equal(document.report, null);
  assert.deepEqual(getGeoJSONForViewer(document), document.parsed);
});

test('valid Feature and bare Geometry documents are accepted', () => {
  const feature = createSpatialDocument(
    'feature.geojson',
    JSON.stringify({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [101.7, 3.1] },
      properties: {},
    }),
  );
  const geometry = createSpatialDocument(
    'geometry.geojson',
    JSON.stringify({ type: 'Point', coordinates: [101.7, 3.1] }),
  );

  assert.equal(feature.parseError, null);
  assert.equal(feature.parsed?.type, 'Feature');
  assert.equal(geometry.parseError, null);
  assert.equal(geometry.parsed?.type, 'Point');
});

test('malformed JSON stays editable as source text and never reaches the viewer', () => {
  const rawText = '{"type":';
  const document = createSpatialDocument('broken.geojson', rawText);

  assert.equal(document.source.rawText, rawText);
  assert.equal(document.parseError?.kind, 'json-syntax');
  assert.equal(document.parsed, null);
  assert.equal(getGeoJSONForViewer(document), null);
});

test('parseable non-GeoJSON is distinct from a JSON syntax error and is blocked from the viewer', () => {
  const rawText = '{"notGeoJSON": true}';
  const document = createSpatialDocument('not-geojson.json', rawText);

  assert.equal(document.source.rawText, rawText);
  assert.equal(document.parseError?.kind, 'invalid-geojson');
  assert.equal(document.parsed, null);
  assert.equal(getGeoJSONForViewer(document), null);
});

test('viewer input returns to valid GeoJSON after an invalid edit is corrected', () => {
  const validBefore = createSpatialDocument('editing.geojson', featureCollectionText);
  const invalidEdit = createSpatialDocument('editing.geojson', '{');
  const validAfter = createSpatialDocument(
    'editing.geojson',
    JSON.stringify({ type: 'Point', coordinates: [101.7, 3.1] }),
  );

  assert.notEqual(getGeoJSONForViewer(validBefore), null);
  assert.equal(getGeoJSONForViewer(invalidEdit), null);
  assert.equal(getGeoJSONForViewer(validAfter)?.type, 'Point');
});

test('a stale data-source add completes without starting a viewer flight', async () => {
  let resolveAdd;
  let isCurrent = true;
  let flightStarted = false;
  const removedSources = [];
  const pendingAdd = new Promise((resolve) => {
    resolveAdd = resolve;
  });
  const source = { id: 'stale-source' };

  const operation = addAndFlyToIfCurrent(source, {
    add: () => pendingAdd,
    remove: (value) => removedSources.push(value),
    flyTo: async () => {
      flightStarted = true;
    },
  }, () => isCurrent);

  isCurrent = false;
  resolveAdd();

  assert.equal(await operation, false);
  assert.equal(flightStarted, false);
  assert.deepEqual(removedSources, [source]);
});

test('a cancelled viewer flight removes its data source when it settles', async () => {
  let resolveFlight;
  let isCurrent = true;
  let flightStarted = false;
  const removedSources = [];
  const pendingFlight = new Promise((resolve) => {
    resolveFlight = resolve;
  });
  const source = { id: 'cancelled-flight-source' };

  const operation = addAndFlyToIfCurrent(source, {
    add: async () => undefined,
    remove: (value) => removedSources.push(value),
    flyTo: () => {
      flightStarted = true;
      return pendingFlight;
    },
  }, () => isCurrent);

  await Promise.resolve();
  assert.equal(flightStarted, true);
  isCurrent = false;
  resolveFlight();

  assert.equal(await operation, false);
  assert.deepEqual(removedSources, [source]);
});
