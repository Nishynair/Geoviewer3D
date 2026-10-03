import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { inspectGeoJSON } from 'spatial-doctor';
import InspectorPanel from '../src/components/InspectorPanel';
import { createSpatialDocument } from '../src/spatialDocument';

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

function renderValidFeatureDiagnostic(): string {
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
        sourceLocation: { start: 2, end: 18 },
      }],
    }),
  );
  return renderToStaticMarkup(
    <InspectorPanel document={document} onSelectDiagnostic={() => undefined} />,
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
});
