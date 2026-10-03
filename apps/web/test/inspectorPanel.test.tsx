import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { inspectGeoJSON } from 'spatial-doctor';
import InspectorPanel from '../src/components/InspectorPanel';
import { createSpatialDocument } from '../src/spatialDocument';

function renderDocument(rawText: string, name = 'sample.geojson'): string {
  const document = createSpatialDocument(name, rawText, inspectGeoJSON);
  return renderToStaticMarkup(<InspectorPanel document={document} />);
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

  it('renders mixed dimensions from the report', () => {
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
    expect(markup).not.toContain('This valid document contains both XY and XYZ coordinate tuples.');
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

  it('shows a JSON syntax error without stale report metrics', () => {
    const markup = textContent(renderDocument('{"type":', 'broken.geojson'));

    expect(markup).toContain('broken.geojson');
    expect(markup).toContain('An overview is unavailable for this document.');
    expect(markup).not.toContain('Feature count');
    expect(markup).not.toContain('Coordinate tuples');
    expect(markup).not.toContain('Point 1');
  });

  it('shows an invalid-document state without stale report metrics', () => {
    const markup = textContent(renderDocument(JSON.stringify({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: {}, geometry: 'invalid' },
      ],
    })));

    expect(markup).toContain('An overview is unavailable for this document.');
    expect(markup).not.toContain('Feature count');
    expect(markup).not.toContain('Coordinate tuples');
    expect(markup).not.toContain('Point 1');
    expect(markup).not.toContain('invalid-geojson');
  });
});
