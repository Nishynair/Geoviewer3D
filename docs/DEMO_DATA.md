# Built-in demo data

The first-use panel and **Examples** menu provide three authored GeoJSON demos. The files are small, deterministic fixtures for exercising the existing viewer and inspector; they are not survey or building datasets.

| Demo | Provenance and license | Modifications | Purpose |
| --- | --- | --- | --- |
| `Clean3DBuildings.geojson` | Authored for this repository; no external datasets or copied geometries. GPL-3.0-only under the repository [`LICENSE`](../LICENSE). | Hand-authored closed polygon rings with illustrative XYZ values; no projection, elevation, or source-data transformation. | Show safe XYZ polygon rendering, feature selection, elevation styling, and Inspector measurements without diagnostics. The simple polygons are not extruded building models or surveyed footprints. |
| `BrokenGeometry.geojson` | Authored for this repository; no external datasets or copied geometries. GPL-3.0-only under the repository [`LICENSE`](../LICENSE). | Hand-authored line and point fixtures. One consecutive coordinate is repeated, the features mix XY and XYZ, and one point uses longitude 181. | Show the existing duplicate-position, mixed-dimension, and coordinate-range findings. The out-of-range feature stays in the source and Inspector but is removed from the viewer copy; safe features remain renderable. |
| `ElevationTerrain.geojson` | Authored for this repository; no external datasets or copied geometries. GPL-3.0-only under the repository [`LICENSE`](../LICENSE). | Hand-authored line coordinates and illustrative Z values; these are not measurements of the named area or a vertical-datum conversion. | Show the existing coordinate Z facts, line profiles, color-by-elevation control, and user-triggered terrain-comparison action. Comparison requests send the selected feature's coordinates to Cesium for terrain sampling, and the values should be treated as a workflow example only. |

The Z values in these demos are literal source-coordinate values and are reported as stored. The app does not infer a vertical datum. See the app's starting panel for the current external map-service and terrain-comparison disclosure.
