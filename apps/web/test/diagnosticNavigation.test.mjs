import assert from 'node:assert/strict';
import { test } from 'vitest';
import * as Cesium from 'cesium';
import { inspectGeoJSON } from 'spatial-doctor';
import {
  createDiagnosticNavigationPlan,
  focusDiagnosticFeature,
  FEATURE_INDEX_PROPERTY,
  findCurrentFeatureEntities,
  findFeatureEntities,
  getFeatureIndexFromProperties,
  getGeoJSONFeature,
  indexFeaturesForViewer,
  resolveDiagnosticFeatureIndex,
} from '../src/utils/diagnosticNavigation.ts';
import {
  clearSourceLocationSelection,
  revealSourceLocation,
} from '../src/utils/editorLocation.ts';
import { createSpatialDocument, getGeoJSONForViewer } from '../src/spatialDocument.ts';

function propertyEntity(featureIndex) {
  return {
    properties: {
      getValue: () => ({ [FEATURE_INDEX_PROPERTY]: featureIndex }),
    },
  };
}

function readProperties(entity) {
  return entity.properties?.getValue();
}

test('viewer feature indexing keeps source GeoJSON untouched and marks idless features', () => {
  const source = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        id: 'tower',
        properties: { name: 'Tower' },
        geometry: {
          type: 'GeometryCollection',
          geometries: [
            { type: 'Point', coordinates: [1, 2] },
            { type: 'Point', coordinates: [3, 4] },
          ],
        },
      },
      {
        type: 'Feature',
        properties: null,
        geometry: { type: 'Point', coordinates: [5, 6] },
      },
    ],
  };

  const indexedViewer = indexFeaturesForViewer(source);
  const viewerValue = indexedViewer.geojson;
  const tag = indexedViewer.featureIndexProperty;

  assert.notEqual(viewerValue, source);
  assert.notEqual(viewerValue.features[0], source.features[0]);
  assert.deepEqual(source.features[0].properties, { name: 'Tower' });
  assert.equal(source.features[1].properties, null);
  assert.equal(viewerValue.features[0].id, 'tower');
  assert.equal(viewerValue.features[0].properties.name, 'Tower');
  assert.equal(viewerValue.features[0].properties[tag], 0);
  assert.equal(viewerValue.features[1].properties[tag], 1);
});

test('viewer feature indexing chooses a private property name when user data uses the default', () => {
  const indexedViewer = indexFeaturesForViewer({
    type: 'Feature',
    properties: { [FEATURE_INDEX_PROPERTY]: 'user-owned' },
    geometry: { type: 'Point', coordinates: [1, 2] },
  });

  assert.notEqual(indexedViewer.featureIndexProperty, FEATURE_INDEX_PROPERTY);
  assert.equal(indexedViewer.geojson.properties[FEATURE_INDEX_PROPERTY], 'user-owned');
  assert.equal(indexedViewer.geojson.properties[indexedViewer.featureIndexProperty], 0);
});

test('feature references resolve by index or unique GeoJSON id without inventing a bare-geometry feature', () => {
  const collection = {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', id: 'alpha', properties: null, geometry: null },
      { type: 'Feature', properties: {}, geometry: null },
    ],
  };

  assert.equal(resolveDiagnosticFeatureIndex(collection, { featureId: 'alpha' }), 0);
  assert.equal(resolveDiagnosticFeatureIndex(collection, { featureIndex: 1 }), 1);
  assert.equal(resolveDiagnosticFeatureIndex(collection, { featureId: 'missing' }), null);
  assert.equal(resolveDiagnosticFeatureIndex(collection, { featureIndex: 3 }), null);
  assert.equal(
    resolveDiagnosticFeatureIndex(collection, { featureId: 'alpha', featureIndex: 1 }),
    null,
  );
  assert.equal(
    resolveDiagnosticFeatureIndex(
      { type: 'Point', coordinates: [1, 2] },
      { featureIndex: 0 },
    ),
    null,
  );
});

