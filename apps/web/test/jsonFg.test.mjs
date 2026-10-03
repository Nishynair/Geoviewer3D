import assert from 'node:assert/strict';
import { test } from 'vitest';
import { inspectGeoJSON } from 'spatial-doctor';
import {
  createSpatialDocument as createSpatialDocumentImpl,
  getGeoJSONForViewer,
} from '../src/spatialDocument.ts';

const CORE = 'http://www.opengis.net/spec/json-fg-1/1.0/conf/core';
const JSON_FG_PLUS = 'http://www.opengis.net/def/profile/OGC/0/jsonfg-plus';
const WEB_MERCATOR = 'http://www.opengis.net/def/crs/EPSG/0/3857';
const WGS84_3D = 'http://www.opengis.net/def/crs/OGC/0/CRS84h';

function createSpatialDocument(name, rawText) {
  return createSpatialDocumentImpl(name, rawText, inspectGeoJSON);
}

test('recognizes Core JSON-FG, inspects ordinary geometry, and preserves CRS scope and exact source', () => {
  const input = {
    type: 'FeatureCollection',
    conformsTo: [CORE],
    coordRefSys: WEB_MERCATOR,
    features: [
      {
        type: 'Feature',
        id: 'airport',
        properties: { name: 'Islay' },
        geometry: { type: 'Point', coordinates: [-6.258, 55.682] },
      },
      {
        type: 'Feature',
        id: 'tower',
        properties: { name: 'Tower' },
        geometry: { type: 'Point', coordinates: [101.7, 3.1, 120] },
      },
    ],
  };
  const rawText = JSON.stringify(input, null, 2);
  const document = createSpatialDocument('airports.json', rawText);

  assert.equal(document.format, 'jsonfg');
  assert.equal(document.source.rawText, rawText);
  assert.equal(document.parseError, null);
  assert.equal(document.report?.valid, true);
  assert.deepEqual(document.parsed, {
    type: 'FeatureCollection',
    features: input.features.map(({ type, id, properties, geometry }) => ({ type, id, properties, geometry })),
  });
  assert.deepEqual(getGeoJSONForViewer(document), document.parsed);
  assert.deepEqual(document.jsonFg.coordRefSysDeclarations, [
    { scope: 'root', value: WEB_MERCATOR },
  ]);
  assert.match(document.jsonFg.geometryCrsDescription, /CRS84.*CRS84h/);
  assert.deepEqual(document.jsonFg.unsupportedConstructs, []);
  assert.deepEqual(JSON.parse(document.source.rawText), input);
});

test('identifies JSON-FG Plus as a profile link and reports native place while projecting its GeoJSON geometry', () => {
  const input = {
    type: 'Feature',
    conformsTo: [CORE],
    coordRefSys: { type: 'Reference', href: WGS84_3D, epoch: 2020.5 },
    links: [{ rel: 'profile', href: JSON_FG_PLUS }],
    id: 13,
    featureType: 'Airport',
    properties: { name: 'Islay Airport' },
    geometry: { type: 'Point', coordinates: [-6.258, 55.682] },
    place: { type: 'Point', coordinates: [132440.63, 651435.92] },
  };
  const rawText = JSON.stringify(input);
  const document = createSpatialDocument('airport.json', rawText);

  assert.equal(document.format, 'jsonfg');
  assert.equal(document.parseError, null);
  assert.equal(document.report?.valid, true);
  assert.equal(document.parsed?.type, 'Feature');
  assert.equal(document.parsed?.geometry?.coordinates[0], -6.258);
  assert.equal(document.parsed?.place, undefined);
  assert.deepEqual(document.jsonFg.profileUris, [JSON_FG_PLUS]);
  assert.deepEqual(document.jsonFg.coordRefSysDeclarations, [
    { scope: 'root', value: { type: 'Reference', href: WGS84_3D, epoch: 2020.5 } },
  ]);
  assert.ok(document.jsonFg.unsupportedConstructs.some((item) => item.includes('place')));
  assert.ok(document.jsonFg.unsupportedConstructs.some((item) => item.includes('featureType')));
  assert.equal(document.source.rawText, rawText);
});

test('detects a native-place-only feature but reports that the unsupported place is not rendered', () => {
  const input = {
    type: 'Feature',
    conformsTo: [CORE],
    id: 'solid',
    properties: {},
    geometry: null,
    place: { type: 'Polyhedron', coordinates: [] },
  };
  const document = createSpatialDocument('solid.json', JSON.stringify(input));

  assert.equal(document.format, 'jsonfg');
  assert.equal(document.report?.valid, true);
  assert.equal(document.parsed?.geometry, null);
  assert.equal(getGeoJSONForViewer(document)?.type, 'Feature');
  assert.ok(document.jsonFg.unsupportedConstructs.some((item) => item.includes('place')));
});

