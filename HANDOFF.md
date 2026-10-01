# Geoviewer3D agent handoff

This document is a source-level map of the repository for an agent taking over work. It was reviewed on 2026-09-29 against commit `4d6e949` on `main` (committed 2025-10-19). Recheck the source before relying on a behavior after changes. The live GitHub Pages site was not used to verify this document.

## What this project is

Geoviewer3D is a client-side React application for editing GeoJSON text and viewing the resulting features on a Cesium globe. The initial document is a single polygon near Kuala Lumpur City Centre (KLCC), with `[longitude, latitude, height]` coordinates and a constant height of 50. It is a flat polygon, not an extruded building. Users can upload a JSON/GeoJSON file, edit the text, see GeoJSON validation feedback, download or copy the text, hide the editor, and toggle camera auto-rotation.

There is no backend/API server, database, account system, or persistence layer in this repository. Vite supplies a local development server. Browser state is lost on reload unless the user downloads or copies their work. The globe depends on Cesium Ion resources; it needs a `VITE_CESIUM_TOKEN` at build or development-server startup. The README points to a GitHub Pages deployment at `https://nishynair.github.io/Geoviewer3D/`.

## First places to read

| Need | Source |
| --- | --- |
| App state, text-to-viewer update, responsive layout | `src/App.jsx` |
| Cesium setup, GeoJSON loading, camera orbit | `src/components/Viewer.jsx` |
| Monaco editor, validation, error highlighting | `src/components/GeojsonEditor.jsx` |
| Upload/download/copy/about controls | `src/components/MenuBar.jsx` and `src/components/Buttons/` |
| Sample input | `src/assets/sampleJSON/klcc-flat.json` |
| Commands and direct dependencies | `package.json` |
| Vite base path and Cesium plugin | `vite.config.js` |
| GitHub Pages build/deployment | `.github/workflows/deploy.yml` |
| Local setup and project intent | `README.md` |

## Repository layout and ownership

```text
.
├── .github/workflows/deploy.yml       GitHub Pages build and deployment
├── README.md                          Short overview and local setup
├── LICENSE                            GPLv3
├── package.json / package-lock.json   npm dependencies and lockfile
├── vite.config.js                     React/Cesium plugins; Pages base path
├── eslint.config.js                   ESLint flat configuration
├── index.html                         HTML shell and root element
├── public/                            README screenshots
└── src/
    ├── main.jsx                       React root and Cesium widget CSS
    ├── App.jsx                        Top-level state and layout
    ├── App.css / index.css             Global and root styling
    ├── consts.js                      Editor width, alert text/colors
    ├── assets/sampleJSON/klcc-flat.json
    ├── utils/geomath.js              WGS84/UTM helpers; currently unused
    └── components/
        ├── Viewer.jsx                Cesium viewer and camera orbit
        ├── GeojsonEditor.jsx         Monaco, validation, decorations
        ├── MenuBar.jsx               Toolbar composition
        ├── StatusAlert.jsx           Editor validation alert
        ├── SnackbarAlert.jsx         Copy success message
        └── Buttons/                  Upload, download, copy, info, expand
```

`src/main.jsx` mounts `App` inside React `StrictMode` and imports Cesium widget styles. `index.html` supplies `#root`. `src/index.css` establishes viewport sizing and default element styles; `src/App.css` styles the root container. The page title currently reads `GoeJSON Viewer` (a typo in `index.html`).

## Runtime data flow

1. `App.jsx` imports the KLCC sample as an object. It initializes `geojson` with that object and `stringJson` with a pretty-printed JSON string (`src/App.jsx:22-25`).
2. `MenuBar` and `GeojsonEditor` receive `stringJson`; the viewer receives `geojson`. The editor and upload button call `setStringJson`, while download and copy read the current `stringJson` (`src/App.jsx:65,99-123`).
3. Every text change triggers the editor's `check(text)` call from `@placemarkio/check-geojson`. The editor displays a success/error alert and attempts to mark error ranges in Monaco (`src/components/GeojsonEditor.jsx:30-95,133-165`). This validation is local to the editor; it does not control the value sent to the viewer.
4. For nonempty text, an effect in `App.jsx` schedules a one-second debounced `JSON.parse(stringJson)`, then sets `geojson`. A subsequent nonempty text change clears the previous timer (`src/App.jsx:13-44`). Clearing the editor to empty text skips this effect's debounce call and leaves a previously scheduled timer active. There is no explicit Apply button.
5. On each `geojson` change, `Viewer.jsx` removes all prior Cesium data sources, calls `Cesium.GeoJsonDataSource.load`, adds the result, and flies the camera to it (`src/components/Viewer.jsx:56-93`).
6. After the flight, the viewer collects entity point, polygon exterior, and polyline positions; it builds a bounding sphere used by the orbit camera (`src/components/Viewer.jsx:68-89`).

