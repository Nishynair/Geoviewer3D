# GeoViewer3D v2.0 Release Plan

> **For agentic workers:** Use `superpowers:executing-plans` to carry out this plan task by task. Keep each workstream reviewable and test its public behavior.

**Goal:** Prepare a polished, honest v2.0 release that helps a first-time user inspect a spatial file quickly and makes `spatial-doctor` a real, reusable npm package.

**Architecture:** Keep the React/Vite app as a static browser application and keep deterministic GeoJSON inspection in the existing framework-independent `packages/spatial-doctor` package. The app owns onboarding, curated examples, repairs, JSON-FG adaptation, and Inspector presentation; the package owns reusable inspection and measurement behavior.

**Tech Stack:** React, TypeScript, Vite, Monaco, Cesium, npm workspaces, Vitest, `@placemarkio/check-geojson`.

## Global Constraints

- Baseline: `main` at merge `8d8ce2b` after Phase 5. Preserve unrelated untracked project notes and ignored local configuration.
- Keep the existing static GitHub Pages deployment and browser-side document workflow.
- Add no CLI, new format, package, service, backend, or generalized subsystem. Publish only the existing reusable `spatial-doctor` package.
- Retain the public `measureGeoJSONGeometry` API; the web app uses it. Do not remove or break it gratuitously.
- Add exactly five deterministic diagnostic check families: duplicate consecutive positions; mixed XY/XYZ dimensions; longitude/latitude out of range; unclosed polygon rings; excessive coordinate precision.
- Every emitted diagnostic has a stable code and severity with a plain-language explanation. Include a feature reference when there is one, and a coordinate path/source range when they can be resolved safely. Never invent a feature, location, finding, or score.
- Show counts derived from checks actually performed. State what was checked and its limits; do not imply comprehensive spatial validity.
- Unsafe or invalid geometry stays out of the viewer. A dataset-wide or unlocatable diagnostic must not be presented as a feature-level map issue.
- Explain that file inspection is performed in the browser and disclose actual external Cesium imagery, terrain, and building requests. Verify privacy wording against observed runtime requests before publishing it.
- The five detectors must be deterministic. Treat excessive precision as a documented heuristic over the numeric/source representation available; do not claim original lexical precision after JSON parsing if it cannot be recovered.
- Publish `spatial-doctor` only after its built JavaScript and declaration files install and work in a clean external consumer. Publish version `1.0.0` only after its public API is stable and agreed. The npm owner/name and publishing authorization are open release inputs; do not print credentials or claim publication before registry verification.
- Create the `v2.0` application tag only after implementation, independent review, and release checks pass.
- Mechanical implementation and independent review work use the requested Luna max model.

## Baseline Evidence

- `README.md` has one screenshot, the live app link, environment setup, root commands, and project-document links; it does not provide a first-run walkthrough or data-flow illustration.
- The default KLCC XYZ sample plus the Examples menu's open-ring and native-place samples provide starting material for three demos. The current app has file upload, but no drag/drop handler was found.
- `spatial-doctor` currently exports `inspectGeoJSON(input)` and `measureGeoJSONGeometry(input)`. Its valid report already has `coordinates.zRange`; its only diagnostic code is `invalid-geojson`, currently dataset-wide. Valid documents currently produce no diagnostics.
- `packages/spatial-doctor/package.json` is private, version `0.0.0`, and directs both runtime and type exports at TypeScript source. It has no distributable JavaScript/declaration build.

## Ordered Workstreams

### 1. Audit the first-use experience in Chrome

- Inspect the current app at desktop and mobile sizes using the approved isolated Chrome session.
- Measure the actual first-use path from opening the app to loading a local GeoJSON or JSON-FG file and seeing useful results. Check upload and drag/drop behavior, errors, keyboard access, and the current panel state.
- Observe network requests while opening a local file and the three Cesium layers. Record what stays in browser memory and which external services are contacted. Base privacy and connectivity copy on those observations.
- Save concise findings and the resulting UX decisions in this plan before changing the app.

