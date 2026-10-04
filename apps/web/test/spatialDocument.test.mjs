import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  createSpatialDocument as createSpatialDocumentImpl,
  getGeoJSONForViewer,
} from '../src/spatialDocument.ts';
import { addAndFlyToIfCurrent } from '../src/utils/addViewerDataSource.ts';
import { inspectGeoJSON } from '@nish-andran/spatial-doctor';

function createSpatialDocument(name, rawText, inspect = inspectGeoJSON) {
  return createSpatialDocumentImpl(name, rawText, inspect);
}

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
  assert.deepEqual(document.report, inspectGeoJSON(document.parsed));
  assert.deepEqual(getGeoJSONForViewer(document), document.parsed);
});

test('keeps valid features viewable while removing out-of-range coordinates from Cesium input', () => {
  const rawText = JSON.stringify({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: { type: 'Point', coordinates: [181, 2] },
      },
      {
        type: 'Feature',
        properties: {},
        geometry: { type: 'Point', coordinates: [10, 20] },
      },
    ],
  });
  const document = createSpatialDocument('range.geojson', rawText);
  const viewerValue = getGeoJSONForViewer(document);

  assert.equal(document.report?.valid, true);
  assert.equal(document.report?.diagnostics[0]?.code, 'coordinate-out-of-range');
  assert.notEqual(viewerValue, null);
  assert.equal(viewerValue.features[0].geometry, null);
  assert.deepEqual(viewerValue.features[1].geometry, document.parsed.features[1].geometry);
  assert.deepEqual(document.parsed.features[0].geometry.coordinates, [181, 2]);
});

test('does not pass unlocatable out-of-range geometry to Cesium', () => {
  const document = createSpatialDocument(
    'range.geojson',
    JSON.stringify({ type: 'Point', coordinates: [181, 2] }),
  );

  assert.equal(document.report?.valid, true);
  assert.equal(document.report?.diagnostics[0]?.code, 'coordinate-out-of-range');
  assert.equal(getGeoJSONForViewer(document), null);
});

test('valid canonical documents preserve optional feature and source references in the report', () => {
  const input = {
    type: 'Feature',
    id: 'tower',
    properties: {},
    geometry: { type: 'Point', coordinates: [101.7, 3.1] },
  };
  const rawText = JSON.stringify(input);
  const baseReport = inspectGeoJSON(input);
  const referencedReport = {
    ...baseReport,
    diagnostics: [{
      code: 'invalid-geojson',
      severity: 'warning',
      message: 'Feature scoped diagnostic fixture',
      featureId: 'tower',
      featureIndex: 0,
      sourceLocation: { start: 2, end: 18 },
    }],
  };
  const document = createSpatialDocument('tower.geojson', rawText, () => referencedReport);

  assert.equal(document.report?.valid, true);
  assert.deepEqual(document.report?.diagnostics, referencedReport.diagnostics);
  assert.deepEqual(getGeoJSONForViewer(document), input);
});

test('inspects parsed values once and never sends malformed source to the inspector', () => {
  const received = [];
  const inspect = (value) => {
    received.push(value);
    return inspectGeoJSON(value);
  };
  const input = { type: 'Point', coordinates: [101.7, 3.1] };
  const rawText = JSON.stringify(input);
  const valid = createSpatialDocument('point.geojson', rawText, inspect);

  assert.deepEqual(received, [input]);
  assert.deepEqual(valid.parsed, input);
  assert.equal(valid.report?.valid, true);

  const syntaxError = createSpatialDocument('broken.geojson', '{"type":', inspect);
  assert.equal(syntaxError.parseError?.kind, 'json-syntax');
  assert.equal(syntaxError.report, null);
  assert.deepEqual(received, [input]);

  const invalidValue = { type: 'Circle', coordinates: [101.7, 3.1] };
  const invalid = createSpatialDocument(
    'invalid.geojson',
    JSON.stringify(invalidValue),
    inspect,
  );
  assert.deepEqual(received, [input, invalidValue]);
  assert.equal(invalid.parseError?.kind, 'invalid-geojson');
  assert.equal(invalid.report?.valid, false);
  assert.equal(getGeoJSONForViewer(invalid), null);
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
  assert.equal(document.report, null);
  assert.equal(document.parsed, null);
  assert.equal(getGeoJSONForViewer(document), null);
});

test('parseable non-GeoJSON is distinct from a JSON syntax error and is blocked from the viewer', () => {
  const rawText = '{"notGeoJSON": true}';
  const document = createSpatialDocument('not-geojson.json', rawText);

  assert.equal(document.source.rawText, rawText);
  assert.equal(document.parseError?.kind, 'invalid-geojson');
  assert.equal(document.report?.valid, false);
  assert.deepEqual(document.report?.summary, null);
  assert.deepEqual(document.report?.coordinates, null);
  assert.equal(document.report?.diagnostics[0]?.code, 'invalid-geojson');
  const sourceLocation = document.report?.diagnostics[0]?.sourceLocation;
  assert.notEqual(sourceLocation, undefined);
  assert.ok(sourceLocation.end <= rawText.length);
  assert.equal(JSON.parse(rawText.slice(sourceLocation.start, sourceLocation.end)).notGeoJSON, true);
  assert.equal(document.parsed, null);
  assert.equal(getGeoJSONForViewer(document), null);
});

test('nested GeometryCollections accepted by inspection remain viewer eligible', () => {
  const value = {
    type: 'GeometryCollection',
    geometries: [
      { type: 'GeometryCollection', geometries: [{ type: 'Point', coordinates: [1, 2] }] },
    ],
  };
  const document = createSpatialDocument('nested.geojson', JSON.stringify(value));

  assert.equal(document.report?.valid, true);
  assert.deepEqual(document.report?.summary.geometryCounts, {
    GeometryCollection: 2,
    Point: 1,
  });
  assert.deepEqual(getGeoJSONForViewer(document), value);
});

test('viewer input returns to valid GeoJSON after an invalid edit is corrected', () => {
  const validBefore = createSpatialDocument('editing.geojson', featureCollectionText);
  const invalidEdit = createSpatialDocument('editing.geojson', '{');
  const validAfter = createSpatialDocument(
    'editing.geojson',
    JSON.stringify({ type: 'Point', coordinates: [101.7, 3.1] }),
  );

  assert.notEqual(getGeoJSONForViewer(validBefore), null);
  assert.equal(validBefore.report?.valid, true);
  assert.equal(getGeoJSONForViewer(invalidEdit), null);
  assert.equal(invalidEdit.report, null);
  assert.equal(invalidEdit.parseError?.kind, 'json-syntax');
  assert.equal(getGeoJSONForViewer(validAfter)?.type, 'Point');
  assert.equal(validAfter.report?.valid, true);
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
