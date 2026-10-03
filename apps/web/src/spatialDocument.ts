import { check, HintError, type HintIssue } from '@placemarkio/check-geojson';
import type { GeoJSON as GeoJsonValue } from 'geojson';

export interface SpatialDocumentSource {
  name: string;
  rawText: string;
}

export type SpatialDocumentError =
  | {
      kind: 'json-syntax';
      message: string;
      issues: HintIssue[];
    }
  | {
      kind: 'invalid-geojson';
      message: string;
      issues: HintIssue[];
    };

interface SpatialDocumentBase {
  source: SpatialDocumentSource;
  format: 'geojson';
  report: null;
}

export type SpatialDocument =
  | (SpatialDocumentBase & {
      parsed: GeoJsonValue;
      parseError: null;
    })
  | (SpatialDocumentBase & {
      parsed: null;
      parseError: SpatialDocumentError;
    });

function toHintIssues(error: unknown): HintIssue[] {
  if (error instanceof HintError) return error.issues;

  return [
    {
      from: 0,
      to: 0,
      severity: 'error',
      message: error instanceof Error ? error.message : 'GeoJSON validation failed.',
    },
  ];
}

export function createSpatialDocument(
  name: string,
  rawText: string,
): SpatialDocument {
  const source = { name, rawText };

  try {
    return {
      source,
      format: 'geojson',
      parsed: check(rawText),
      parseError: null,
      report: null,
    };
  } catch (validationError: unknown) {
    const issues = toHintIssues(validationError);

    try {
      JSON.parse(rawText);
    } catch (syntaxError: unknown) {
      const message = issues[0]?.message
        ?? (syntaxError instanceof Error ? syntaxError.message : 'Invalid JSON.');

      return {
        source,
        format: 'geojson',
        parsed: null,
        parseError: { kind: 'json-syntax', message, issues },
        report: null,
      };
    }

    return {
      source,
      format: 'geojson',
      parsed: null,
      parseError: {
        kind: 'invalid-geojson',
        message: issues[0]?.message ?? 'Invalid GeoJSON.',
        issues,
      },
      report: null,
    };
  }
}

export function getGeoJSONForViewer(document: SpatialDocument): GeoJsonValue | null {
  return document.parseError === null ? document.parsed : null;
}
