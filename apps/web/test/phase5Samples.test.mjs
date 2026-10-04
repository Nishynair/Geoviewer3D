import assert from 'node:assert/strict';
import { test } from 'vitest';
import { inspectGeoJSON } from '@nish-andran/spatial-doctor';
import KlccFlat from '../src/assets/sampleJSON/klcc-flat.json';
import NativePlace from '../src/assets/sampleJSON/native-place.json';
import OpenRingRepair from '../src/assets/sampleJSON/open-ring-repair.json';
import { createSpatialDocument } from '../src/spatialDocument.ts';
import { planSpatialConversion } from '../src/utils/formatConversion.ts';
import { previewGeoJSONRepair } from '../src/utils/geoJsonRepairs.ts';

test('the default curated KLCC sample is a valid XYZ polygon with measured elevations', () => {
  const report = inspectGeoJSON(KlccFlat);
  assert.equal(report.valid, true);
  if (!report.valid) return;
  assert.equal(report.coordinates.dimensions, 'XYZ');
  assert.ok(report.coordinates.zRange);
  assert.equal(report.coordinates.zRange.min, 50);
  assert.equal(report.coordinates.zRange.max, 50);
});

test('the open-ring sample previews a deterministic safe repair', () => {
  const rawText = JSON.stringify(OpenRingRepair, null, 2);
  const document = createSpatialDocument('open-ring-repair.geojson', rawText, inspectGeoJSON);
  assert.equal(document.format, 'geojson');
  assert.equal(document.report?.valid, false);

  const preview = previewGeoJSONRepair(document.source, 'close-unclosed-rings');
  assert.equal(preview.status, 'ready');
  if (preview.status !== 'ready') return;
  assert.equal(preview.measurements.ringsClosed, 1);
  assert.deepEqual(JSON.parse(preview.outputRawText).geometry.coordinates[0][0], [101.7, 3.15, 12]);
  assert.deepEqual(JSON.parse(preview.outputRawText).geometry.coordinates[0].at(-1), [101.7, 3.15, 12]);
});

test('the native-place JSON-FG sample inspects and accounts for conversion losses', () => {
  const rawText = JSON.stringify(NativePlace, null, 2);
  const document = createSpatialDocument('native-place.jsonfg', rawText, inspectGeoJSON);
  assert.equal(document.format, 'jsonfg');
  assert.equal(document.report?.valid, true);
  if (document.format !== 'jsonfg') return;
  assert.equal(document.jsonFg.coordRefSysDeclarations.length, 1);
  assert.ok(document.jsonFg.unsupportedConstructs.some((item) => item.includes('Native place geometry')));

  const plan = planSpatialConversion(document);
  assert.equal(plan.status, 'ready');
  if (plan.status !== 'ready') return;
  assert.ok(plan.account.lost.some((item) => item.includes('place')));
  assert.ok(plan.account.lost.some((item) => item.includes('time')));
  assert.ok(plan.account.lost.some((item) => item.includes('coordRefSys')));
  assert.deepEqual(JSON.parse(plan.outputRawText).features[0].geometry, NativePlace.features[0].geometry);
});
