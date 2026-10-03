# spatial-doctor

`inspectGeoJSON(input)` accepts an already-parsed JavaScript value. It does not
parse editor or file text. A valid report contains `valid: true`, a `summary`,
and no diagnostics. An invalid report contains `valid: false`, `summary: null`,
and stable diagnostics.

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
