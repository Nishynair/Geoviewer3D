import assert from 'node:assert/strict';
import { test } from 'vitest';
import { inspectGeoJSON, measureGeoJSONGeometry } from '@nish-andran/spatial-doctor';
import { CURATED_DEMOS, CURATED_EXAMPLES } from '../src/curatedExamples.ts';
import { createSpatialDocument, getGeoJSONForViewer } from '../src/spatialDocument.ts';
import { getGeoJSONFeature } from '../src/utils/diagnosticNavigation.ts';

test('the three named demos are valid curated documents with a safe useful starting feature', () => {
  assert.deepEqual(CURATED_DEMOS.map(({ name }) => name), [
    'Clean3DBuildings',
    'BrokenGeometry',
    'ElevationTerrain',
  ]);

  for (const demo of CURATED_DEMOS) {
    const document = createSpatialDocument(demo.fileName, demo.rawText, inspectGeoJSON);
    assert.equal(document.format, 'geojson', demo.name);
    assert.equal(document.report?.valid, true, demo.name);
    assert.equal(document.parseError, null, demo.name);
    assert.equal(typeof demo.description, 'string');
    assert.ok(demo.description.length > 0);
    if (demo.name === 'Clean3DBuildings') {
      assert.deepEqual(document.report?.diagnostics, []);
      assert.equal(demo.presentation.autoRotate, false);
      assert.equal(demo.presentation.colorByElevation, true);
    }

    const viewerValue = getGeoJSONForViewer(document);
    assert.ok(viewerValue, demo.name);
    if (demo.initialFeatureIndex !== null) {
      const sourceFeature = getGeoJSONFeature(document.parsed, demo.initialFeatureIndex);
      const viewerFeature = getGeoJSONFeature(viewerValue, demo.initialFeatureIndex);
      assert.ok(sourceFeature?.geometry, `${demo.name} starting feature exists`);
      assert.ok(viewerFeature?.geometry, `${demo.name} starting feature is safe to render`);
    } else {
      assert.equal(demo.name, 'Clean3DBuildings');
    }
    assert.equal(demo.presentation.verticalExaggeration >= 1, true);
    assert.equal(demo.presentation.verticalExaggeration <= 5, true);
  }
});

test('BrokenGeometry exposes real approved findings while withholding only the unsafe feature', () => {
  const demo = CURATED_DEMOS.find(({ name }) => name === 'BrokenGeometry');
  assert.ok(demo);
  const document = createSpatialDocument(demo.fileName, demo.rawText, inspectGeoJSON);
  assert.equal(document.report?.valid, true);
  if (!document.report?.valid || !document.parsed?.type) return;

  const codes = document.report.diagnostics.map(({ code }) => code);
  assert.deepEqual(codes.slice().sort(), [
    'coordinate-out-of-range',
    'duplicate-consecutive-position',
    'mixed-coordinate-dimensions',
  ]);
  assert.deepEqual(demo.presentation, {
    autoRotate: false,
    colorByElevation: false,
    verticalExaggeration: 1,
  });

  const sourceFeatureCollection = document.parsed;
  const viewerValue = getGeoJSONForViewer(document);
  assert.ok(sourceFeatureCollection.type === 'FeatureCollection');
  assert.ok(viewerValue?.type === 'FeatureCollection');
  const unsafeIndex = document.report.diagnostics.find(
    ({ code }) => code === 'coordinate-out-of-range',
  )?.featureIndex;
  assert.equal(typeof unsafeIndex, 'number');
  if (typeof unsafeIndex !== 'number') return;
  assert.ok(sourceFeatureCollection.features[unsafeIndex]?.geometry);
  assert.equal(viewerValue.features[unsafeIndex]?.geometry, null);

  const selected = getGeoJSONFeature(viewerValue, demo.initialFeatureIndex);
  assert.ok(selected?.geometry, 'the initially selected feature remains safe to render');
  assert.ok(demo.initialFeatureIndex !== unsafeIndex);
});

test('ElevationTerrain contains coordinate Z facts and line profiles for the existing comparison action', () => {
  const demo = CURATED_DEMOS.find(({ name }) => name === 'ElevationTerrain');
  assert.ok(demo);
  const document = createSpatialDocument(demo.fileName, demo.rawText, inspectGeoJSON);
  assert.equal(document.report?.valid, true);
  assert.ok(document.parsed?.type === 'FeatureCollection');
  assert.deepEqual(demo.presentation, {
    autoRotate: false,
    colorByElevation: true,
    verticalExaggeration: 2,
  });

  const feature = getGeoJSONFeature(document.parsed, demo.initialFeatureIndex);
  assert.ok(feature?.geometry);
  const measurement = measureGeoJSONGeometry(feature.geometry);
  assert.ok(measurement.coordinateZ.length >= 2);
  assert.ok(measurement.coordinateZ.every(({ z }) => z !== null));
  assert.ok(measurement.lineProfiles.length > 0);
  assert.ok(document.report.valid);
  assert.ok(document.report.coordinates.zRange);
});

test('new demos are one-click curated entries without removing the established examples', () => {
  assert.deepEqual(CURATED_EXAMPLES.map(({ name }) => name), [
    'Clean3DBuildings.geojson',
    'BrokenGeometry.geojson',
    'ElevationTerrain.geojson',
    'open-ring-repair.geojson',
    'native-place.jsonfg',
  ]);
});