This gives the app two related but distinct states: editable text and the last parsed object. While a change is pending, the globe shows the previous object. If parsing fails, the globe also keeps the previous object. `editingGeoJSON` is only used to log `Waiting for changes...`/`Done` to the console; it does not render a status indicator (`src/App.jsx:24,30-53`).

## User interface

- The top app bar is composed in `MenuBar.jsx`. Its buttons upload, download, copy, and open an About dialog. `InfoButton.jsx` links to the project repository and a GeoJSON explanation.
- Upload accepts `.json` and `.geojson` filenames, reads the selected file with `FileReader`, and pretty-prints it after `JSON.parse`. It checks JSON syntax at this point, not GeoJSON validity (`src/components/Buttons/UploadButton.jsx:6-24`).
- Download prompts for a filename (default `data.geojson`) and writes the exact current editor text to a browser `Blob`. Copy writes that same text to the clipboard and briefly shows a success snackbar (`DownloadButton.jsx`, `CopyButton.jsx`). These controls do not require valid GeoJSON.
- The editor uses Monaco's JSON mode. `GeojsonEditor.jsx` runs GeoJSON validation on text changes, displays the first issue in `StatusAlert`, and adds highlight decorations for reported spans. On narrow screens it uses a smaller font, fewer line-number characters, and no minimap (`src/components/GeojsonEditor.jsx:24-28,30-44,46-108`).
- On desktop, `App.jsx` shows the globe and an editor column clamped to 400–500 px. Below MUI's `md` breakpoint, they become stacked rows. The expand button shrinks the editor's grid track to zero and hides it; `MinimizeMaximizeButton.jsx` changes arrow direction and position for narrow screens (`src/App.jsx:67-125`, `src/consts.js:1-2`).
- The viewer has an Auto-rotate switch, initially on (`src/components/Viewer.jsx:10,125-149`).

## Cesium behavior and geospatial assumptions

`Viewer.jsx` sets `Cesium.Ion.defaultAccessToken` from `import.meta.env.VITE_CESIUM_TOKEN`, creates a `Cesium.Viewer` with World Terrain and vertex normals, enables globe lighting, and adds Cesium's OpenStreetMap Buildings Ion asset (`96188`). Several stock Cesium controls are hidden: timeline, animation, base-layer picker, home, scene-mode picker, selection indicator, info box, and fullscreen button. Default imagery is used rather than a custom imagery provider (`src/components/Viewer.jsx:13-43`). A `ResizeObserver` calls `viewer.resize()` as the containing panel changes size; component cleanup disconnects it and destroys the viewer (`src/components/Viewer.jsx:45-53`).

GeoJSON goes directly to Cesium with `clampToGround: false` and red point markers. No reprojection, custom styling by feature properties, extrusion, or geometry editing is performed in this code path (`src/components/Viewer.jsx:56-68`). Input should therefore use ordinary geographic GeoJSON longitude/latitude coordinates, with an optional third height coordinate. The KLCC sample is a `FeatureCollection` containing one `Polygon`, an empty properties object, and one closed exterior ring at height 50 (`src/assets/sampleJSON/klcc-flat.json`).

For orbiting, the viewer computes a bounding sphere from Cesium entities after `flyTo`, stores its center and twice its radius, then updates the camera on Cesium clock ticks. It uses an east-north-up frame at the center and advances the angle by `0.001` per tick. The resulting speed varies with tick rate. Turning off auto-rotation removes the old tick listener and restores the identity camera transform (`src/components/Viewer.jsx:68-123`). While auto-rotation is on, a clock tick can override manual camera movement.

`src/utils/geomath.js` provides `wgs84ToUTM` and `utmToWgs84` using `proj4`, including UTM zone selection and Norway/Svalbard exceptions. Nothing in `src/` imports these helpers. In particular, the viewer does not accept UTM coordinates by converting them through this file. `wgs84ToUTM` returns easting, northing, and unchanged height, without the selected zone/hemisphere metadata that the inverse function requires (`src/utils/geomath.js:3-56`).

## Toolchain and deployment