test('map-pick metadata resolves only a valid indexed Feature in the canonical document', () => {
  const collection = {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: null, geometry: null },
    ],
  };

  assert.equal(getFeatureIndexFromProperties({ [FEATURE_INDEX_PROPERTY]: 0 }, FEATURE_INDEX_PROPERTY), 0);
  assert.equal(getFeatureIndexFromProperties({ [FEATURE_INDEX_PROPERTY]: -1 }, FEATURE_INDEX_PROPERTY), null);
  assert.equal(getFeatureIndexFromProperties({}, FEATURE_INDEX_PROPERTY), null);
  assert.equal(getFeatureIndexFromProperties({ [FEATURE_INDEX_PROPERTY]: 0 }, null), null);
  assert.deepEqual(getGeoJSONFeature(collection, 0), collection.features[0]);
  assert.equal(getGeoJSONFeature(collection, 1), null);
  assert.equal(getGeoJSONFeature({ type: 'Point', coordinates: [0, 1] }, 0), null);
});

test('duplicate feature ids are ambiguous and do not select the wrong feature', () => {
  const collection = {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', id: 'duplicate', properties: {}, geometry: null },
      { type: 'Feature', id: 'duplicate', properties: {}, geometry: null },
    ],
  };

  assert.equal(
    resolveDiagnosticFeatureIndex(collection, { featureId: 'duplicate' }),
    null,
  );
});

test('all Cesium entities carrying a feature index are returned together', () => {
  const firstGeometryEntity = propertyEntity(1);
  const secondGeometryEntity = propertyEntity(1);
  const unrelatedEntity = propertyEntity(0);

  assert.deepEqual(
    findFeatureEntities(
      [firstGeometryEntity, unrelatedEntity, secondGeometryEntity],
      1,
      FEATURE_INDEX_PROPERTY,
      readProperties,
    ),
    [firstGeometryEntity, secondGeometryEntity],
  );
});

test('feature selection ignores entities loaded for an older document until the current source is ready', () => {
  const documentA = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: null }] };
  const documentB = { type: 'FeatureCollection', features: [
    { type: 'Feature', properties: {}, geometry: null },
    { type: 'Feature', properties: {}, geometry: null },
  ] };
  const entitiesA = [propertyEntity(0)];
  const entitiesB = [propertyEntity(0), propertyEntity(1)];

  assert.deepEqual(
    findCurrentFeatureEntities(documentB, documentA, entitiesA, 0, FEATURE_INDEX_PROPERTY, readProperties),
    [],
  );
  assert.deepEqual(
    findCurrentFeatureEntities(documentB, documentB, entitiesB, 1, FEATURE_INDEX_PROPERTY, readProperties),
    [entitiesB[1]],
  );
  assert.deepEqual(
    findCurrentFeatureEntities(documentB, documentB, entitiesB, null, FEATURE_INDEX_PROPERTY, readProperties),
    [],
  );
});

test('Cesium preserves one feature index across GeometryCollection child entities', async () => {
  const source = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: null,
        geometry: {
          type: 'GeometryCollection',
          geometries: [
            {
              type: 'Polygon',
              coordinates: [[[0, 0], [0, 1], [1, 1], [0, 0]]],
            },
            { type: 'LineString', coordinates: [[2, 2], [3, 3]] },
          ],
        },
      },
      {
        type: 'Feature',
        properties: {},
        geometry: { type: 'Polygon', coordinates: [[[4, 4], [4, 5], [5, 5], [4, 4]]] },
      },
    ],
  };
  const indexedViewer = indexFeaturesForViewer(source);
  const dataSource = await Cesium.GeoJsonDataSource.load(indexedViewer.geojson);
  const time = Cesium.JulianDate.now();
  const readCesiumProperties = (entity) =>
    entity.properties?.getValue(time);

  assert.equal(findFeatureEntities(
    dataSource.entities.values,
    0,
    indexedViewer.featureIndexProperty,
    readCesiumProperties,
  ).length, 2);
  assert.equal(findFeatureEntities(
    dataSource.entities.values,
    1,
    indexedViewer.featureIndexProperty,
    readCesiumProperties,
  ).length, 1);
  assert.equal(source.features[0].properties, null);
});

