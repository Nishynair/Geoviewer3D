# Geoviewer3D V2 — Codex Handoff

## Context

Geoviewer3D is an existing personal open-source project.

Repository:
`https://github.com/Nishynair/Geoviewer3D`

The original version was built manually, character-by-character, without AI-assisted coding. That version has now been preserved in Git history/tagging.

This new phase is an AI-assisted expansion of that original project.

The goal is **not** to commercially productize Geoviewer3D or build a complete GIS platform.

The goal is to produce a polished, technically interesting, genuinely useful open-source personal project that demonstrates:

- modern React/TypeScript application architecture;
- 3D geospatial visualization;
- computational geometry and spatial-data reasoning;
- good interaction and information design;
- deterministic data analysis;
- reusable open-source npm packages;
- effective use of AI coding agents to increase engineering ambition rather than merely generate code faster.

The final application must be understandable by people with little GIS knowledge while remaining genuinely useful to GIS/geospatial developers.

---

# Product thesis

Geoviewer3D V2 is:

> A browser-based spatial data inspector and debugger.

The core question the application should answer is:

> “Give me spatial data and help me understand what is actually in it.”

This is not intended to become:

- QGIS in a browser;
- a general-purpose GIS editor;
- an autonomous GIS AI agent;
- a raster-processing suite;
- a spatial database client;
- a giant format-conversion service.

The application should stay focused.

---

# Core user experience

A user should be able to load spatial vector data and quickly answer:

1. **What is this?**
   - Format
   - feature count
   - geometry types
   - coordinate dimensions
   - geographic extent
   - Z/elevation statistics

2. **Is something wrong or suspicious?**
   - invalid coordinates
   - geometry problems
   - mixed XY/XYZ dimensionality
   - duplicate coordinates
   - unusual precision
   - suspicious latitude/longitude values
   - other deterministic diagnostics

3. **Where is the problem?**
   - select a diagnostic
   - highlight the affected feature in the 3D viewer
   - navigate the camera to it
   - highlight/locate the corresponding source in Monaco

4. **What does the issue mean?**
   - deterministic plain-language explanations
   - no runtime AI required

5. **What does the third coordinate actually do?**
   - inspect Z
   - elevation profiles
   - true 3D measurements
   - visualize elevation
   - eventually compare geometry height with terrain

6. **What happens when spatial data changes representation?**
   - later support GeoJSON ↔ JSON-FG
   - explain what is preserved, changed, approximated or lost

---

# Runtime constraint: no AI

The deployed application must not depend on an LLM or AI service.

Do not add:

- OpenAI APIs;
- Anthropic APIs;
- runtime agents;
- server-side inference;
- API keys for AI models;
- natural-language GIS agents.

All diagnostics and calculations must be deterministic.

Plain-language explanations should come from structured diagnostic definitions.

Example:

```ts
{
  code: "SELF_INTERSECTION",
  severity: "error",
  title: "Self-intersecting polygon",
  explanation:
    "The polygon boundary crosses itself, making the interior ambiguous.",
  impact:
    "Some spatial operations may fail or produce unexpected results."
}
```

AI is being used to **develop** the project, not as a required part of the finished product.

---

# Deployment constraint

Geoviewer3D must remain deployable as a static application on GitHub Pages.

Prefer:

- client-side processing;
- Web Workers where appropriate;
- deterministic TypeScript libraries;
- browser-native APIs;
- static assets.

Avoid backend infrastructure unless there is an overwhelming technical reason. None is currently expected.

---

# Existing application

The project already contains an operational React/Vite application with:

- CesiumJS;
- Cesium terrain;
- OSM 3D buildings;
- Monaco Editor;
- GeoJSON loading;
- source editing;
- upload/download/copy controls;
- basic GeoJSON validation.

Do not rewrite working functionality purely for stylistic reasons.

The V2 should evolve the existing application.

---

# V2 target scope

The intended finished V2 is deliberately bounded.

## 1. Import

Initial/final target:

- GeoJSON
- JSON-FG
- optionally WKT if inexpensive

Do not add formats merely to increase the length of an import menu.

Do not implement CityJSON, Shapefile, GeoPackage, GeoParquet, LAS, COG, 3D Tiles authoring, STAC, WFS, WMS, etc. unless explicitly revisited later.

---

## 2. Spatial Doctor

Provide a deterministic inspection report.

Examples of dataset facts:

- feature count;
- coordinate/vertex count;
- geometry-type distribution;
- geographic bounds;
- XY/XYZ dimensionality;
- Z minimum;
- Z maximum;
- Z mean where appropriate;
- coordinate precision statistics.

Candidate diagnostics include:

- malformed JSON;
- invalid GeoJSON;
- invalid coordinate;
- longitude outside valid range;
- latitude outside valid range;
- mixed XY/XYZ coordinates;
- missing Z in predominantly XYZ datasets;
- duplicate consecutive vertices;
- unclosed polygon rings;
- excessive coordinate precision;
- eventually self-intersection and other geometric validity issues.