test('reports missing root Core declaration and illegal child conformsTo as invalid JSON-FG', () => {
  const missingCore = createSpatialDocument('missing-core.json', JSON.stringify({
    type: 'Feature',
    place: { type: 'Point', coordinates: [1, 2] },
    geometry: null,
    properties: {},
  }));
  const childConformance = createSpatialDocument('child-conformance.json', JSON.stringify({
    type: 'FeatureCollection',
    conformsTo: [CORE],
    features: [{
      type: 'Feature',
      conformsTo: [CORE],
      geometry: { type: 'Point', coordinates: [1, 2] },
      properties: {},
    }],
  }));

  assert.equal(missingCore.format, 'jsonfg');
  assert.equal(missingCore.parseError?.kind, 'invalid-jsonfg');
  assert.match(missingCore.parseError?.message, /root.*conformsTo/i);
  assert.equal(childConformance.format, 'jsonfg');
  assert.equal(childConformance.parseError?.kind, 'invalid-jsonfg');
  assert.match(childConformance.parseError?.message, /only on the JSON-FG root object/i);
  assert.equal(getGeoJSONForViewer(childConformance), null);
});

test('does not allow coordRefSys on a child Feature inside a JSON-FG FeatureCollection', () => {
  const document = createSpatialDocument('child-crs.jsonfg', JSON.stringify({
    type: 'FeatureCollection',
    conformsTo: [CORE],
    features: [{
      type: 'Feature',
      coordRefSys: WEB_MERCATOR,
      properties: {},
      geometry: { type: 'Point', coordinates: [1, 2] },
    }],
  }));

  assert.equal(document.format, 'jsonfg');
  assert.equal(document.parseError?.kind, 'invalid-jsonfg');
  assert.match(document.parseError?.message, /coordRefSys.*JSON-FG root/i);
  assert.equal(getGeoJSONForViewer(document), null);
});

test('uses the .jsonfg filename to keep parseable non-JSON-FG content in the JSON-FG validation path', () => {
  const document = createSpatialDocument('broken.jsonfg', JSON.stringify({
    type: 'Feature',
    properties: {},
    geometry: { type: 'Point', coordinates: [1, 2] },
  }));

  assert.equal(document.format, 'jsonfg');
  assert.equal(document.parseError?.kind, 'invalid-jsonfg');
  assert.match(document.parseError?.message, /root.*conformsTo/i);
  assert.equal(getGeoJSONForViewer(document), null);
});

test('rejects a JSON-FG Plus feature with place but no GeoJSON fallback geometry', () => {
  const document = createSpatialDocument('missing-fallback.json', JSON.stringify({
    type: 'Feature',
    conformsTo: [CORE],
    links: [{ rel: 'profile', href: JSON_FG_PLUS }],
    geometry: null,
    properties: {},
    place: { type: 'Point', coordinates: [1000, 2000] },
  }));

  assert.equal(document.format, 'jsonfg');
  assert.equal(document.parseError?.kind, 'invalid-jsonfg');
  assert.match(document.parseError?.message, /geometry member to be non-null.*place/i);
  assert.equal(getGeoJSONForViewer(document), null);
});

test('keeps unsupported JSON-FG root types distinct from malformed or invalid JSON-FG', () => {
  const document = createSpatialDocument('sequence.json', JSON.stringify({
    type: 'FeatureSequence',
    conformsTo: [CORE],
    features: [],
  }));

  assert.equal(document.format, 'jsonfg');
  assert.equal(document.parseError?.kind, 'unsupported-jsonfg');
  assert.match(document.parseError?.message, /Feature and FeatureCollection roots/);
  assert.equal(document.report, null);
  assert.equal(getGeoJSONForViewer(document), null);
});

test('reports invalid GeoJSON geometry inside a declared JSON-FG document and never exposes it to the viewer', () => {
  const rawText = JSON.stringify({
    type: 'FeatureCollection',
    conformsTo: [CORE],
    features: [{
      type: 'Feature',
      properties: {},
      geometry: 'not a geometry',
    }],
  });
  const document = createSpatialDocument('invalid-geometry.json', rawText);

  assert.equal(document.format, 'jsonfg');
  assert.equal(document.parseError?.kind, 'invalid-jsonfg');
  assert.match(document.parseError?.message, /geometry view is not valid GeoJSON/);
  assert.equal(document.report?.valid, false);
  assert.equal(document.source.rawText, rawText);
  assert.equal(getGeoJSONForViewer(document), null);
});

test('does not classify ordinary GeoJSON foreign coordRefSys or time members as JSON-FG', () => {
  const input = {
    type: 'Feature',
    coordRefSys: WEB_MERCATOR,
    time: '2025-01-01',
    properties: {},
    geometry: { type: 'Point', coordinates: [1, 2] },
  };
  const document = createSpatialDocument('foreign-members.geojson', JSON.stringify(input));

  assert.equal(document.format, 'geojson');
  assert.equal(document.report?.valid, true);
  assert.deepEqual(document.parsed, input);
});

test('does not classify an ordinary GeoJSON time member alone as JSON-FG', () => {
  const input = {
    type: 'Feature',
    time: '2025-01-01',
    properties: {},
    geometry: { type: 'Point', coordinates: [1, 2] },
  };
  const document = createSpatialDocument('time.geojson', JSON.stringify(input));

  assert.equal(document.format, 'geojson');
  assert.equal(document.report?.valid, true);
  assert.deepEqual(document.parsed, input);
});

test('keeps malformed files with an explicit JSON-FG extension identified as JSON-FG', () => {
  const document = createSpatialDocument('broken.jsonfg', '{"type":');

  assert.equal(document.format, 'jsonfg');
  assert.equal(document.parseError?.kind, 'json-syntax');
  assert.equal(document.report, null);
  assert.equal(getGeoJSONForViewer(document), null);
});
