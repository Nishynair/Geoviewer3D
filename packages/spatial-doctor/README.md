# spatial-doctor

`inspectGeoJSON(input)` accepts an already-parsed JavaScript value. It does not
parse editor or file text. A valid report contains `valid: true`, a `summary`,
and a diagnostics array. An invalid report contains `valid: false`,
`summary: null`, and stable diagnostics. The current inspector emits no
diagnostics for valid GeoJSON and only a dataset-wide validation diagnostic for
invalid GeoJSON.

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

## Diagnostic navigation references

Diagnostics may carry a `featureId`, a zero-based `featureIndex` into a
FeatureCollection (or index `0` for a root Feature), and a `sourceLocation`.
The source location is a half-open range of zero-based UTF-16 offsets into the
original text. Feature IDs are used only when they identify exactly one
feature; the index can identify a feature without an ID. A bare Geometry has no
feature to reference. The current inspector emits dataset-wide validation
diagnostics only, so it does not offer geometry navigation for those rows.