Diagnostics must use stable machine-readable codes.

Example:

```ts
interface Diagnostic {
  code: DiagnosticCode;
  severity: "info" | "warning" | "error";
  message: string;

  featureId?: string | number;
  coordinatePath?: number[];
  location?: [number, number, number?];

  details?: Record<string, unknown>;
}
```

Avoid encoding UI-specific concepts in the diagnostics package.

---

## 3. Visual debugging

The application should tightly synchronize:

- diagnostics;
- Cesium;
- Monaco.

Important interaction:

`diagnostic → feature → camera → source`

and:

`geometry → feature → source → diagnostics`

Examples:

- clicking an error zooms Cesium to the affected feature;
- the geometry is visually highlighted;
- Monaco scrolls to the relevant source location where practical;
- selecting geometry displays its statistics and diagnostics.

This interaction is more important than adding many additional tools.

---

## 4. 3D / Z Inspector

This is a primary differentiator.

Target capabilities include:

- Z min/max/mean;
- identify XY vs XYZ geometry;
- mixed-dimensionality analysis;
- 2D length vs 3D length;
- elevation profile for a selected LineString;
- slope/grade where meaningful;
- color-by-elevation visualization;
- vertical exaggeration;
- per-coordinate Z inspection;
- terrain-difference visualization.

Terrain comparison should be implemented only after the core inspection architecture is stable.

---

## 5. Repair Lab

Keep this intentionally small.

Potential deterministic operations:

- remove duplicate consecutive vertices;
- close unclosed polygon rings;
- normalize ring winding;
- reduce excessive coordinate precision;
- flatten/remove Z.

Every transformation should provide:

- original state;
- proposed/result state;
- measurable differences;
- undo;
- clear indication of what changed.

Never silently mutate user data.

Self-intersection repair should only be added if the implementation can be made reliable and explainable.

---

## 6. JSON-FG

JSON-FG is the main modern-format extension planned for V2.

Target functionality:

- detect JSON-FG;
- inspect JSON-FG;
- visualize supported geometry;
- understand explicit CRS information;
- GeoJSON → JSON-FG conversion;
- JSON-FG → GeoJSON where valid;
- explain preservation/loss during conversion.

The interesting feature is not simply serialization.

The interesting feature is:

> “What changes when I convert this?”

Example:

```text
GeoJSON → JSON-FG

Geometry       preserved
Properties     preserved
Feature IDs    preserved
XYZ            preserved

CRS
implicit CRS84
→ explicit CRS84

Warning
Polygon XYZ still represents a surface rather than a volumetric solid.
```

Do not implement a huge generalized conversion framework prematurely.

---

# Reusable open-source packages

Part of this project is identifying reusable deterministic pieces that deserve to become npm packages.

Important rule:

> Do not create a package until real application code demonstrates that the boundary is useful.

Avoid speculative package architecture.

## Initial package

Create only:

`packages/spatial-doctor`

This package should:

- be framework-independent;
- use TypeScript;
- have no React dependency;
- have no Cesium dependency;
- have no Monaco dependency;
- avoid DOM/browser APIs where possible;
- be independently tested;
- eventually be publishable to npm.

Initial API concept:

```ts
const report = inspectGeoJSON(input);
```

Example result:

```ts
interface InspectionReport {
  summary: DatasetSummary;
  coordinates: CoordinateSummary;
  diagnostics: Diagnostic[];
}
```

---

# Possible later packages

These are ideas, not current requirements.

Do not create them until real code justifies extraction.

### geo3d

Potential reusable functions:

```ts
distance2D()
distance3D()
zRange()
interpolateZ()
calculateSlope()
calculateGrade()
elevationProfile()
hasMixedDimensions()
flattenZ()
```

### JSON-FG tooling

Potential functionality:

```ts
detectFormat()
validateJsonFg()
geojsonToJsonFg()
jsonFgToGeojson()
analyseConversion()
```

Again: do not create these packages pre-emptively.

---

# Repository architecture direction

Preferred eventual structure:

```text
Geoviewer3D/

  apps/
    web/

  packages/
    spatial-doctor/

  fixtures/
    geojson/

  docs/

  package.json
  package-lock.json
```

Use npm workspaces.

Do not switch package managers without a compelling reason.

---

# First implementation phase

The first phase is intentionally boring.

Do not begin with new visual features.

The objective is to create a foundation that preserves current behavior.

## Phase 1 tasks

### A. Convert to TypeScript

Migrate existing application code to TypeScript.

Requirements:

- useful strict typing;
- avoid widespread `any`;
- explicitly model spatial data;
- preserve existing behavior;
- keep migration changes understandable.

---

### B. Introduce npm workspaces

Create:

```text
apps/web
packages/spatial-doctor
fixtures
docs
```

Only `spatial-doctor` should exist as a reusable package at this stage.

---

### C. Introduce a canonical SpatialDocument

The current application separately manages edited text and parsed GeoJSON.

Move toward a single application-level document model.

Conceptually:

