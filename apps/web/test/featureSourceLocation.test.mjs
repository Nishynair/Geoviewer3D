import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  findFeatureSourceLocation,
  resolveDiagnosticSourceLocation,
} from '../src/utils/featureSourceLocation.ts';

test('maps an idless FeatureCollection member through nested JSON and escaped strings', () => {
  const rawText = `{
  "note": "escaped quote: \\"features\\": [ and braces { }",
  "features" : [
    { "type": "Feature", "properties": { "note": "} ] \\" text" }, "geometry": { "type": "Point", "coordinates": [1, 2] } },
    {
      "type": "Feature",
      "properties": { "name": "second" },
      "geometry": { "type": "GeometryCollection", "geometries": [
        { "type": "LineString", "coordinates": [[3, 4], [5, 6]] }
      ] }
    }
  ],
  "type": "FeatureCollection"
}`;
  const parsed = JSON.parse(rawText);

  const location = findFeatureSourceLocation(rawText, parsed, 1);

  assert.notEqual(location, null);
  assert.deepEqual(JSON.parse(rawText.slice(location.start, location.end)), parsed.features[1]);
  assert.equal(rawText[location.start], '{');
  assert.equal(rawText[location.end - 1], '}');
});

test('maps a root Feature and ignores bare geometries with no Feature source node', () => {
  const rawFeature = '{\n "properties": {}, "type": "Feature", "geometry": null }';
  const feature = JSON.parse(rawFeature);

  const location = findFeatureSourceLocation(rawFeature, feature, 0);

  assert.deepEqual(JSON.parse(rawFeature.slice(location.start, location.end)), feature);
  assert.equal(findFeatureSourceLocation('{"type":"Point","coordinates":[1,2]}', {
    type: 'Point',
    coordinates: [1, 2],
  }, 0), null);
});

test('returns no source range for missing members, invalid indexes, or malformed text', () => {
  const rawText = '{ "type": "FeatureCollection", "features": [] }';
  const parsed = JSON.parse(rawText);

  assert.equal(findFeatureSourceLocation(rawText, parsed, 0), null);
  assert.equal(findFeatureSourceLocation(rawText, parsed, -1), null);
  assert.equal(findFeatureSourceLocation('{ "type": ', parsed, 0), null);
});

test('maps the parsed effective features member when duplicate JSON keys occur', () => {
  const rawText = '{ "type": "FeatureCollection", "features": [], "features": [ { "type": "Feature", "properties": null, "geometry": null } ] }';
  const parsed = JSON.parse(rawText);
  const location = findFeatureSourceLocation(rawText, parsed, 0);

  assert.deepEqual(JSON.parse(rawText.slice(location.start, location.end)), parsed.features[0]);
});

test('diagnostic source actions share the valid explicit range or structural feature fallback', () => {
  const rawText = '{ "type": "Feature", "properties": {}, "geometry": null }';
  const parsed = JSON.parse(rawText);
  const expectedFeatureLocation = findFeatureSourceLocation(rawText, parsed, 0);

  assert.deepEqual(resolveDiagnosticSourceLocation(rawText, parsed, {
    featureIndex: 0,
    sourceLocation: { start: rawText.length + 4, end: rawText.length + 5 },
  }), expectedFeatureLocation);
  assert.deepEqual(resolveDiagnosticSourceLocation(rawText, parsed, {
    featureIndex: 0,
    sourceLocation: { start: 2, end: 12 },
  }), { start: 2, end: 12 });
});
