import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  colorForElevation,
  getFeatureElevationStyle,
  normalizeVerticalExaggeration,
  scaleGeoJSONHeights,
} from '../src/utils/elevationVisualization.ts';

test('maps finite feature elevations through the shared range and leaves missing elevations unstyled', () => {
  assert.equal(colorForElevation(null, { min: 0, max: 100 }), null);
  assert.equal(colorForElevation(Number.NaN, { min: 0, max: 100 }), null);
  assert.equal(colorForElevation(0, { min: 0, max: 100 }), '#2166ac');
  assert.equal(colorForElevation(50, { min: 0, max: 100 }), '#f7f7bf');
  assert.equal(colorForElevation(100, { min: 0, max: 100 }), '#b2182b');
  assert.equal(colorForElevation(12, { min: 12, max: 12 }), '#f7f7bf');
  assert.equal(colorForElevation(0, { min: -1e308, max: 1e308 }), '#f7f7bf');
  assert.equal(colorForElevation(-1e308, { min: -1e308, max: 1e308 }), '#2166ac');
  assert.equal(colorForElevation(1e308, { min: -1e308, max: 1e308 }), '#b2182b');
});

test('styles each supported feature from its mean Z over the document range', () => {
  const style = getFeatureElevationStyle({
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [0, 0, 0] } },
      { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[0, 0, 20], [1, 1, 40]] } },
      { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [2, 2, 100] } },
      { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [3, 3] } },
      { type: 'Feature', properties: {}, geometry: null },
    ],
  });

  assert.deepEqual(style.range, { min: 0, max: 100 });
  assert.equal(style.colors.get(0), '#2166ac');
  assert.equal(style.colors.get(1), colorForElevation(30, { min: 0, max: 100 }));
  assert.equal(style.colors.get(2), '#b2182b');
  assert.equal(style.colors.has(3), false);
  assert.equal(style.colors.has(4), false);
});

test('keeps exaggeration within the supported range with identity as the default', () => {
  assert.equal(normalizeVerticalExaggeration(1), 1);
  assert.equal(normalizeVerticalExaggeration(2.5), 2.5);
  assert.equal(normalizeVerticalExaggeration(0), 1);
  assert.equal(normalizeVerticalExaggeration(8), 5);
  assert.equal(normalizeVerticalExaggeration(Number.NaN), 1);
});

test('scales only existing Z ordinates in a viewer copy and preserves canonical input', () => {
  const source = {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: { label: 'unchanged' },
      geometry: {
        type: 'GeometryCollection',
        geometries: [
          { type: 'Point', coordinates: [10, 20, 4] },
          { type: 'LineString', coordinates: [[11, 21], [12, 22, -3]] },
          { type: 'GeometryCollection', geometries: [
            { type: 'Point', coordinates: [13, 23, 0] },
          ] },
        ],
      },
    }],
  };
  const original = structuredClone(source);

  const identity = scaleGeoJSONHeights(source, 1);
  const exaggerated = scaleGeoJSONHeights(source, 2.5);

  assert.deepEqual(identity, original);
  assert.deepEqual(exaggerated.features[0].geometry.geometries, [
    { type: 'Point', coordinates: [10, 20, 10] },
    { type: 'LineString', coordinates: [[11, 21], [12, 22, -7.5]] },
    { type: 'GeometryCollection', geometries: [
      { type: 'Point', coordinates: [13, 23, 0] },
    ] },
  ]);
  assert.deepEqual(source, original);
});

test('does not create invalid viewer coordinates when exaggeration exceeds numeric range', () => {
  const source = { type: 'Point', coordinates: [0, 0, 1e308] };

  assert.equal(scaleGeoJSONHeights(source, 5), null);
  assert.deepEqual(source, { type: 'Point', coordinates: [0, 0, 1e308] });
});