- Package manager: npm; `package-lock.json` is committed. `package.json` defines `npm run dev`, `npm run build`, `npm run preview`, and `npm run lint`. It defines no test script.
- Runtime stack: React 19, Cesium, Monaco React, MUI/Emotion, and `@placemarkio/check-geojson`. Vite 7 builds the frontend. The package manifest also lists Three.js, `3d-tiles-renderer`, Turf packages, `@mapbox/geojsonhint`, and `proj4`. App source does not import `three`, `3d-tiles-renderer`, either Turf package, or `@mapbox/geojsonhint`; `proj4` is imported only by the unused `geomath.js` helper. Check transitive and planned use before removing dependencies. `useSuccessColor` in `src/consts.js` is exported but unused.
- Local setup in `README.md`: create `.env` with `VITE_CESIUM_TOKEN=<Cesium Ion token>`, run `npm install`, then `npm run dev`. The README's shell example creates that line by assigning a local `token` variable. `.env` is ignored by git (`.gitignore`). A `VITE_` variable is available to browser code at build time; treat it as a public client token.
- `vite.config.js` includes React and Cesium plugins, sets the public base path to `/Geoviewer3D/`, and builds into `dist/`. That base path targets the named GitHub Pages project site; take it into account if hosting at a different path.
- The only workflow, `.github/workflows/deploy.yml`, runs on pushes to `main`. It uses Node 20 and `npm ci`, builds with the `VITE_CESIUM_TOKEN` GitHub secret, moves a Cesium asset folder if the plugin nested it under `dist/Geoviewer3D/`, uploads `dist`, and deploys to GitHub Pages. It does not run lint or tests.
- ESLint uses recommended JavaScript, React Hooks, and React Refresh rules (`eslint.config.js`). No test files or test framework configuration are present in the tracked source tree.
- The repository is GPLv3 (`LICENSE`).

## Known code-level risks and limits

These observations come from reading code, not reproducing them in a browser. Treat them as starting points for verification when work touches the relevant area.

1. **Parsing and validation are disconnected.** Nonempty invalid JSON reaches an uncaught `JSON.parse` in the debounced callback; empty text skips the callback, and a previously scheduled parse can still fire. Parseable but invalid GeoJSON becomes `geojson` and is passed to Cesium. Editor validation only changes the alert and decorations (`src/App.jsx:30-44`; `src/components/GeojsonEditor.jsx:30-44`).
2. **Asynchronous viewer updates can race.** Each change calls `removeAll()` before starting a new, uncancelled `GeoJsonDataSource.load`. An older load may resolve after a newer one, and pending promises may resolve after viewer destruction. The GeoJSON load, add, and flight have no rejection handlers; only the OSM Buildings load has a catch (`src/components/Viewer.jsx:35-53,56-93`).
3. **Orbit setup assumes usable entity positions.** It handles point positions, polygon exterior rings, and polylines, but not polygon holes. There is no guard for an empty `positions` array before making the bounding sphere (`src/components/Viewer.jsx:70-88`).
4. **Upload and export errors have limited feedback.** Invalid upload JSON, clipboard errors, and download errors are logged to the console. Upload clears the file input only after successful parsing, so choosing the same invalid file again may not fire another change event. Download and copy operate on the editor text even when it is invalid (`src/components/Buttons/UploadButton.jsx:13-23`; `CopyButton.jsx:9-18`; `DownloadButton.jsx:5-29`).
5. **Validation highlighting has a narrow fallback parser.** Its regex expects exactly two digits for line and column in a message ending with `(NN:NN)`, so other digit widths will not match (`src/components/GeojsonEditor.jsx:8-13`).
6. **Visual output depends on external services.** Cesium Ion token access, terrain, default imagery, and the OSM Buildings asset affect what appears. Loading failures are mostly not reflected in the UI (`src/components/Viewer.jsx:13-43`).

## Working on this repository

For a UI or data-flow change, trace `src/App.jsx` first, then the specific component. For rendering or camera changes, start with `Viewer.jsx`; confirm what Cesium returns for the relevant geometry and what happens during quick successive edits. For validation changes, decide explicitly whether validation only informs the editor or also gates the parsed viewer state. For deployment changes, review both `vite.config.js` and the Pages workflow because the Cesium assets and base path are coupled to hosting.

Before claiming a change works, install dependencies if needed and run the relevant available commands (`npm run lint`, `npm run build`). Browser verification is valuable for Cesium, resizing, editor behavior, and external-resource loading; a build alone cannot verify those. No automated test suite exists yet, so tests may need to be added for changes whose correctness is otherwise difficult to establish.