**Acceptance:** The plan records verified first-use friction, external-service behavior, and the exact onboarding changes needed for a roughly ten-second first result.

### 2. Improve the starting point and onboarding

- Present a clear initial action for opening or dropping GeoJSON/JSON-FG and make the next useful action obvious without needing to discover the editor.
- Keep the existing editor/viewer available and preserve upload, copy, download, validation, and repair behavior.
- Show local-processing and external-Cesium disclosure where a first-time user will see it. Say exactly which processing is local and which map services require network access.
- Cover empty, loading, syntax-error, invalid-document, unsupported-JSON-FG, and valid-document states. Do not render invalid geometry.

**Acceptance:** A new user can load a local supported file, understand the current result and its limitations, and reach the editor/viewer without setup beyond the visible instructions.

### 3. Curate three one-click demos

Provide these three named starting states from the app's visible demo entry point:

- `Clean3DBuildings`
- `BrokenGeometry`
- `ElevationTerrain`

Prefer small authored fixtures. For each demo, record provenance, license, any modifications, and what it demonstrates. If an external source is used, preserve attribution and license terms. Use real computed summaries; do not invent feature counts, elevations, or diagnostic totals in labels or docs.

**Acceptance:** Each demo loads in one selection, starts in its intended useful view, is deterministic, and has reviewable provenance/license metadata.

### 4. Add the five bounded diagnostic checks

Add checks for the five families listed in Global Constraints. Define the deterministic rule and severity for each. Distinguish data that is invalid from data that is valid but noteworthy; for example, a warning must not silently block otherwise valid viewer content. Use a fixed documented precision heuristic and explicit longitude/latitude limits. Avoid self-intersection and all other unapproved diagnostic families.

Diagnostic definitions must explain the condition in plain language. Attach stable feature indexes/IDs, coordinate paths, and UTF-16 source ranges only when they refer to the actual current document and can be safely mapped. Keep source-range lookup structural; do not guess offsets from formatted JSON.

**Acceptance:** Fixture-backed public-API tests cover each check, severity, stable code, repeated-call determinism, optional-reference behavior, and valid versus invalid viewer eligibility. Counts equal actual emitted findings, including zero.

### 5. Connect findings to the Inspector and viewer

- Present actual finding counts by severity/check, with a no-findings state. Do not create an ungrounded star rating or overall health percentage.
- Show the diagnostic's stable code and plain-language explanation. Where a valid, current feature reference exists, let the user select/highlight it and move the camera. Where a verified source range exists, navigate to it in Monaco.
- Keep dataset-wide findings dataset-wide. For invalid geometry, show the source issue but never claim it was rendered or highlighted on the map.
- Ensure a document edit/replacement clears stale selections, ranges, and camera targets.

**Acceptance:** Tests exercise real diagnostic rendering and the navigation actions; invalid or stale references cannot navigate to unrelated geometry.

### 6. Polish the `spatial-doctor` contract and documentation

- Keep `inspectGeoJSON(input: unknown)` as the independent inspection entry point and preserve `measureGeoJSONGeometry(input: unknown)` for existing consumers.
- Document the actual valid/invalid report shapes, stable diagnostic fields/codes, counting conventions, bounds, `coordinates.zRange`, and the distinction between the third ordinate and interpreted altitude.
- Document measurement units/assumptions and unavailable results exactly as implemented. No vertical datum inference, false precision, or claims beyond tested behavior.
- Keep application parsing, JSON-FG adaptation, Cesium, React, Monaco, and UI copy out of the package.

**Acceptance:** Package tests establish stable public behavior for inspection and measurement; package docs show the actual `zRange` location and actual API return values.

### 7. Build and publish the reusable npm package

