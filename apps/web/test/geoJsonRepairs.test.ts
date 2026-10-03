import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  applyRepairPreview,
  previewGeoJSONRepair,
  undoAppliedRepair,
} from '../src/utils/geoJsonRepairs.ts';
import { createEditorTextChangeHandler } from '../src/utils/editorChangeGuard.ts';

const unclosedPolygonSource = {
  name: 'lot.geojson',
  rawText: JSON.stringify({
    type: 'Feature',
    id: 'lot-7',
    properties: { label: 'Lot 7' },
    geometry: {
      type: 'Polygon',
      coordinates: [[[0, 0], [1, 0], [1, 1]]],
    },
  }),
};

test('previews closing a structurally safe open ring without changing source text', () => {
  const originalText = unclosedPolygonSource.rawText;
  const preview = previewGeoJSONRepair(unclosedPolygonSource, 'close-unclosed-rings');

  assert.equal(preview.status, 'ready');
  if (preview.status !== 'ready') return;
  assert.equal(unclosedPolygonSource.rawText, originalText);
  assert.deepEqual(preview.source, unclosedPolygonSource);
  assert.deepEqual(preview.measurements, {
    coordinatePositionsBefore: 3,
    coordinatePositionsAfter: 4,
    duplicatePositionsRemoved: 0,
    ringsClosed: 1,
    zOrdinatesRemoved: 0,
    bboxZRangesRemoved: 0,
  });

  const output = JSON.parse(preview.outputRawText);
  assert.deepEqual(output.geometry.coordinates[0], [[0, 0], [1, 0], [1, 1], [0, 0]]);
  assert.equal(output.id, 'lot-7');
  assert.deepEqual(output.properties, { label: 'Lot 7' });
});

test('removes only fully equal consecutive coordinate tuples, including their Z value', () => {
  const source = {
    name: 'elevated-line.geojson',
    rawText: JSON.stringify({
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: [[0, 0, 10], [0, 0, 11], [0, 0, 11], [1, 1, 12]],
      },
    }),
  };

  const preview = previewGeoJSONRepair(source, 'remove-duplicate-vertices');

  assert.equal(preview.status, 'ready');
  if (preview.status !== 'ready') return;
  assert.deepEqual(JSON.parse(preview.outputRawText).geometry.coordinates, [
    [0, 0, 10], [0, 0, 11], [1, 1, 12],
  ]);
  assert.equal(preview.measurements.duplicatePositionsRemoved, 1);
  assert.equal(preview.measurements.coordinatePositionsBefore, 4);
  assert.equal(preview.measurements.coordinatePositionsAfter, 3);
});

test('removes XYZ ordinates and matching bbox Z ranges while preserving feature data', () => {
  const source = {
    name: 'elevation.geojson',
    rawText: JSON.stringify({
      type: 'Feature',
      bbox: [0, 0, 5, 1, 1, 15],
      properties: { source: 'survey' },
      geometry: {
        type: 'Polygon',
        bbox: [0, 0, 5, 1, 1, 15],
        coordinates: [[[0, 0, 5], [1, 0, 10], [1, 1, 15], [0, 0, 5]]],
      },
    }),
  };

  const preview = previewGeoJSONRepair(source, 'remove-z');

  assert.equal(preview.status, 'ready');
  if (preview.status !== 'ready') return;
  const output = JSON.parse(preview.outputRawText);
  assert.deepEqual(output.geometry.coordinates[0], [[0, 0], [1, 0], [1, 1], [0, 0]]);
  assert.deepEqual(output.bbox, [0, 0, 1, 1]);
  assert.deepEqual(output.geometry.bbox, [0, 0, 1, 1]);
  assert.deepEqual(output.properties, { source: 'survey' });
  assert.equal(preview.measurements.zOrdinatesRemoved, 4);
  assert.equal(preview.measurements.bboxZRangesRemoved, 2);
});

test('preserves 2D bounding boxes while removing Z from a mixed-dimension document', () => {
  const source = {
    name: 'mixed-bounds.geojson',
    rawText: JSON.stringify({
      type: 'FeatureCollection',
      bbox: [0, 0, 0, 4, 4, 20],
      features: [
        {
          type: 'Feature',
          bbox: [0, 0, 5, 1, 1, 15],
          properties: { dimension: 'XYZ' },
          geometry: { type: 'Point', coordinates: [0.5, 0.5, 10] },
        },
        {
          type: 'Feature',
          bbox: [2, 2, 4, 4],
          properties: { dimension: 'XY' },
          geometry: { type: 'Point', coordinates: [3, 3] },
        },
      ],
    }),
  };

  const preview = previewGeoJSONRepair(source, 'remove-z');

  assert.equal(preview.status, 'ready');
  if (preview.status !== 'ready') return;
  const output = JSON.parse(preview.outputRawText);
  assert.deepEqual(output.bbox, [0, 0, 4, 4]);
  assert.deepEqual(output.features[0].bbox, [0, 0, 1, 1]);
  assert.deepEqual(output.features[1].bbox, [2, 2, 4, 4]);
  assert.deepEqual(output.features.map((feature: { geometry: { coordinates: number[] } }) => feature.geometry.coordinates), [
    [0.5, 0.5],
    [3, 3],
  ]);
  assert.equal(preview.measurements.bboxZRangesRemoved, 2);
});

