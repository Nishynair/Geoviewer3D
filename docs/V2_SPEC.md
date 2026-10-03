# Geoviewer3D V2 specification

Status: Published as [GitHub issue #6](https://github.com/Nishynair/Geoviewer3D/issues/6). The `ready-for-agent` label is pending repository label-management permissions.

Source of truth: `docs/CODEX_HANDOFF.md` (reviewed 2026-10-02). This specification records the handoff's bounded scope and gives Phase 1 an implementation-ready acceptance boundary. The handoff controls if these documents diverge.

## Problem Statement

The current Geoviewer3D lets a user edit GeoJSON and see it on a Cesium globe, but it does not yet help them reliably understand what is in the data. Source text, parsed GeoJSON, and editor validation are managed separately; there is no deterministic inspection report or shared document model for the editor, viewer, and future Inspector. The project also needs a tested TypeScript foundation before adding richer spatial debugging. A user needs a focused browser-based inspector that is understandable with little GIS knowledge and still useful to geospatial developers, while preserving the simple V1 experience.

## Solution

Evolve the existing application into a browser-based spatial data inspector and debugger. Phase 1 establishes the foundation: migrate the current app to useful strict TypeScript, organize it with npm workspaces, introduce one canonical spatial document state, and build one framework-independent `spatial-doctor` package. Its initial GeoJSON inspection reports feature and coordinate counts, geometry distribution, dimensions, geographic extent, and Z minimum/maximum. Add Vitest fixtures and concise architecture/product documentation. Keep the existing viewer, editor, controls, layout, and static GitHub Pages deployment working; a polished Inspector UI is deferred.

After Phase 1 is reviewed, expose the inspection report in a modest Inspector UI, connect diagnostics with Cesium and Monaco, deepen Z-aware analysis and visualization, then add a small explicit repair workflow and JSON-FG support. These phases deepen the same inspection workflow rather than broadening the app into a general GIS platform. No runtime AI or backend is part of the solution.

## User Stories

### Phase 1 — foundation and V1 continuity

1. As a GeoJSON user, I want the existing KLCC sample to open in the viewer and editor, so that the upgraded app remains immediately usable.
2. As a GeoJSON user, I want to upload my `.json` or `.geojson` file, so that I can inspect my own data as I can in V1.
3. As a GeoJSON user, I want my uploaded source text to appear in the editor, so that I can see and change the data that drives the viewer.
4. As a GeoJSON user, I want edits to update the viewed data after the existing short delay, so that the globe follows my work without an extra action.
5. As a GeoJSON user, I want the editor and globe to refer to the same current document, so that I can trust which source is being inspected.
6. As a GeoJSON user, I want malformed JSON to be represented as a parse error and kept out of viewer loading, so that I can correct the source before it is visualized.
7. As a GeoJSON user, I want invalid GeoJSON to be identified separately from JSON syntax errors, so that I know what kind of correction is needed.
8. As a GeoJSON user, I want to keep the validation feedback already provided by the editor, so that migration does not remove a useful warning.
9. As a GeoJSON user, I want to download the editor text, so that I can keep my work locally.
10. As a GeoJSON user, I want to copy the editor text, so that I can use it elsewhere.
11. As a GeoJSON user, I want to expand the globe and return to the editor on desktop or mobile, so that the existing layout remains practical.
12. As a GeoJSON user, I want the current terrain, imagery, buildings, and camera orbit behavior to remain available, so that the V2 foundation does not regress viewing.
13. As a GIS developer, I want an inspection report with a feature count, so that I can gauge dataset size.
14. As a GIS developer, I want geometry-type counts, so that I can see what kinds of features the data contains.
15. As a GIS developer, I want a coordinate/vertex count, so that I can understand the size of the geometry.
16. As a GIS developer, I want XY and XYZ dimensionality reported, including mixed input, so that the third-coordinate content is visible.
17. As a GIS developer, I want geographic bounds reported, so that I can understand the dataset's extent.
18. As a GIS developer, I want Z minimum and maximum when Z values exist, so that I can see the dataset's vertical range.
19. As a GIS developer, I want inspection outcomes to be deterministic, so that the same input has the same reported facts and diagnostics.
20. As a GIS developer, I want any emitted diagnostic to have a stable machine-readable code, so that later visual debugging can link to it reliably.
21. As a package consumer, I want to call the spatial inspection API without React, Cesium, Monaco, or a browser, so that it can be reused and tested independently.
22. As a maintainer, I want the application code to have useful strict TypeScript types for spatial data, so that subsequent phases can build on clear contracts.
23. As a maintainer, I want one canonical document state to hold source, parsed data, parse error, and report, so that new inspection behavior has a single integration point.
24. As a maintainer, I want npm workspaces for the web app and the one justified reusable package, so that their boundaries are explicit without changing package managers.
25. As a maintainer, I want fixture-backed tests for XY, XYZ, mixed dimensions, malformed JSON, and invalid GeoJSON, so that the initial inspection contract can be verified independently.
26. As a maintainer, I want concise documentation of the V2 thesis, deterministic runtime, architecture, active scope, and deferred scope, so that contributors understand the project's limits.
27. As a maintainer, I want npm install, test, lint, build, and development commands to work from the project root, so that Phase 1 is ready for review.
28. As a maintainer, I want the app to remain deployable as a static GitHub Pages site, so that V2 does not introduce hosting infrastructure.

### Phase 2 — Spatial Doctor UI

29. As a spatial-data user, I want a concise dataset overview, so that I can quickly identify feature counts, geometry distribution, dimensions, bounds, and Z statistics.
30. As a spatial-data user, I want the first useful deterministic diagnostics shown in an Inspector, so that suspicious data is visible without reading raw JSON alone.
31. As a maintainer, I want the Inspector to fit the existing application without a total redesign, so that the inspection workflow remains focused.

### Phase 3 — visual debugging

32. As a spatial-data user, I want to select a diagnostic and navigate to its feature in Cesium, so that I can locate the problem on the globe.
33. As a spatial-data user, I want the selected geometry highlighted and linked to its source in Monaco, so that I can connect the rendered feature with the data that produced it.
34. As a spatial-data user, I want a selected geometry to reveal its statistics and diagnostics, so that I can investigate from the map as well as from the report.
35. As a spatial-data user, I want plain-language explanations drawn from structured deterministic diagnostics, so that I understand their meaning and impact.

### Phase 4 — 3D Inspector

36. As a spatial-data user, I want elevation statistics, per-coordinate Z inspection, and a profile for selected line data, so that I can understand changes in Z.
37. As a spatial-data user, I want 2D and 3D measurements and slope or grade where meaningful, so that I can see the effect of elevation on geometry.
38. As a spatial-data user, I want elevation visualization and vertical exaggeration, so that vertical differences are easier to inspect.
39. As a spatial-data user, I want terrain comparison after the inspection architecture is stable, so that I can compare geometry height with the ground.

### Phase 5 — repair, JSON-FG, and polish

40. As a spatial-data user, I want a small set of explicit deterministic repairs with before/after differences and undo, so that I can correct supported issues without silent mutation.
41. As a spatial-data user, I want to inspect and visualize supported JSON-FG data, so that I can understand its geometry and explicit CRS information.
42. As a spatial-data user, I want GeoJSON/JSON-FG conversion to explain what is preserved, changed, approximated, or lost, so that I can judge whether a conversion is acceptable.
43. As a contributor, I want curated demos and improved documentation, so that I can understand the completed workflows.

## Implementation Decisions

### Phase 1

1. **Migrate rather than rewrite.** Convert the existing React application to TypeScript with useful strict typing and explicit spatial-data types. Preserve V1 behavior and broadly preserve its appearance. Keep migration units reviewable; avoid widespread `any` and style-only rewrites.
2. **Use npm workspaces.** Organize a web application, one `spatial-doctor` package, fixtures, and documentation under the existing npm toolchain. Create no other reusable package in Phase 1. The package boundary is justified by the app's real need for deterministic inspection; avoid further speculative extraction.
3. **Make one canonical application document.** The web app owns source name/raw text, GeoJSON format, parsed data or parse error, and inspection report as one coherent state. Monaco, Cesium, and later the Inspector consume that state rather than maintaining independent interpretations of the source. The illustrative `SpatialDocument` shape in the handoff is guidance, not a fixed interface. Leave room for later formats without implementing a format-plugin framework now.
4. **Keep the source/viewer contract explicit.** Changes to source text lead to a parsed document or an explicit error state before viewer loading. The viewer consumes valid parsed GeoJSON; its established globe, basemap, terrain, buildings, orbit, and responsive presentation remain in place. The Phase 1 work does not add a new visual tool or polished Inspector panel.
5. **Expose one framework-independent inspection API.** A public GeoJSON inspection operation is the seam for the first reusable package. It returns an inspection report with dataset summary, coordinate summary, and diagnostics as appropriate. Initially report feature count, geometry counts, coordinate/vertex count, dimensions, geographic extent, and Z minimum/maximum where present. Define and document counting and empty-dataset conventions during implementation so results are deterministic; do not add unrequested analyses merely to fill the report.
6. **Keep diagnostics reusable.** Any diagnostic emitted by the package has a stable code, severity, message, and optional spatial references such as feature ID, coordinate path, or location. UI-specific concepts stay in the web app. Reuse reliable GeoJSON validation dependencies where useful instead of reimplementing format validation.
7. **Use deterministic browser-side computation.** No deployed LLM, AI service, server inference, runtime agent, or new backend is needed. Preserve static GitHub Pages deployment. Add a Web Worker only if actual workload justifies it; it is not a Phase 1 prerequisite.
8. **Document active and deferred scope concisely.** Explain the product thesis, deterministic runtime, architecture, and phase boundary. Keep the authoritative handoff linked; avoid duplicating speculative future designs.

### Phase 1 clarifications

1. **Raw JSON parsing belongs to the application/document layer.** `spatial-doctor` receives already-parsed JavaScript values through `inspectGeoJSON(input: unknown)`. Malformed JSON produces an application-level parse error and is not passed to `inspectGeoJSON`. Structurally parseable values that are not valid GeoJSON are handled by `spatial-doctor` as invalid GeoJSON. Test malformed JSON at the document parsing seam rather than through `inspectGeoJSON`.

2. **The initial inspector supports all standard GeoJSON root forms**, not only `FeatureCollection`: `FeatureCollection`, `Feature`, bare Geometry objects, and `GeometryCollection`. A `Feature` with `geometry: null` must be handled safely. For reporting purposes, a `FeatureCollection` reports its number of features, a single `Feature` reports one feature, and a bare Geometry reports zero features.

3. **Coordinate/vertex count means coordinate-tuple count.** Count every coordinate tuple physically represented by the geometry, including polygon closing coordinates. Do not attempt to deduplicate vertices or calculate unique geometric vertices during Phase 1.

4. **Phase 1 bounds are simple coordinate bounds.** Report minimum and maximum longitude/X and latitude/Y values found in the data. Antimeridian-aware geographic extent analysis is deferred; do not introduce it implicitly as part of the foundation work.

5. **Z statistics use the third coordinate only.** Coordinates with at least three ordinates contribute their third ordinate to Z minimum/maximum. Phase 1 does not assign semantics to that value or attempt vertical-datum interpretation.

6. **Repository migration must preserve GitHub Pages deployment.** If moving the web application into `apps/web` changes Vite base paths, Cesium asset paths, deployment workflow paths, or build-output assumptions, update the existing deployment configuration as part of Phase 1. The production build must remain suitable for the project's existing static GitHub Pages deployment.

### Later phases, after Phase 1 review

- **Phase 2:** Expose the existing inspection report and the first useful deterministic diagnostics in an Inspector UI within the current application design.
- **Phase 3:** Add a shared selection model linking diagnostic, feature, Cesium camera/highlight, and Monaco source. Support navigation from diagnostics to geometry and from geometry back to the report and source. Explanations come from structured diagnostic definitions.
- **Phase 4:** Add Z-aware analysis and display: per-coordinate inspection, profiles, 2D/3D measurements, slope/grade, elevation styling, vertical exaggeration, and then terrain comparison once the core inspection architecture is stable.
- **Phase 5:** Add a small explainable repair workflow and supported JSON-FG inspection/conversion with an explicit preservation/loss account. Curate demo datasets, improve docs, and consider npm publishing only for abstractions proven in use. WKT remains optional only if inexpensive.

## Testing Decisions

The primary automated test seam is the public `inspectGeoJSON(input)` behavior. Tests should give it representative fixture documents and assert externally visible report facts, invalid-input outcomes, and stable diagnostic semantics. They should avoid assertions about internal traversal functions or React component structure. This seam keeps the spatial package testable without React, Cesium, Monaco, or browser APIs.

Use Vitest and fixtures for, at minimum, valid XY GeoJSON, valid XYZ GeoJSON, mixed XY/XYZ coordinates, malformed JSON, and invalid GeoJSON. Cover feature/geometry/coordinate counts, bounds, dimensions, and Z minimum/maximum through that public API. The existing repository has no automated test suite to copy; its only sample dataset is a KLCC XYZ polygon. Check the preserved V1 experience at the application level during implementation, since package tests alone cannot establish how the editor and Cesium behave together.

Phase 1 is accepted only after `npm install`, `npm run test`, `npm run lint`, `npm run build`, and `npm run dev` work from the project root, and the existing V1 user experience remains available with broadly unchanged visuals. The spatial package's tests must run independently of React/Cesium. No later-phase UI or format support is required for Phase 1 acceptance.

Later phases should test the same user-visible seams they introduce: Inspector outputs; diagnostic/feature/source navigation; 3D calculations and visualization; and explicit repair/conversion outcomes. Select exact tests when those phases are designed and implemented.

## Out of Scope

Phase 1 excludes a polished Inspector UI, new visual features, JSON-FG or WKT implementation, later diagnostic families such as self-intersection, 3D profiles/terrain comparison, repair tools, extra reusable packages, and speculative format infrastructure. Phases 2–5 begin only after Phase 1 review.

The finished V2 remains a bounded vector-data inspector. It does not become a general GIS editor, raster/GeoTIFF/COG or LiDAR/LAS/LAZ processor, PostGIS/database or spatial-service client, Shapefile/GeoPackage/GeoParquet/CityJSON conversion suite, 3D Tiles authoring tool, collaboration platform, cloud-storage product, or runtime AI/agent application. Do not add formats to enlarge an import menu. Self-intersection repair is conditional on a reliable, explainable implementation; terrain comparison follows a stable inspection architecture.

## Further Notes

- Current implementation is a single JavaScript/JSX Vite app. App state holds separate text and parsed GeoJSON; editor validation is local to the Monaco component; Cesium loading is asynchronous. Phase 1 should use these existing boundaries to migrate incrementally, rather than replace the app wholesale.


