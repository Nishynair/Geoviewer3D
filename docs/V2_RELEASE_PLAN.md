# GeoViewer3D v2.0 Release Plan

> **For agentic workers:** Use `superpowers:executing-plans` to carry out this plan task by task. Keep each workstream reviewable and test its public behavior.

**Goal:** Prepare a polished, honest v2.0 release that helps a first-time user inspect a spatial file quickly and makes `spatial-doctor` a real, reusable npm package.

**Architecture:** Keep the React/Vite app as a static browser application and keep deterministic GeoJSON inspection in the existing framework-independent `packages/spatial-doctor` package. The app owns onboarding, curated examples, repairs, JSON-FG adaptation, and Inspector presentation; the package owns reusable inspection and measurement behavior.

**Tech Stack:** React, TypeScript, Vite, Monaco, Cesium, npm workspaces, Vitest, `@placemarkio/check-geojson`.

**Current release status (2026-10-04):** Workstreams 1–8 are complete. The
application candidate is PR #37 and is not yet merged or deployed; GitHub Pages
deploys only from `main`. `@nish-andran/spatial-doctor@1.0.0` is published and
verified from the public registry. The final review identified the stale
package-status text below; this update corrects it. No `v2.0` tag or GitHub
Release has been created, and both require explicit user approval.

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
- `@nish-andran/spatial-doctor@1.0.0` is published. Its built JavaScript and declaration files were verified from the public registry in clean external consumers. Do not print credentials or imply a web release before its deployment is verified.
- Create the `v2.0` application tag or GitHub Release only after implementation, independent review, release checks, and the deployed Pages journey pass, and only after explicit user approval.
- Mechanical implementation and independent review work use the requested Luna max model.

## Baseline Evidence

- `README.md` has one screenshot, the live app link, environment setup, root commands, and project-document links; it does not provide a first-run walkthrough or data-flow illustration.
- The default KLCC XYZ sample plus the Examples menu's open-ring and native-place samples provide starting material for three demos. The current app has file upload, but no drag/drop handler was found.
- At the start of this release effort, `spatial-doctor` exported `inspectGeoJSON(input)` and `measureGeoJSONGeometry(input)`, with only dataset-wide `invalid-geojson` diagnostics. The release implementation retains those entry points and adds the five bounded findings in Global Constraints.
- At the start of this release effort, the workspace package was private and had no distributable JavaScript/declarations. It is now published as `@nish-andran/spatial-doctor@1.0.0`; its README examples were tested from the public registry on Node 20 and Node 24, including TypeScript declaration resolution.

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
- Keep the validated GeoJSON dependency declared as a runtime dependency. Limit the packed files to the package manifest, built JavaScript/declarations, README, changelog, and license.
- Run `npm pack --dry-run`, inspect the tarball contents, then install that tarball into a clean temporary consumer and test both JavaScript imports and TypeScript declarations.
- Resolved: the package name is `@nish-andran/spatial-doctor`, published under the authorized `nish-andran` account. The stable public API is published at `1.0.0`; the exact reviewed tarball was verified against public registry metadata and a clean consumer.
- Do not create an unnecessary extraction package or add XYZ/CLI functionality.

**Acceptance:** A clean external consumer imports the built API and types from the packed artifact. Registry publication is reported only after checking the exact package/version in npm.

**Completed:** `@nish-andran/spatial-doctor@1.0.0` was published after the
public JavaScript/declaration artifact passed clean external consumer checks.
The public registry package and the README examples were verified on Node 20
and Node 24; the TypeScript example resolved the published declarations.

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
- Merge and verify the static Pages deployment only after release checks and independent review are clear. Record exact versions, checks, URLs, and any remaining bounded limitations. Stop before creating/pushing the `v2.0` tag or GitHub Release until the user explicitly approves those actions.

**Acceptance:** The static app release and any npm package publication are verifiable and accurately described; no open P0–P2 issues remain.

## Release Checklist