test('leaves a degenerate open ring unchanged with an explicit reason', () => {
  const source = {
    name: 'degenerate.geojson',
    rawText: JSON.stringify({
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [[[0, 0], [1, 1], [1, 1]]],
      },
    }),
  };
  const originalText = source.rawText;

  const preview = previewGeoJSONRepair(source, 'close-unclosed-rings');

  assert.equal(preview.status, 'unavailable');
  if (preview.status !== 'unavailable') return;
  assert.match(preview.reason, /three distinct/i);
  assert.equal(source.rawText, originalText);
});

test('leaves a mixed-dimension open ring unchanged with an explicit reason', () => {
  const source = {
    name: 'mixed.geojson',
    rawText: JSON.stringify({
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [[[0, 0], [1, 0, 4], [1, 1]]],
      },
    }),
  };

  const preview = previewGeoJSONRepair(source, 'close-unclosed-rings');

  assert.equal(preview.status, 'unavailable');
  if (preview.status !== 'unavailable') return;
  assert.match(preview.reason, /malformed or mixes coordinate dimensions/i);
  assert.equal(source.rawText, JSON.stringify({
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0, 4], [1, 1]]] },
  }));
});

test('duplicate removal is idempotent on its preview output', () => {
  const source = {
    name: 'line.geojson',
    rawText: JSON.stringify({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: [[0, 0], [0, 0], [1, 1]] },
    }),
  };
  const first = previewGeoJSONRepair(source, 'remove-duplicate-vertices');
  assert.equal(first.status, 'ready');
  if (first.status !== 'ready') return;

  const second = previewGeoJSONRepair({ name: source.name, rawText: first.outputRawText }, 'remove-duplicate-vertices');

  assert.equal(second.status, 'unavailable');
  if (second.status !== 'unavailable') return;
  assert.match(second.reason, /no consecutive duplicate vertices/i);
});

test('does not remove a Z ordinate from positions with additional dimensions', () => {
  const source = {
    name: 'measured.geojson',
    rawText: JSON.stringify({
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates: [1, 2, 3, 4] },
    }),
  };

  const preview = previewGeoJSONRepair(source, 'remove-z');

  assert.equal(preview.status, 'unavailable');
  if (preview.status !== 'unavailable') return;
  assert.match(preview.reason, /more than three ordinates/i);
});

test('applies only a current preview once and undoes to the exact prior text and name', () => {
  const preview = previewGeoJSONRepair(unclosedPolygonSource, 'close-unclosed-rings');
  assert.equal(preview.status, 'ready');
  if (preview.status !== 'ready') return;

  const applied = applyRepairPreview(unclosedPolygonSource, preview);
  assert.ok(applied);
  if (!applied) return;
  assert.deepEqual(applied.current, {
    name: 'lot.geojson',
    rawText: preview.outputRawText,
  });
  assert.deepEqual(unclosedPolygonSource, {
    name: 'lot.geojson',
    rawText: JSON.stringify({
      type: 'Feature',
      id: 'lot-7',
      properties: { label: 'Lot 7' },
      geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1]]] },
    }),
  });
  assert.equal(applyRepairPreview(applied.current, preview), null);
  assert.equal(applyRepairPreview({ ...applied.current, name: 'other.geojson' }, preview), null);
  assert.deepEqual(undoAppliedRepair(applied.current, applied), unclosedPolygonSource);
  assert.equal(undoAppliedRepair({ ...applied.current, rawText: `${applied.current.rawText} ` }, applied), null);
  assert.equal(undoAppliedRepair({ ...applied.current, name: 'other.geojson' }, applied), null);
});

test('the App editor-change handler preserves undo across the controlled Monaco echo after Apply', () => {
  const preview = previewGeoJSONRepair(unclosedPolygonSource, 'close-unclosed-rings');
  assert.equal(preview.status, 'ready');
  if (preview.status !== 'ready') return;
  const applied = applyRepairPreview(unclosedPolygonSource, preview);
  assert.ok(applied);
  if (!applied) return;

  let currentSource = applied.current;
  let activeAppliedRepair = applied;
  const onEditorTextChange = createEditorTextChangeHandler(
    () => currentSource.rawText,
    (rawText) => {
      activeAppliedRepair = null;
      currentSource = { name: currentSource.name, rawText };
    },
  );

  assert.equal(onEditorTextChange(applied.current.rawText), 'controlled-echo');
  assert.equal(activeAppliedRepair, applied);
  assert.deepEqual(undoAppliedRepair(currentSource, activeAppliedRepair), unclosedPolygonSource);
});

test('the App editor-change handler clears repair undo after an actual edit', () => {
  const preview = previewGeoJSONRepair(unclosedPolygonSource, 'close-unclosed-rings');
  assert.equal(preview.status, 'ready');
  if (preview.status !== 'ready') return;
  const applied = applyRepairPreview(unclosedPolygonSource, preview);
  assert.ok(applied);
  if (!applied) return;

  let currentSource = applied.current;
  let activeAppliedRepair = applied;
  const onEditorTextChange = createEditorTextChangeHandler(
    () => currentSource.rawText,
    (rawText) => {
      activeAppliedRepair = null;
      currentSource = { name: currentSource.name, rawText };
    },
  );
  const editedText = `${applied.current.rawText} `;

  assert.equal(onEditorTextChange(editedText), 'user-edit');
  assert.equal(activeAppliedRepair, null);
  assert.equal(currentSource.rawText, editedText);
});
