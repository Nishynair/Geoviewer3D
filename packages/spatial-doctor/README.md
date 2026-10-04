# @nish-andran/spatial-doctor

`@nish-andran/spatial-doctor` is a framework-independent GeoJSON inspector and
geometry measurement library. It provides two runtime functions,
`inspectGeoJSON(input)` and `measureGeoJSONGeometry(input)`, with TypeScript
declarations for their result types. It does not depend on a UI or viewer.
Import it as an ECMAScript module in Node.js 20 or later, or through a modern
browser bundler.

`inspectGeoJSON(input)` accepts an already-parsed JavaScript value. It does not
parse editor or file text. A valid report contains `valid: true`, a `summary`,
`coordinates` summary, and a diagnostics array. An invalid report contains
`valid: false`, `summary: null`, `coordinates: null`, and stable diagnostics.
An invalid report may include an open-ring finding with a feature or coordinate
reference when that ring's coordinate tuples can be read safely. Such a finding
does not make the document valid or viewer-eligible.

## Install

```sh
npm install @nish-andran/spatial-doctor
```

## JavaScript example

Save as `example.mjs` and run with `node example.mjs`:

```js
import assert from 'node:assert/strict';
import {
  inspectGeoJSON,
  measureGeoJSONGeometry,
} from '@nish-andran/spatial-doctor';

const line = {
  type: 'LineString',
  coordinates: [
    [103.8198, 1.3521, 15.2],
    [103.8208, 1.3531, 15.8],
  ],
};
const document = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { name: 'Example' }, geometry: line },
  ],
};

const report = inspectGeoJSON(document);
assert.equal(report.valid, true);
if (!report.valid) throw new Error('Expected this GeoJSON to be valid.');
assert.deepEqual(report.coordinates.zRange, { min: 15.2, max: 15.8 });
assert.deepEqual(inspectGeoJSON(document), report);

const measurements = measureGeoJSONGeometry(line);
assert.ok(measurements);
assert.equal(measurements.geometryType, 'LineString');
assert.equal(measurements.coordinateCount, 2);
assert.ok(measurements.horizontalLength.meters !== null);
assert.ok(measurements.threeDimensionalLength.meters !== null);

console.log({ report, measurements });
```

## TypeScript example

The package includes declarations for the report, diagnostics, coordinate
summary, and measurement result. Save as `example.ts` in a TypeScript project
using Node's `NodeNext` module resolution:

```ts
import {
  inspectGeoJSON,
  measureGeoJSONGeometry,
} from '@nish-andran/spatial-doctor';
import type {
  Diagnostic,
  GeometryMeasurementSummary,
  InspectionReport,
} from '@nish-andran/spatial-doctor';

const line = {
  type: 'LineString',
  coordinates: [
    [103.8198, 1.3521, 15.2],
    [103.8208, 1.3531, 15.8],
  ],
};
const document: unknown = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { name: 'Example' }, geometry: line },
  ],
};

const report: InspectionReport = inspectGeoJSON(document);
const diagnostics: Diagnostic[] = report.diagnostics;
const measurements: GeometryMeasurementSummary | null =
  measureGeoJSONGeometry(line);

if (report.valid) {
  console.log(report.coordinates.zRange);
}
console.log(diagnostics.length, measurements?.horizontalLength.meters);
```

The API is deterministic for the same input value. `inspectGeoJSON` describes
the input's structure and coordinate checks; its `valid` flag indicates whether
the GeoJSON structure validator accepted the input. Invalid reports keep the
summary and coordinate summary unavailable. The selected-geometry function
returns `null` for invalid input or a Feature/FeatureCollection root.

## Feature and geometry counts

- A FeatureCollection's feature count is its number of features.
- A Feature counts as one, including a Feature whose geometry is `null`.
- A bare Geometry counts as zero features.
- Geometry counts include every Geometry object at the root or in a Feature.
  A GeometryCollection counts as one of its own type, and its child geometries
  are counted recursively, including nested GeometryCollections.
- Geometry types with no occurrences are omitted. An empty dataset therefore
  has `geometryCounts: {}`; an empty GeometryCollection counts as one
  GeometryCollection.

## Coordinate summary

