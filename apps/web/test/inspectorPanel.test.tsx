import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { inspectGeoJSON } from 'spatial-doctor';
import InspectorPanel from '../src/components/InspectorPanel';
import { createSpatialDocument } from '../src/spatialDocument';
import { previewGeoJSONRepair } from '../src/utils/geoJsonRepairs';

function renderDocument(rawText: string, name = 'sample.geojson'): string {
  const document = createSpatialDocument(name, rawText, inspectGeoJSON);
  return renderToStaticMarkup(<InspectorPanel document={document} />);
}

function renderWithDiagnostic(
  diagnostic: { featureId?: string | number; featureIndex?: number; sourceLocation?: { start: number; end: number } },
): string {
  const document = createSpatialDocument(
    'invalid.geojson',
    JSON.stringify({ type: 'Circle', coordinates: [1, 2] }),
    inspectGeoJSON,
  );
  if (document.report?.valid !== false) throw new Error('Expected an invalid fixture document.');
  const referencedDocument = {
    ...document,
    report: {
      ...document.report,
      diagnostics: [{
        code: 'invalid-geojson' as const,
        severity: 'error' as const,
        message: 'Invalid feature',
        ...diagnostic,
      }],
    },
  };
  return renderToStaticMarkup(
    <InspectorPanel
      document={referencedDocument}
      onSelectDiagnostic={() => undefined}
    />,
  );
}

function renderValidFeatureDiagnostic(
  selectedFeatureIndex: number | null = null,
  selectedFeatureHasSourceLocation = false,
  sourceLocation: { start: number; end: number } = { start: 2, end: 18 },
): string {
  const rawText = JSON.stringify({
    type: 'Feature',
    id: 'tower',
    properties: {},
    geometry: { type: 'Point', coordinates: [1, 2] },
  });
  const report = inspectGeoJSON(JSON.parse(rawText));
  const document = createSpatialDocument(
    'tower.geojson',
    rawText,
    () => ({
      ...report,
      diagnostics: [{
        code: 'invalid-geojson',
        severity: 'warning',
        message: 'Feature-scoped diagnostic fixture',
        featureId: 'tower',
        featureIndex: 0,
        sourceLocation,
      }],
    }),
  );
  return renderToStaticMarkup(
    <InspectorPanel
      document={document}
      onSelectDiagnostic={() => undefined}
      selectedFeatureIndex={selectedFeatureIndex}
      selectedFeatureHasSourceLocation={selectedFeatureHasSourceLocation}
      onShowFeatureSource={() => undefined}
    />,
  );
}

function renderSelectedGeometry(geometry: object): string {
  const rawText = JSON.stringify({
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry }],
  });
  const document = createSpatialDocument('selected.geojson', rawText, inspectGeoJSON);
  return renderToStaticMarkup(
    <InspectorPanel document={document} selectedFeatureIndex={0} />,
  );
}

function renderTerrainComparison(
  terrainComparison = null,
  terrainComparisonPending = false,
): string {
  const document = createSpatialDocument(
    'terrain.geojson',
    JSON.stringify({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [10, 20, 120] } }],
    }),
    inspectGeoJSON,
  );
  return renderToStaticMarkup(
    <InspectorPanel
      document={document}
      selectedFeatureIndex={0}
      onCompareTerrain={() => undefined}
      terrainComparisonPending={terrainComparisonPending}
      terrainComparison={terrainComparison}
    />,
  );
}

