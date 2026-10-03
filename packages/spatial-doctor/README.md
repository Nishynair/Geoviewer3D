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

Diagnostics may carry a `featureId`, a zero-based `featureIndex` into a
FeatureCollection (or index `0` for a root Feature), and a `sourceLocation`.
The source location is a half-open range of zero-based UTF-16 offsets into the
original text. Feature IDs are used only when they identify exactly one
feature; the index can identify a feature without an ID. A bare Geometry has no
feature to reference. The current inspector emits dataset-wide validation
diagnostics only, so it does not offer geometry navigation for those rows.