Valid reports include `coordinates`; invalid reports set `coordinates: null`.
The summary counts every coordinate tuple, including a polygon ring's repeated
closing tuple, and traverses nested GeometryCollections. `dimensions` is `XY`,
`XYZ`, `mixed`, or `empty`. Bounds use ordinary minimum and maximum X and Y
values without antimeridian handling. `zRange` uses only the third ordinate and
reports its numeric minimum and maximum without assigning altitude semantics.
Empty coordinate sets have `bounds: null` and `zRange: null`; a dataset with XY
coordinates has `zRange: null`.

## Selected geometry measurements

`measureGeoJSONGeometry(geometry)` validates and measures one parsed GeoJSON
Geometry. It returns `null` for invalid input or for a Feature/FeatureCollection
root. `coordinateZ` lists the third ordinate for every coordinate in the
geometry; each `path` is a zero-based index path through coordinate arrays and
`GeometryCollection.geometries`. Repeated polygon closing tuples remain in the
list and in `zStatistics`. Z statistics contain minimum, maximum, and mean of
present third ordinates plus the number present and missing. When no coordinate
has Z, the statistics are `null` and the counts remain explicit.

Line profiles are available for `LineString` and `MultiLineString` components,
including lines nested in GeometryCollections. Each component is measured
independently; no segment joins separate MultiLineString or collection members.
Profiles retain each coordinate's Z and cumulative horizontal distance from the
component start. Segment grade percent is calculated as
`100 * (next Z - current Z) / horizontal distance`; it is unavailable when
either Z is missing, the horizontal distance is zero, or the horizontal
coordinates cannot be measured.

Horizontal distance is a spherical longitude/latitude approximation using a
6,371,008.8 m radius, and is only computed for finite longitude/latitude values
within `[-180, 180]` and `[-90, 90]`. It is not an ellipsoidal geodesic. Z is
treated as meters for arithmetic under the GeoJSON third-ordinate convention;
the package performs no vertical datum inference or conversion. A 3D segment is
measured only when both endpoint Z values and horizontal distance are available.
Distance summaries give measured and total segment counts; a partial sum is
never presented as a complete length, and no 3D distance is reported as zero
when no segment has two Z values. If a segment or sum exceeds the finite numeric
range, its measurement is unavailable instead of returning `Infinity` or
`NaN`; aggregate overflow is marked with `rangeExceeded: true`.

## Diagnostic navigation references

`inspectGeoJSON` analyzes an already-parsed value and does not receive the
original source text, so it does not emit source offsets. Its diagnostics may
carry a `featureId`, a zero-based `featureIndex` into a FeatureCollection (or
index `0` for a root Feature), and a `coordinatePath` through geometry
coordinate arrays and nested `GeometryCollection.geometries` arrays. A bare
Geometry has no Feature to reference. The exported `Diagnostic` type includes
an optional `sourceLocation` field for consumers that resolve a diagnostic
against their own source text; when present, it is a half-open range of
zero-based UTF-16 offsets into that text.

The supported diagnostic codes are:

`invalid-geojson` describes structural validation. The remaining five codes
below are the complete set of coordinate-quality checks.

- `invalid-geojson` (`error`): the GeoJSON structure validator rejected the
  document. Coordinates and summary are unavailable. This remains the viewer
  eligibility gate.
- `duplicate-consecutive-position` (`warning`): one coordinate tuple exactly
  repeats the full preceding tuple, including Z and any additional ordinates.
- `mixed-coordinate-dimensions` (`warning`): the document contains both XY and
  XYZ coordinate tuples; one finding points to the first position with the
  dimension that differs from the first tuple.
- `coordinate-out-of-range` (`error`): a finite longitude falls outside
  `[-180, 180]` or latitude outside `[-90, 90]`. The app omits the affected
  feature geometry from the globe.
- `unclosed-polygon-ring` (`error`): a ring's final tuple does not exactly
  match its first tuple. When structural validation fails, the inspector emits
  this finding only if the ring is an array of finite numeric tuples; its path
  points to the final supplied tuple. Invalid geometry remains ineligible for
  rendering.
- `excess-coordinate-precision` (`warning`): one finding per coordinate tuple
  when any finite ordinate has more than **15 significant decimal digits** in
  its shortest JavaScript `Number.prototype.toString()` representation. This
  threshold is a deterministic representation heuristic. JSON parsing may
  already discard differences in the original number text; the check cannot
  recover those digits or establish that the represented value is accurate or
  needs that many digits.

Finding counts include every emitted diagnostic, including each repeated tuple,
out-of-range tuple, safely readable open ring, and high-precision coordinate
tuple. They are counts of findings, not a completeness score. The inspector
does not test topology or every aspect of spatial quality.
