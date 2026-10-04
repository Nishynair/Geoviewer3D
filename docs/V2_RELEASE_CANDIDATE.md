# GeoViewer3D v2.0 release candidate

**Status:** Candidate for final review; [PR #37](https://github.com/Nishynair/Geoviewer3D/pull/37) is not merged. This is not a
release announcement. GitHub Pages deploys from `main`, so the live site still
serves the existing main build until the candidate is merged and its deployment
is verified. No `v2.0` tag or GitHub Release exists.

## Candidate contents

- The original editor and Cesium viewer now open with an Inspector-led first-use
  path, file selection/drop, local-processing and external-map disclosure, and
  three authored demos. Their provenance and licenses are in
  [Built-in demo data](./DEMO_DATA.md).
- The Inspector reports structural validation and five deterministic findings:
  repeated adjacent tuples, mixed XY/XYZ dimensions, longitude/latitude outside
  range, unclosed polygon rings, and excess coordinate precision. Invalid or
  unsafe geometry is withheld from the globe; findings and counts do not claim
  comprehensive spatial validity.
- Source navigation, safe feature selection, repair previews, supported
  JSON-FG conversion, coordinate measurements, and explicit terrain comparison
  are documented in [Phase 5 workflows](./PHASE5_WORKFLOWS.md).
- `@nish-andran/spatial-doctor@1.0.0` is public. It exports
  `inspectGeoJSON` and `measureGeoJSONGeometry` as ESM JavaScript with TypeScript
  declarations. It has no React, Cesium, editor, or app dependency.

## Verification evidence

The release candidate passed these project checks on Node 20.20.2 after a clean
`npm ci`:

- `npm test` — 160 tests passed.
- `npm test --workspace @nish-andran/spatial-doctor` — 27 package tests passed.
- `npm run typecheck`, `npm run lint`, and `npm run build` — passed. Vite reports
  an existing large-chunk advisory; the build completes.
- The published package was installed from the public registry into a clean
  consumer. Its README JavaScript example ran on Node 20.20.2 and Node 24.1.0;
  the TypeScript example compiled against the installed declarations.
  Registry integrity for `@nish-andran/spatial-doctor@1.0.0` is
  `sha512-PdpS4o5yEeeyfUWUrsPiZge9++thePoouN+vG+UGnMybZK8NsdM98lhvIDIT2Pyqs7BtvFjEZlgqfP++eB++fQ==`.

An isolated Chrome session checked the local candidate at desktop and mobile
sizes. `Clean3DBuildings`, `BrokenGeometry`, and `ElevationTerrain` loaded with
their computed Inspector summaries. The broken demo showed three actual
findings; its out-of-range point remained in source and out of the globe. The
terrain demo compared all three coordinates, with no unavailable samples. A
synthetic file drop loaded a valid Point, malformed JSON stayed editable with a
syntax error, and parseable non-GeoJSON stayed editable with an invalid report.
For the tested terrain, imagery, and buildings, Cesium Ion requests returned
successfully. The app processes source text in-browser, while map requests can
disclose the viewed area; an explicit terrain comparison sends the selected
feature coordinates for sampling.

Reviewable screenshots: [V1 editor/viewer](../apps/web/public/Geoviewer3D_screen1.png),
[V2 BrokenGeometry desktop](./screenshots/v2-broken-geometry-desktop.png), and
[V2 Clean3DBuildings mobile](./screenshots/v2-clean-mobile.png).

The browser file-drop check used a synthetic `File`; it did not emulate an OS
file-manager drag. Earlier desktop/mobile and source-navigation checks are
recorded with the release worktree evidence. A favicon request returned 404 in
the local session; it did not block the app. The running app otherwise rendered
the globe, buildings, controls, and Inspector.

## Bounded limitations

- These five checks do not test polygon topology, self-intersection, CRS
  correctness, 3D solid validity, or numeric accuracy. The precision finding is
  a heuristic over the shortest JavaScript number representation, not the
  original JSON token after parsing.
- Z is the third coordinate ordinate, not inferred altitude or a known vertical
  datum. Terrain comparisons are meaningful only with compatible vertical
  references. JSON-FG support is a documented Core subset; native `place`
  values are preserved in source but are not rendered, and no CRS reprojection
  is performed.
- A zero-extent Point can render and be selected, but automatic orbit rotation
  is disabled when there is no spatial extent.
- The production build emits Vite's large-chunk advisory. The local browser
  emitted a favicon 404; neither prevented the tested journeys.

## Remaining release sequence

1. Complete the final independent Spec/behavior and Standards review and record
   that no P0–P2 findings remain.
2. Merge PR #37, then verify the main-only GitHub Pages workflow and the deployed
   first-use, demo, diagnostic, and map journey. Record the deployment run and
   observed result before calling the web candidate deployed.
3. Prepare the exact proposed `v2.0` tag and GitHub Release notes for the user.
   Stop for explicit user approval before creating or pushing either one.

The separately published npm package is already verified; no further npm
publication is part of this candidate step.
