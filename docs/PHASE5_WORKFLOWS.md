# Phase 5 examples

The app opens with `Clean3DBuildings`. The first-use panel lets you choose `Clean3DBuildings`, `BrokenGeometry`, or `ElevationTerrain` in one selection; the **Examples** menu also contains the earlier `klcc-flat.json` sample, a valid GeoJSON polygon with XYZ positions. The demos are authored synthetic fixtures, and their provenance, license, modifications, and purpose are recorded in [Built-in demo data](DEMO_DATA.md).

Use **Examples** in the top bar to load the demos or the two additional samples:

- `open-ring-repair.geojson` is intentionally invalid because its polygon ring is open. In the Inspector, preview **Close safe unclosed polygon rings**, inspect the proposed output, then apply it. Undo restores the exact source text and filename.
- `native-place.jsonfg` is a JSON-FG Core FeatureCollection with a root `coordRefSys`, an RFC 7946 geometry, and native `place` and `time` members. The globe and geometry metrics use only the RFC 7946 geometry. The Inspector identifies the CRS declaration without treating it as a geometry reprojection.

For a valid GeoJSON Feature or FeatureCollection, the Inspector can prepare a JSON-FG Core output. For supported JSON-FG, it can prepare GeoJSON. Review the **Preserved**, **Changed**, **Approximated**, and **Lost** account and converted text before downloading. Conversion downloads leave the current editor source unchanged. In the JSON-FG sample, the account explains that the native `place`, `time`, `coordRefSys`, conformance declaration, and profile link are not represented in the GeoJSON output; geometry coordinates are preserved without reprojection. GeoJSON foreign members that would acquire JSON-FG meaning block conversion instead of being silently reinterpreted.

The supported JSON-FG path is intentionally limited to Core Feature and FeatureCollection documents with a supported GeoJSON geometry member. Native place values are preserved in the source but are not rendered. This workflow does not perform CRS transformation or infer a vertical datum.
