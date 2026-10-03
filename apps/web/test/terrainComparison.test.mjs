import assert from 'node:assert/strict';
import { test } from 'vitest';
import { compareTerrainElevations } from '../src/utils/terrainComparison.ts';

const points = [
  { path: [0], longitude: 101.7, latitude: 3.1, sourceZ: 120 },
  { path: [1], longitude: 101.8, latitude: 3.2, sourceZ: 125 },
];

test('compares source Z with finite sampled terrain heights and marks missing samples partial', async () => {
  const result = await compareTerrainElevations(points, async (requested) => {
    assert.equal(requested.length, 2);
    return [100, undefined];
  });

  assert.deepEqual(result, {
    status: 'partial',
    totalCoordinates: 2,
    coordinatesWithElevation: 2,
    unavailableCoordinates: 1,
    values: [{ path: [0], longitude: 101.7, latitude: 3.1, sourceZ: 120, terrainHeight: 100, difference: 20 }],
  });
});

test('reports no elevation without invoking the terrain sampler', async () => {
  let sampled = false;
  const result = await compareTerrainElevations([
    { path: [0], longitude: 1, latitude: 2, sourceZ: null },
  ], async () => {
    sampled = true;
    return [];
  });

  assert.equal(sampled, false);
  assert.deepEqual(result, {
    status: 'unavailable',
    reason: 'no-elevation',
    totalCoordinates: 1,
    coordinatesWithElevation: 0,
    unavailableCoordinates: 1,
    values: [],
  });
});

test('marks overflowed height differences unavailable and never returns non-finite output', async () => {
  const result = await compareTerrainElevations([
    { path: [0], longitude: 0, latitude: 0, sourceZ: 1e308 },
  ], async () => [-1e308]);

  assert.deepEqual(result, {
    status: 'unavailable',
    reason: 'numeric-range',
    totalCoordinates: 1,
    coordinatesWithElevation: 1,
    unavailableCoordinates: 1,
    values: [],
  });
  assert.doesNotMatch(JSON.stringify(result), /Infinity|NaN/);
});

test('ignores terrain completions for a selection that is no longer current', async () => {
  let resolveSamples;
  let current = true;
  const pending = new Promise((resolve) => { resolveSamples = resolve; });
  const resultPromise = compareTerrainElevations(points, () => pending, () => current);

  current = false;
  resolveSamples([100, 101]);

  assert.equal(await resultPromise, null);
});

test('reports sampling failures as unavailable instead of inventing ground height', async () => {
  const result = await compareTerrainElevations(points, async () => {
    throw new Error('terrain request failed');
  });

  assert.deepEqual(result, {
    status: 'unavailable',
    reason: 'sampling-failed',
    totalCoordinates: 2,
    coordinatesWithElevation: 2,
    unavailableCoordinates: 2,
    values: [],
  });
});