```ts
interface SpatialDocument {
  source: {
    name: string;
    rawText: string;
  };

  format: "geojson";

  parsed: GeoJSON.GeoJSON | null;

  parseError: SpatialParseError | null;

  report: InspectionReport | null;
}
```

This exact interface is not mandatory.

Keep it simple.

The important principle is:

> Monaco, Cesium and the Inspector should consume the same canonical document state.

Design so future formats are possible, but do not build a complex generic plugin architecture yet.

---

### D. Initial `spatial-doctor`

Implement enough for:

```ts
inspectGeoJSON(input)
```

to return:

- feature count;
- geometry counts;
- coordinate/vertex count;
- dimensions;
- geographic extent;
- Z min/max when present.

Reuse reliable existing GeoJSON validation dependencies where appropriate.

Do not unnecessarily reimplement RFC validation.

---

### E. Tests

Use Vitest.

Create fixtures for at least:

- valid XY GeoJSON;
- valid XYZ GeoJSON;
- mixed XY/XYZ;
- malformed JSON;
- invalid GeoJSON.

The spatial-doctor tests must run independently of React/Cesium.

---

### F. Documentation

Create concise documentation explaining:

- V2 thesis;
- deterministic-runtime principle;
- architecture;
- current scope;
- deferred scope.

Avoid speculative essays.

---

# Definition of done for Phase 1

Phase 1 is complete only when:

```bash
npm install
npm run test
npm run lint
npm run build
npm run dev
```

work from the expected project location.

The application must still support the existing V1 user experience.

The visual appearance should remain broadly unchanged.

Spatial Doctor does not yet require a polished UI.

No runtime AI dependency may exist.

No unnecessary backend may exist.

No planned future formats should be implemented.

No speculative packages should be created.

---

# Subsequent phases

Do not implement these until Phase 1 has been reviewed.

## Phase 2 — Spatial Doctor UI

Expose:

- dataset overview;
- feature counts;
- geometry distribution;
- dimensions;
- bounds;
- Z statistics;
- first useful diagnostic set.

Add an Inspector UI without performing a total visual redesign.

---

## Phase 3 — Visual debugging

Implement:

- selection model;
- diagnostic → Cesium navigation;
- Cesium → feature selection;
- source linking;
- visual highlighting;
- diagnostic explanations.

This is one of the highest-value phases.

---

## Phase 4 — 3D Inspector

Implement:

- elevation statistics;
- profiles;
- 2D vs 3D measurements;
- elevation visualization;
- vertical exaggeration;
- terrain comparison.

This is the primary visual showcase.

---

## Phase 5 — Repair + JSON-FG + polish

Implement a small repair workflow.

Introduce JSON-FG.

Add conversion intelligence.

Create curated demo datasets.

Improve documentation.

Prepare npm package publishing only for abstractions that have proven useful.

---

# Out of scope unless explicitly reconsidered

Do not independently expand the project into:

- raster processing;
- GeoTIFF tooling;
- COG tooling;
- LiDAR processing;
- LAS/LAZ;
- PostGIS clients;
- databases;
- GeoServer tooling;
- STAC clients;
- WMS/WFS;
- ArcGIS clients;
- map-style editors;
- full GIS drawing/editing;
- Shapefile editing;
- vector-tile generation;
- CityGML;
- full CityJSON;
- 3D Tiles authoring;
- collaboration;
- accounts;
- cloud storage;
- runtime LLM features;
- autonomous agents.

Interesting does not imply in scope.

---

# Engineering principles

1. **Deterministic spatial truth**
   
   Geometry validity and measurements come from algorithms, not an LLM.

2. **Explain, do not hide**
   
   Show why something is suspicious.

3. **Never silently mutate**
   
   Transformations must be explicit and inspectable.

4. **Native semantics first**
   
   Do not flatten formats into GeoJSON merely because GeoJSON is convenient.

5. **Application drives abstractions**
   
   Extract packages from demonstrated reusable needs.

6. **Depth over breadth**
   
   Three excellent workflows are preferable to twenty incomplete tools.

7. **Static first**
   
   Preserve GitHub Pages deployment.

8. **Performance should fail gracefully**
   
   Expensive processing should eventually move off the main UI thread rather than freezing the interface.

9. **Useful to novices and experts**
   
   Use plain-language explanations without hiding precise technical details.

10. **Stop when the project tells a complete story**
    
    This is a bounded open-source personal project, not a startup.

---

# Guidance for Codex

Before changing code:

1. inspect the existing repository thoroughly;
2. understand the current data flow;
3. run the existing application/build if possible;
4. identify the smallest migration path;
5. preserve working behavior.

Do not ask broad product questions that are already answered in this document.

When minor implementation ambiguity exists, choose the simplest conservative approach and record the choice.

If a decision would substantially expand scope, stop and flag it instead of automatically implementing it.

Prefer incremental commits or clearly reviewable changes.

At the end of each implementation unit report:

- what changed;
- why;
- tests added;
- commands run;
- anything deferred;
- any new architectural decision introduced.
