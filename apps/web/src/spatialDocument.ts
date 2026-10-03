import { check, HintError, type HintIssue } from '@placemarkio/check-geojson';
import type { GeoJSON as GeoJsonValue } from 'geojson';
import type { InspectionReport } from 'spatial-doctor';

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
}

type ValidInspectionReport = Extract<InspectionReport, { valid: true }>;
type InvalidInspectionReport = Extract<InspectionReport, { valid: false }>;

export type SpatialDocument =
  | (SpatialDocumentBase & {
      parsed: GeoJsonValue;
      parseError: null;
      report: ValidInspectionReport;
    })
  | (SpatialDocumentBase & {
      parsed: null;
      parseError: Extract<SpatialDocumentError, { kind: 'json-syntax' }>;
      report: null;
    })
  | (SpatialDocumentBase & {
      parsed: null;
      parseError: Extract<SpatialDocumentError, { kind: 'invalid-geojson' }>;
      report: InvalidInspectionReport;
    });

export type GeoJSONInspector = (input: unknown) => InspectionReport;

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

function getSourceIssues(rawText: string): HintIssue[] {
  // This legacy pass adds editor offsets only; inspectGeoJSON owns GeoJSON validity.
  try {
    check(rawText);
    return [];
  } catch (error: unknown) {
    return toHintIssues(error);
  }
}

function syntaxErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Invalid JSON.';
}

export function createSpatialDocument(
  name: string,
  rawText: string,
  inspectGeoJSON: GeoJSONInspector,
): SpatialDocument {
  const source = { name, rawText };
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawText);
  } catch (syntaxError: unknown) {
    const issues = getSourceIssues(rawText);
    return {
      source,
      format: 'geojson',
      parsed: null,
      parseError: {
        kind: 'json-syntax',
        message: issues[0]?.message ?? syntaxErrorMessage(syntaxError),
        issues,
      },
      report: null,
    };
  }

  const report = inspectGeoJSON(parsed);
  if (report.valid) {
    return {
      source,
      format: 'geojson',
      // The report validates this exact JSON-parsed value as GeoJSON.
      parsed: parsed as GeoJsonValue,
      parseError: null,
      report,
    };
  }

  const issues = getSourceIssues(rawText);
  return {
    source,
    format: 'geojson',
    parsed: null,
    parseError: {
      kind: 'invalid-geojson',
      message: report.diagnostics[0]?.message ?? 'Invalid GeoJSON.',
      issues,
    },
    report,
  };
}

export function getGeoJSONForViewer(document: SpatialDocument): GeoJsonValue | null {
  if (document.report?.valid !== true) return null;
  return document.parsed;
}