test('a valid spatial document diagnostic reaches its idless feature entities and source range', async () => {
  const rawText = JSON.stringify({
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: null,
      geometry: {
        type: 'GeometryCollection',
        geometries: [
          { type: 'Polygon', coordinates: [[[0, 0], [0, 1], [1, 1], [0, 0]]] },
          { type: 'LineString', coordinates: [[2, 2], [3, 3]] },
        ],
      },
    }],
  });
  const parsed = JSON.parse(rawText);
  const diagnostic = {
    code: 'invalid-geojson',
    severity: 'warning',
    message: 'Referenced feature diagnostic fixture',
    featureIndex: 0,
    sourceLocation: { start: 0, end: 20 },
  };
  const document = createSpatialDocument(
    'idless.geojson',
    rawText,
    () => ({ ...inspectGeoJSON(parsed), diagnostics: [diagnostic] }),
  );
  const geojson = getGeoJSONForViewer(document);
  assert.notEqual(geojson, null);
  const indexed = indexFeaturesForViewer(geojson);
  const dataSource = await Cesium.GeoJsonDataSource.load(indexed.geojson);
  const time = Cesium.JulianDate.now();
  const readCesiumProperties = (entity) => entity.properties?.getValue(time);
  const plan = createDiagnosticNavigationPlan(
    document.report.diagnostics[0],
    geojson,
    dataSource.entities.values,
    readCesiumProperties,
    indexed.featureIndexProperty,
  );
  const focused = [];

  assert.equal(plan.featureIndex, 0);
  assert.equal(plan.entities.length, 2);
  assert.deepEqual(plan.sourceLocation, diagnostic.sourceLocation);
  assert.equal(focusDiagnosticFeature(plan, {
    highlight: (entities) => focused.push(['highlight', entities]),
    flyTo: (entities) => focused.push(['flyTo', entities]),
  }), true);
  assert.deepEqual(focused.map(([action]) => action), ['highlight', 'flyTo']);
  assert.deepEqual(focused[0][1], plan.entities);
  assert.deepEqual(focused[1][1], plan.entities);
});

test('navigation plans carry source offsets and every entity for the referenced feature', () => {
  const geojson = {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: {}, geometry: null },
      { type: 'Feature', properties: {}, geometry: null },
    ],
  };
  const entities = [propertyEntity(1), propertyEntity(0), propertyEntity(1)];
  const diagnostic = {
    code: 'invalid-geojson',
    severity: 'error',
    message: 'Invalid feature',
    featureIndex: 1,
    sourceLocation: { start: 12, end: 28 },
  };

  const plan = createDiagnosticNavigationPlan(diagnostic, geojson, entities, readProperties);

  assert.equal(plan.featureIndex, 1);
  assert.deepEqual(plan.entities, [entities[0], entities[2]]);
  assert.deepEqual(plan.sourceLocation, { start: 12, end: 28 });
});

test('dataset-wide diagnostics without spatial references produce no camera target', () => {
  const diagnostic = {
    code: 'invalid-geojson',
    severity: 'error',
    message: 'Invalid document',
  };

  const plan = createDiagnosticNavigationPlan(
    diagnostic,
    { type: 'FeatureCollection', features: [] },
    [propertyEntity(0)],
    readProperties,
  );

  assert.equal(plan.featureIndex, null);
  assert.deepEqual(plan.entities, []);
  assert.equal(plan.sourceLocation, null);
});

