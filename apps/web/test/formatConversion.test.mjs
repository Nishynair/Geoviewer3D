import assert from 'node:assert/strict';
import { test } from 'vitest';
import { inspectGeoJSON } from 'spatial-doctor';
import { createSpatialDocument } from '../src/spatialDocument.ts';
import { planSpatialConversion } from '../src/utils/formatConversion.ts';

const CORE = 'http://www.opengis.net/spec/json-fg-1/1.0/conf/core';
const JSON_FG_PLUS = 'http://www.opengis.net/def/profile/OGC/0/jsonfg-plus';

function document(name, value) {
  return createSpatialDocument(name, typeof value === 'string' ? value : JSON.stringify(value), inspectGeoJSON);
}

test('plans GeoJSON FeatureCollection to JSON-FG Core without changing feature content', () => {
  const input = {
    type: 'FeatureCollection',
    name: 'harbors',
    features: [
      {
        type: 'Feature',
        id: 'port-1',
        properties: { name: 'Port A' },
        geometry: { type: 'Point', coordinates: [12, 5, 8] },
      },
      {
        type: 'Feature',
        properties: { name: 'Port B' },
        geometry: { type: 'Point', coordinates: [15, 8] },
      },
    ],
  };
  const plan = planSpatialConversion(document('ports.geojson', input));

  assert.equal(plan.status, 'ready');
  assert.equal(plan.from, 'geojson');
  assert.equal(plan.to, 'jsonfg');
  assert.equal(plan.targetName, 'ports.jsonfg');
  assert.deepEqual(plan.account.approximated, []);
  assert.deepEqual(plan.account.lost, []);
  assert.ok(plan.account.preserved.some((item) => /feature order, IDs, properties/i.test(item)));
  assert.ok(plan.account.changed.some((item) => item.includes('root Core conformsTo declaration')));

  const output = JSON.parse(plan.outputRawText);
  assert.deepEqual(output.conformsTo, [CORE]);
  assert.equal(output.name, input.name);
  assert.deepEqual(output.features, input.features);
});

test('blocks GeoJSON foreign members that would gain JSON-FG meaning', () => {
  const fixtures = [
    {
      name: 'foreign-time.geojson',
      value: {
        type: 'Feature',
        time: '2026-01-01',
        properties: {},
        geometry: { type: 'Point', coordinates: [1, 2] },
      },
      member: 'time',
    },
    {
      name: 'foreign-crs.geojson',
      value: {
        type: 'FeatureCollection',
        coordRefSys: 'http://www.opengis.net/def/crs/EPSG/0/3857',
        features: [],
      },
      member: 'coordRefSys',
    },
    {
      name: 'foreign-place.geojson',
      value: {
        type: 'Feature',
        place: { type: 'Point', coordinates: [100, 200] },
        properties: {},
        geometry: { type: 'Point', coordinates: [1, 2] },
      },
      member: 'place',
    },
  ];

  for (const fixture of fixtures) {
    const plan = planSpatialConversion(document(fixture.name, fixture.value));
    assert.equal(plan.status, 'blocked');
    assert.match(plan.reason, new RegExp(fixture.member));
    assert.match(plan.reason, /would gain JSON-FG meaning/);
  }
});

test('blocks malformed, invalid, and unsupported GeoJSON conversion inputs with a useful reason', () => {
  const malformed = planSpatialConversion(document('broken.geojson', '{"type":'));
  const invalid = planSpatialConversion(document('invalid.geojson', {
    type: 'Feature',
    properties: {},
    geometry: 'not a geometry',
  }));
  const bareGeometry = planSpatialConversion(document('point.geojson', {
    type: 'Point',
    coordinates: [1, 2],
  }));

  assert.equal(malformed.status, 'blocked');
  assert.match(malformed.reason, /JSON syntax/i);
  assert.equal(invalid.status, 'blocked');
  assert.match(invalid.reason, /document cannot be converted because it is invalid/i);
  assert.equal(bareGeometry.status, 'blocked');
  assert.match(bareGeometry.reason, /Feature and FeatureCollection roots/);
});

test('plans JSON-FG to GeoJSON with deterministic preservation and loss details', () => {
  const input = {
    type: 'FeatureCollection',
    conformsTo: [CORE, 'http://www.opengis.net/spec/json-fg-1/1.0/conf/extra'],
    coordRefSys: {
      type: 'Reference',
      href: 'http://www.opengis.net/def/crs/EPSG/0/3857',
    },
    links: [{ rel: 'profile', href: JSON_FG_PLUS }],
    features: [{
      type: 'Feature',
      id: 'tower',
      featureType: 'Building',
      time: '2026-01-01/2026-12-31',
      properties: { name: 'Tower' },
      geometry: { type: 'Point', coordinates: [-73.9857, 40.7484, 50] },
      place: { type: 'Point', coordinates: [-8236050.45, 4975301.25] },
    }],
  };
  const source = document('tower.jsonfg', input);
  const plan = planSpatialConversion(source);

  assert.equal(source.format, 'jsonfg');
  assert.equal(plan.status, 'ready');
  assert.equal(plan.from, 'jsonfg');
  assert.equal(plan.to, 'geojson');
  assert.equal(plan.targetName, 'tower.geojson');
  assert.deepEqual(plan.account.approximated, []);
  assert.ok(plan.account.preserved.some((item) => item.includes('RFC 7946 geometry')));
  assert.ok(plan.account.preserved.some((item) => item.toLowerCase().includes('no reprojection')));
  assert.ok(plan.account.lost.some((item) => item.includes('place')));
  assert.ok(plan.account.lost.some((item) => item.includes('time')));
  assert.ok(plan.account.lost.some((item) => item.includes('coordRefSys')));
  assert.ok(plan.account.lost.some((item) => item.includes(JSON_FG_PLUS)));
  assert.ok(plan.account.lost.some((item) => item.includes('extra')));

  const output = JSON.parse(plan.outputRawText);
  assert.equal(output.conformsTo, undefined);
  assert.equal(output.coordRefSys, undefined);
  assert.equal(output.links, undefined);
  assert.equal(output.features[0].place, undefined);
  assert.equal(output.features[0].time, undefined);
  assert.equal(output.features[0].featureType, undefined);
  assert.deepEqual(output.features[0].geometry, input.features[0].geometry);
  assert.deepEqual(output.features[0].properties, input.features[0].properties);
  assert.equal(output.features[0].id, input.features[0].id);
});

test('blocks malformed, invalid, and unsupported JSON-FG conversions', () => {
  const malformed = planSpatialConversion(document('broken.jsonfg', '{"conformsTo":'));
  const invalid = planSpatialConversion(document('missing-core.jsonfg', {
    type: 'Feature',
    place: { type: 'Point', coordinates: [1, 2] },
    geometry: null,
    properties: {},
  }));
  const unsupported = planSpatialConversion(document('sequence.jsonfg', {
    type: 'FeatureSequence',
    conformsTo: [CORE],
    features: [],
  }));

  assert.equal(malformed.status, 'blocked');
  assert.match(malformed.reason, /JSON syntax/i);
  assert.equal(invalid.status, 'blocked');
  assert.match(invalid.reason, /JSON-FG/i);
  assert.equal(unsupported.status, 'blocked');
  assert.match(unsupported.reason, /Feature and FeatureCollection roots/);
});