function textContent(markup: string): string {
  return markup
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

describe('InspectorPanel', () => {
  it('renders the report’s XY counts, simple bounds, and missing-Z state', () => {
    const markup = textContent(renderDocument(JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: { type: 'Point', coordinates: [12, -5] },
        },
      ],
    })));

    expect(markup).toContain('Dataset overview');
    expect(markup).toContain('Feature count 1');
    expect(markup).toContain('Point 1');
    expect(markup).toContain('Dimensions XY');
    expect(markup).toContain('Coordinate tuples 1');
    expect(markup).toContain('X 12 to 12');
    expect(markup).toContain('Y -5 to -5');
    expect(markup).toContain('No Z values');
    expect(markup).toContain('No package diagnostics for this document.');
  });

  it('renders XYZ Z minimum and maximum from the report', () => {
    const markup = textContent(renderDocument(JSON.stringify({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: [[0, 1, -4], [2, 3, 18]] },
    })));

    expect(markup).toContain('Dimensions XYZ');
    expect(markup).toContain('Coordinate tuples 2');
    expect(markup).toContain('Z range -4 to 18');
  });

  it('explains mixed dimensions without marking the report invalid', () => {
    const markup = textContent(renderDocument(JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: { type: 'Point', coordinates: [0, 1] },
        },
        {
          type: 'Feature',
          properties: {},
          geometry: { type: 'Point', coordinates: [2, 3, 4] },
        },
      ],
    })));

    expect(markup).toContain('Dimensions Mixed XY/XYZ');
    expect(markup).toContain('This valid document contains both XY and XYZ coordinate tuples.');
    expect(markup).toContain('No package diagnostics for this document.');
    expect(markup).not.toContain('Invalid GeoJSON');
  });

  it('explains an empty report without showing bounds or Z values', () => {
    const markup = textContent(renderDocument(JSON.stringify({
      type: 'FeatureCollection',
      features: [],
    })));

    expect(markup).toContain('Feature count 0');
    expect(markup).toContain('No geometries in this document.');
    expect(markup).toContain('Dimensions Empty');
    expect(markup).toContain('Coordinate tuples 0');
    expect(markup).toContain('No coordinate bounds');
    expect(markup).toContain('No Z values');
  });

  it('distinguishes a JSON syntax error without stale report metrics', () => {
    const markup = textContent(renderDocument('{"type":', 'broken.geojson'));

    expect(markup).toContain('broken.geojson');
    expect(markup).toContain('JSON syntax error');
    expect(markup).toContain('Correct the JSON text to see a GeoJSON overview.');
    expect(markup).not.toContain('Invalid GeoJSON');
    expect(markup).not.toContain('Feature count');
    expect(markup).not.toContain('Coordinate tuples');
    expect(markup).not.toContain('Point 1');
  });

  it('shows stable-code severity and defined copy for invalid GeoJSON without stale metrics', () => {
    const markup = textContent(renderDocument(JSON.stringify({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: {}, geometry: 'invalid' },
      ],
    })));

    expect(markup).toContain('Invalid GeoJSON');
    expect(markup).toContain('invalid-geojson');
    expect(markup).toContain('error');
    expect(markup).toContain('This document does not match the required GeoJSON structure.');
    expect(markup).not.toContain('Feature count');
    expect(markup).not.toContain('Coordinate tuples');
    expect(markup).not.toContain('Point 1');
  });

  it('offers explicit repair previews and measurements for parseable invalid GeoJSON', () => {
    const rawText = JSON.stringify({
      type: 'Feature',
      properties: { parcel: 'A' },
      geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1]]] },
    });
    const document = createSpatialDocument('open-ring.geojson', rawText, inspectGeoJSON);
    const repairPreview = previewGeoJSONRepair(document.source, 'close-unclosed-rings');
    const markup = textContent(renderToStaticMarkup(
      <InspectorPanel
        document={document}
        repairPreview={repairPreview}
        canUndoRepair
        onPreviewRepair={() => undefined}
        onApplyRepair={() => undefined}
        onUndoRepair={() => undefined}
      />,
    ));

    expect(document.report?.valid).toBe(false);
    expect(markup).toContain('Invalid GeoJSON');
    expect(markup).toContain('Geometry repairs');
    expect(markup).toContain('Close safe unclosed polygon rings');
    expect(markup).toContain('Coordinate positions: 3 → 4');
    expect(markup).toContain('Polygon rings closed: 1');
    expect(markup).toContain('Apply repair');
    expect(markup).toContain('Undo repair');
    expect(markup).not.toContain('Feature count');
  });

  it('keeps repair previews available while showing a JSON syntax error', () => {
    const document = createSpatialDocument('broken.geojson', '{', inspectGeoJSON);
    const markup = textContent(renderToStaticMarkup(
      <InspectorPanel
        document={document}
        onPreviewRepair={() => undefined}
      />,
    ));

    expect(markup).toContain('JSON syntax error');
    expect(markup).toContain('Geometry repairs');
    expect(markup).toContain('Remove consecutive duplicate vertices');
    expect(markup).not.toContain('Feature count');
  });

  it('offers navigation for referenced diagnostics but keeps dataset-wide diagnostics static', () => {
    const datasetWide = textContent(renderWithDiagnostic({}));
    const featureScoped = textContent(renderWithDiagnostic({
      featureIndex: 1,
      sourceLocation: { start: 12, end: 28 },
    }));
    const sourceOnly = textContent(renderWithDiagnostic({
      sourceLocation: { start: 12, end: 28 },
    }));
    const unavailableFeature = textContent(renderWithDiagnostic({ featureIndex: 0 }));

    expect(datasetWide).not.toContain('Show feature');
    expect(featureScoped).toContain('Show source');
    expect(featureScoped).not.toContain('Show feature');
    expect(sourceOnly).toContain('Show source');
    expect(unavailableFeature).not.toContain('Show feature');
  });

  it('offers feature navigation from a valid canonical document report', () => {
    const markup = textContent(renderValidFeatureDiagnostic());

    expect(markup).toContain('Feature count 1');
    expect(markup).toContain('Show feature and source');
    expect(markup).not.toContain('not valid GeoJSON');
  });

  it('offers source navigation when a bad diagnostic range falls back to the referenced feature span', () => {
    const markup = textContent(renderValidFeatureDiagnostic(
      null,
      false,
      { start: 10000, end: 10001 },
    ));

    expect(markup).toContain('Show feature and source');
    expect(markup).not.toContain('Show feature</');
  });

  it('shows selected feature statistics and states when a source link is unavailable', () => {
    const markup = textContent(renderValidFeatureDiagnostic(0, false));

    expect(markup).toContain('Selected feature');
    expect(markup).toContain('Feature 1 · collection index 0');
    expect(markup).toContain('Feature ID tower');
    expect(markup).toContain('Geometry Point');
    expect(markup).toContain('Coordinate tuples 1');
    expect(markup).toContain('Dimensions XY');
    expect(markup).toContain('No useful source location is available for this feature.');
  });

  it('offers a direct source action for the selected feature when its source span is available', () => {
    const markup = textContent(renderValidFeatureDiagnostic(0, true));

    expect(markup).toContain('Selected feature');
    expect(markup).toContain('Show selected feature in source');
    expect(markup).not.toContain('No useful source location is available for this feature.');
  });

  it('renders selected line Z profile, complete and partial measurements, and grade', () => {
    const markup = textContent(renderSelectedGeometry({
      type: 'LineString',
      coordinates: [[0, 0, 10], [0, 0.001, 20], [0, 0.002]],
    }));

    expect(markup).toContain('Elevation and line measurements');
    expect(markup).toContain('spherical longitude/latitude approximation in meters');
    expect(markup).toContain('no vertical datum is inferred or converted');
    expect(markup).toContain('Min 10; max 20; mean 15.00 (2 present, 1 missing)');
    expect(markup).toContain('2D line length');
    expect(markup).toContain('3D line length');
    expect(markup).toContain('Partial:');
    expect(markup).toContain('Per-coordinate Z values');
    expect(markup).toContain('Distance along line');
    expect(markup).toContain('Next segment grade');
    expect(markup).toContain('8.99%');
    expect(markup).toContain('Unavailable (missing Z)');
  });

  it('shows Z values for selected non-line geometry without inventing line measurements', () => {
    const markup = textContent(renderSelectedGeometry({
      type: 'Point',
      coordinates: [12, -5, 40],
    }));

    expect(markup).toContain('Z statistics (m, third ordinate)');
    expect(markup).toContain('Min 40; max 40; mean 40.00 (1 present, 0 missing)');
    expect(markup).toContain('Per-coordinate Z values');
    expect(markup).toContain('40 m');
    expect(markup).toContain('Not applicable to this geometry');
    expect(markup).toContain('No supported LineString components; line length and elevation profile are unavailable.');
  });

  it('renders terrain comparison controls and reports raw Z minus sampled terrain', () => {
    const markup = textContent(renderTerrainComparison({
      status: 'complete',
      totalCoordinates: 1,
      coordinatesWithElevation: 1,
      unavailableCoordinates: 0,
      values: [{
        path: [],
        longitude: 10,
        latitude: 20,
        sourceZ: 120,
        terrainHeight: 100,
        difference: 20,
      }],
    }));

    expect(markup).toContain('Compare with terrain');
    expect(markup).toContain('compatible vertical references');
    expect(markup).toContain('Complete comparison: 1 of 1 coordinates; 0 unavailable.');
    expect(markup).toContain('Z 120 m · terrain 100.00 m · difference 20.00 m');
  });

  it('shows waiting and unavailable terrain states without implying ground height zero', () => {
    const waiting = textContent(renderTerrainComparison(null, true));
    const unavailable = textContent(renderTerrainComparison({
      status: 'unavailable',
      reason: 'no-terrain',
      totalCoordinates: 1,
      coordinatesWithElevation: 1,
      unavailableCoordinates: 1,
      values: [],
    }));
    const unsupportedLocations = textContent(renderTerrainComparison({
      status: 'unavailable',
      reason: 'no-valid-locations',
      totalCoordinates: 1,
      coordinatesWithElevation: 1,
      unavailableCoordinates: 1,
      values: [],
    }));

    expect(waiting).toContain('Sampling terrain…');
    expect(waiting).toContain('Waiting for available terrain samples…');
    expect(unavailable).toContain('Terrain data with tile availability is not ready, so no ground height was assumed.');
    expect(unsupportedLocations).toContain('outside the supported longitude/latitude range, so terrain was not sampled.');
    expect(unavailable).not.toContain('terrain 0.00 m');
  });
});