test('only a resolved feature target highlights and starts camera navigation', () => {
  const featureEntity = propertyEntity(0);
  const featurePlan = createDiagnosticNavigationPlan(
    { featureIndex: 0 },
    { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [1, 2] } },
    [featureEntity],
    readProperties,
  );
  const datasetPlan = createDiagnosticNavigationPlan(
    {},
    { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [1, 2] } },
    [featureEntity],
    readProperties,
  );
  const calls = [];
  const actions = {
    highlight: (entities) => calls.push(['highlight', entities]),
    flyTo: (entities) => calls.push(['flyTo', entities]),
  };

  assert.equal(focusDiagnosticFeature(featurePlan, actions), true);
  assert.deepEqual(calls, [
    ['highlight', [featureEntity]],
    ['flyTo', [featureEntity]],
  ]);
  calls.length = 0;
  assert.equal(focusDiagnosticFeature(datasetPlan, actions), false);
  assert.deepEqual(calls, []);
});

test('source-only locations reveal text without creating a camera target', () => {
  const plan = createDiagnosticNavigationPlan(
    {
      code: 'invalid-geojson',
      severity: 'error',
      message: 'Invalid value',
      sourceLocation: { start: 4, end: 9 },
    },
    { type: 'FeatureCollection', features: [] },
    [],
    readProperties,
  );

  assert.equal(plan.featureIndex, null);
  assert.deepEqual(plan.entities, []);
  assert.deepEqual(plan.sourceLocation, { start: 4, end: 9 });
});

test('invalid source ranges are ignored instead of revealing an unrelated editor range', () => {
  for (const sourceLocation of [
    { start: -1, end: 2 },
    { start: 9, end: 4 },
    { start: 1.5, end: 2 },
    { start: 1, end: Number.POSITIVE_INFINITY },
  ]) {
    const plan = createDiagnosticNavigationPlan(
      { code: 'invalid-geojson', severity: 'error', message: 'Invalid', sourceLocation },
      { type: 'FeatureCollection', features: [] },
      [],
      readProperties,
    );

    assert.equal(plan.sourceLocation, null);
  }
});

test('a valid diagnostic source range selects and reveals the corresponding editor text', () => {
  const calls = [];
  const range = { start: 3, end: 8 };
  const editor = {
    getModel: () => ({
      getValueLength: () => 10,
      getPositionAt: (offset) => ({ lineNumber: 1, column: offset + 1 }),
    }),
    setSelection: (value) => calls.push(['select', value]),
    revealRangeInCenter: (value) => calls.push(['reveal', value]),
    focus: () => calls.push(['focus']),
  };

  assert.equal(revealSourceLocation(editor, range), true);
  assert.deepEqual(calls, [
    ['select', { startLineNumber: 1, startColumn: 4, endLineNumber: 1, endColumn: 9 }],
    ['reveal', { startLineNumber: 1, startColumn: 4, endLineNumber: 1, endColumn: 9 }],
    ['focus'],
  ]);
});

test('unavailable editor models and out-of-range locations are safely ignored', () => {
  const calls = [];
  const editor = {
    getModel: () => ({ getValueLength: () => 4, getPositionAt: () => ({ lineNumber: 1, column: 1 }) }),
    setSelection: () => calls.push('select'),
    revealRangeInCenter: () => calls.push('reveal'),
    focus: () => calls.push('focus'),
  };

  assert.equal(revealSourceLocation(editor, { start: 5, end: 6 }), false);
  assert.equal(revealSourceLocation({ ...editor, getModel: () => null }, { start: 0, end: 1 }), false);
  assert.deepEqual(calls, []);
});

test('clearing a feature source link collapses the old text selection without moving the cursor', () => {
  const calls = [];
  const editor = {
    getPosition: () => ({ lineNumber: 4, column: 7 }),
    setSelection: (range) => calls.push(range),
  };

  clearSourceLocationSelection(editor);

  assert.deepEqual(calls, [{
    startLineNumber: 4,
    startColumn: 7,
    endLineNumber: 4,
    endColumn: 7,
  }]);
});
