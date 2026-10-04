import assert from 'node:assert/strict';
import { test } from 'vitest';
import { BoundingSphere, Cartesian3 } from 'cesium';
import { inspectGeoJSON } from '@nish-andran/spatial-doctor';
import { getOrbitRadius } from '../src/utils/viewerOrbit.ts';

test('does not schedule orbit ticks for a valid single Point with a zero-radius bound', () => {
  const feature = {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Point', coordinates: [101.713, 3.158, 50] },
  };
  assert.equal(inspectGeoJSON(feature).valid, true);

  const point = Cartesian3.fromDegrees(...feature.geometry.coordinates);
  const bound = BoundingSphere.fromPoints([point]);
  assert.equal(bound.radius, 0);
  assert.equal(getOrbitRadius(bound.radius), null);
});

test('keeps automatic orbit enabled for finite bounds with a positive radius', () => {
  assert.equal(getOrbitRadius(2), 4);
  assert.equal(getOrbitRadius(0), null);
  assert.equal(getOrbitRadius(Number.POSITIVE_INFINITY), null);
  assert.equal(getOrbitRadius(Number.MAX_VALUE), null);
});