- Compile the package to ESM JavaScript plus `.d.ts` declarations. Update `exports`, `types`, `files`, scripts, license metadata, and README install/API examples so an ordinary JavaScript/TypeScript consumer can use it without Vite or native TypeScript loading.
- Keep the validated GeoJSON dependency declared as a runtime dependency. Keep package contents limited to the package, declarations, README, and license.
- Run `npm pack --dry-run`, inspect the tarball contents, then install that tarball into a clean temporary consumer and test both JavaScript imports and TypeScript declarations.
- Resolve and verify the final npm package name/owner and publishing authorization before publishing. If these remain unresolved, finish and verify the packable artifact but report npm publication as pending; do not publish under an assumed owner or claim that it was published.
- Publish `1.0.0` only if API stability has been explicitly established. Do not create an unnecessary extraction package or add XYZ/CLI functionality.

**Acceptance:** A clean external consumer imports the built API and types from the packed artifact. Registry publication is reported only after checking the exact package/version in npm.

### 8. Refresh README, docs, and architecture for the portfolio release

- Tell the short V1-to-V2 story accurately: preserve the original 3D editor/viewer and show how the V2 inspection workflow grew from it.
- Use current, genuine screenshots and label each as V1 or V2 accurately. Include one concise data-flow illustration distinguishing app-owned parsing/repairs/JSON-FG work, `spatial-doctor`, Cesium rendering, and external map services.
- Explain the first-run action, the three demos, actual diagnostic families, package installation/API, and checks/limitations. Keep the tone practical and portfolio-scale, not startup marketing.
- Update `docs/ARCHITECTURE.md` and other active workflow docs only where their release status is stale. Keep `docs/CODEX_HANDOFF.md` and `docs/V2_SPEC.md` as approved historical requirements; do not rewrite them to justify implementation changes.

**Acceptance:** README links resolve, visuals come from the real app, package and diagnostic claims match tested behavior, and local/external processing is explicit.

### 9. Independent review and release

- Run root install, test, typecheck, lint, build, and development workflows; run package tests independently; repeat packed-consumer verification.
- Complete the Chrome UX acceptance for all three demos, valid and invalid input, diagnostic-to-source/map paths, and the external Cesium disclosure. Verify the production Pages base path and Cesium assets.
- Obtain independent Spec/behavior and Standards review. Fix every P0–P2 finding and repeat the relevant gates until both reviews clear. Do not count self-review as independent review.
- Publish the web release and create the `v2.0` tag only after release checks and review are clear. Publish the npm package only under the resolved name/owner and verified authorization. Record exact versions, checks, URLs, and any remaining bounded limitations.

**Acceptance:** The static app release and any npm package publication are verifiable and accurately described; no open P0–P2 issues remain.

## Release Checklist

- [ ] Workstreams 1–9 completed in order; each leaves reviewable evidence.
- [ ] Exactly the five approved diagnostic check families shipped; no extra diagnostic family or unsupported health score.
- [ ] All three demos load and include provenance/license/modification/purpose records.
- [ ] All emissions have stable codes and severities; references and explanations are truthful; unsafe invalid geometry is never rendered.
- [ ] `spatial-doctor` packed artifact contains runnable JS, `.d.ts`, README, and license, and passes a clean external consumer check.
- [ ] npm owner/name and auth are resolved before registry publication; package is `1.0.0` only if the API is stable.
- [ ] README screenshots/illustration, first-use guidance, data-processing disclosure, API examples, and known limitations match observed behavior.
- [ ] Root checks, Chrome UX check, Pages build/path/assets, and independent review/fix loop pass.
- [ ] `v2.0` tag created only after the above; release notes name the actual app and package release state.

## Decisions Still Required at Release Time

- Final npm package name/scope and owner account. The existing package name is unscoped and private; do not assume it can be claimed or published.
- Whether the public package API is stable enough for `1.0.0` after API review. If not, defer npm publication/version without blocking the app release.