- [x] Workstreams 1–8 completed in order with reviewable evidence.
- [x] Exactly the five approved diagnostic check families shipped; no extra diagnostic family or unsupported health score.
- [x] All three demos load and include provenance/license/modification/purpose records.
- [x] Findings have stable codes and severities; references and explanations are bounded; unsafe invalid geometry is never rendered.
- [x] `@nish-andran/spatial-doctor@1.0.0` contains runnable JS, `.d.ts`, README, changelog, and license, and passes clean external consumer checks.
- [x] Package name/owner and authorization were resolved; the public API was reviewed and published at `1.0.0`.
- [x] README screenshots/illustration, first-use guidance, data-processing disclosure, API examples, and known limitations match observed behavior.
- [x] Root checks and Chrome UX checks pass for the release candidate.
- [x] The production build uses the Pages base path and includes the expected Cesium assets.
- [ ] Independent review/fix loop is clear on the final release-candidate commit.
- [ ] Merge the reviewed candidate, verify the resulting Pages deployment and deployed journey, then record the deployment evidence.
- [ ] After the deployed journey is verified, present the exact proposed `v2.0` tag and GitHub Release for explicit user approval. No tag or GitHub Release has been created.

## Resolved Release Decisions

- The package is `@nish-andran/spatial-doctor`, owned/published by the authorized `nish-andran` account.
- The package API is stable at `1.0.0`; public-registry installation and README examples were verified.
- The application release remains a candidate until the reviewed PR is merged and the main-only Pages workflow deploys it. The `v2.0` tag and GitHub Release require a separate explicit user approval.

The concise candidate evidence, checks, and limitations are recorded in
[V2 release candidate notes](./V2_RELEASE_CANDIDATE.md).

**Chrome UX audit evidence (2026-10-04):** The deployed app was inspected in an isolated Chrome context at desktop 1440×900 and mobile 390×844. It opens with the KLCC sample and Editor tab selected; the Inspector overview is one tab away. Upload is a keyboard-reachable toolbar icon, but there is no drag/drop listener or first-use instruction. Mobile stacks the viewer above the Editor/Inspector tabs, putting much of the editor below the first screen. The deployed document title reads “GoeJSON Viewer”. The invalid open-ring example remains editable, is withheld from the viewer, and exposes repair previews; malformed JSON and unsupported JSON-FG remain in the editor and show errors. The explicit next action can be clearer in the Inspector.

The live network list showed app/Cesium assets from GitHub Pages, Monaco from jsDelivr, Cesium Ion World Terrain and hosted OpenStreetMap building tiles, and Bing Aerial metadata/tiles. Changing the source to a synthetic point at another location caused map tile requests for the displayed area, without a GeoJSON upload request in the observed list. Explicitly running “Compare with terrain” returned a sampled value; Cesium `sampleTerrainMostDetailed` requests terrain tiles associated with the selected feature coordinates. Privacy wording must say that file reading/inspection is in-browser while map requests can disclose the displayed area and explicit terrain comparison uses the selected feature's coordinates for sampling; it must not promise that coordinates never leave the browser.

The in-app browser client could not initialize because its Node REPL blocks importing `node:process`; the audit used direct Chrome DevTools MCP in an isolated fresh context. That browser tool denied OS file uploads because fixture paths were outside its configured file roots. FileReader-backed tests cover selection/drop loading, and local Chrome verified the app's drop event with a synthetic GeoJSON `File`: default navigation was prevented and the Inspector showed the imported feature. This does not exercise a native OS drag. No optional feature candidate passed the release gate.

**UX decisions:** Keep the starter sample, lead with the Inspector, expose an accessible choose-file button plus drop-anywhere instruction and state, move the existing picker into app-level state handling, and show observed local/external-service behavior. Name the Editor tab and next action in parse/format error guidance; preserve malformed source for editing and keep invalid geometry out of the viewer. Fix the document-title typo found by the audit. Full findings and local desktop/mobile screenshots are in `/Users/Nish_Work/Development/worktrees/geoviewer3d-v2-ticket-29-audit.md`.
