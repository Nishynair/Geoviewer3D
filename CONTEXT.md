# Geoviewer3D

Geoviewer3D is a browser-based spatial data inspector that helps users understand what GeoJSON contains and how it appears in a 3D viewer.

## Language

**Spatial document**: The web app's canonical representation of a source file, including its name, raw text, GeoJSON format, parsed value or error, and inspection report.

**Spatial Doctor**: The framework-independent package that validates an already-parsed GeoJSON value and returns a deterministic inspection report.
_Avoid_: Inspector UI (the package has no UI)

**Inspection report**: The deterministic summary and diagnostics produced for a GeoJSON value, including feature and geometry counts and coordinate facts.

**Source text**: The editable raw JSON text and filename associated with a spatial document.
_Avoid_: Parsed GeoJSON (the parsed value is a separate part of the document)
