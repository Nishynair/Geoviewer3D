# Phase 1 review summary

**Status: ready for human approval.** Phase 1 provides a reviewable foundation and preserves the existing V1 viewer. Human approval is the scheduling gate for later phases; this summary does not implement or approve them.

## Delivered

- Migrated the existing web app to strict TypeScript and placed it in the `apps/web` npm workspace.
- Added `packages/spatial-doctor`, a framework-independent GeoJSON inspection package with a deterministic public API and its own tests.
- Made the web app's `SpatialDocument` the source of truth for filename, editable text, parsing outcome, inspection report, and viewer eligibility.
- Retained the existing React, Monaco, and Cesium experience and static GitHub Pages paths. No runtime AI, backend, new format, repair flow, or Inspector UI was added.
- Documented the product vocabulary, architecture, and phase boundary in [CONTEXT.md](../CONTEXT.md), [ARCHITECTURE.md](./ARCHITECTURE.md), and the repository README.

## Evidence

The package suite covers standard GeoJSON root forms, all geometry types, null Feature geometry, empty data, XY/XYZ/mixed coordinate dimensions, simple bounds and Z range, recursively nested GeometryCollections, ring closure counting, stable invalid diagnostics, unsupported input, and input immutability. The app document suite covers parseable valid and invalid values, malformed JSON, inspector-call boundaries, nested collection viewer eligibility, recovery after edits, and cancellation of stale viewer loads/flights.

The required project-root checks are `npm install`, `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run dev`. In this verification, `npm install` and `npm ci` succeeded; the root Vitest suite passed all 18 tests, the separate spatial-doctor command passed all 9 package tests, and typecheck, lint, and build passed. Root tests, build, and dev were also run with Node 20.20.2; the local dev URL returned HTTP 200. Production output retains the `/Geoviewer3D/` base; simulating the Pages workflow's Cesium-folder move leaves Cesium.js, widget styles, the Ion credit image, and worker scripts at the expected artifact paths. Browser smoke checks confirmed the sample, editor, viewer controls, upload/download/copy behavior, and a Cesium canvas on the local preview. With the local token restored, terrain, imagery, and building service requests returned successfully; the existing live V1 site has also been observed rendering its map and buildings.

The checked-out V2 branch is not the live Pages deployment. The current workflow publishes `main`; no merge or live deployment is included in this Phase 1 handoff.

## Review decision

Review Phase 1 as a complete foundation. Start Phase 2 or later only after a human approves this checkpoint. The product scope and acceptance details remain in the [CODEX handoff](./CODEX_HANDOFF.md) and [V2 specification](./V2_SPEC.md).
