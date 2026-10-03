# Architecture

Geoviewer3D V2 is a browser-based spatial data inspector and debugger. It remains a static client-side application: inspection is deterministic, with no runtime AI service or backend.

## Application and package boundary

The `apps/web` workspace owns file/source editing, JSON parsing, the canonical `SpatialDocument`, and the React/Cesium/Monaco experience. It passes already-parsed values to the independent `packages/spatial-doctor` workspace through `inspectGeoJSON(input: unknown)`. The package validates and summarizes GeoJSON without depending on the web application or browser libraries. The web app stores that report with the source document and sends parsed GeoJSON to Cesium only when the report is valid.

The package currently reports feature and geometry counts, coordinate-tuple count, XY/XYZ/mixed/empty dimensions, simple X/Y bounds, Z range, and stable validation diagnostics. Counts include recursively nested GeometryCollections and physically represented ring-closing tuples. Bounds are ordinary coordinate minima and maxima; Z is the third ordinate only.

## Current boundary

Phase 1 establishes strict TypeScript, npm workspaces, the canonical document and report boundary, independent package tests, and V1 continuity. The existing web app remains the user interface; Phase 1 adds no polished Inspector panel or new visual debugging tools.

After human review of Phase 1, later work may expose reports in an Inspector UI, link diagnostics to features and source, add Z-aware analysis, and investigate repair or JSON-FG workflows. Those capabilities are not part of this foundation. The [authoritative handoff](./CODEX_HANDOFF.md) and [V2 specification](./V2_SPEC.md) define the full product direction and phase boundaries.

## Deployment

`apps/web` builds a static site with the `/Geoviewer3D/` base path and Cesium assets under the same path. The existing GitHub Pages workflow builds `main` and publishes `dist`; this branch's V2 changes have not been deployed to the live site. Local development and production builds need `VITE_CESIUM_TOKEN` in the repository-root `.env.local`; the Pages workflow reads the same variable from its repository secret.
