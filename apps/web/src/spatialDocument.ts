import { check, HintError, type HintIssue } from '@placemarkio/check-geojson';
import type { GeoJSON as GeoJsonValue } from 'geojson';
import type { InspectionReport } from '@nish-andran/spatial-doctor';
import {
  emptyJsonFgInfo,
  hasExplicitJsonFgSignature,
  hasGeoJsonFilename,
  hasJsonFgFilename,
  hasJsonFgSourceContext,
  inspectJsonFg,
  isJsonFgCandidate,
  type JsonFgInfo,
} from './utils/jsonFg';

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
    }
  | {
      kind: 'invalid-jsonfg' | 'unsupported-jsonfg';
      message: string;
      issues: HintIssue[];
    };

interface SpatialDocumentSourceBase {
  source: SpatialDocumentSource;
}

type ValidInspectionReport = Extract<InspectionReport, { valid: true }>;
type InvalidInspectionReport = Extract<InspectionReport, { valid: false }>;

type GeoJSONSpatialDocument =
  | (SpatialDocumentSourceBase & {
      format: 'geojson';
      parsed: GeoJsonValue;
      parseError: null;
      report: ValidInspectionReport;
    })
  | (SpatialDocumentSourceBase & {
      format: 'geojson';
      parsed: null;
      parseError: Extract<SpatialDocumentError, { kind: 'json-syntax' }>;
      report: null;
    })
  | (SpatialDocumentSourceBase & {
      format: 'geojson';
      parsed: null;
      parseError: Extract<SpatialDocumentError, { kind: 'invalid-geojson' }>;
      report: InvalidInspectionReport;
    });

type JsonFGSpatialDocument =
  | (SpatialDocumentSourceBase & {
      format: 'jsonfg';
      parsed: GeoJsonValue;
      parseError: null;
      report: ValidInspectionReport;
      jsonFg: JsonFgInfo;
    })
  | (SpatialDocumentSourceBase & {
      format: 'jsonfg';
      parsed: null;
      parseError: Extract<SpatialDocumentError, { kind: 'json-syntax' | 'invalid-jsonfg' | 'unsupported-jsonfg' }>;
      report: InvalidInspectionReport | null;
      jsonFg: JsonFgInfo;
    });

export type SpatialDocument = GeoJSONSpatialDocument | JsonFGSpatialDocument;

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

function withSourceIssueLocations(
  report: InvalidInspectionReport,
  issues: HintIssue[],
  sourceLength: number,
): InvalidInspectionReport {
  return {
    ...report,
    diagnostics: report.diagnostics.map((diagnostic, index) => {
      const issue = issues[index];
      const start = issue?.from;
      const end = issue?.to;
      if (
        !Number.isSafeInteger(start)
        || !Number.isSafeInteger(end)
        || start! < 0
        || end! < start!
        || end! > sourceLength
      ) return diagnostic;
      return { ...diagnostic, sourceLocation: { start: start!, end: end! } };
    }),
  };
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
    const isJsonFg = hasJsonFgSourceContext(name, rawText);
    const message = issues[0]?.message ?? syntaxErrorMessage(syntaxError);
    if (isJsonFg) {
      return {
        source,
        format: 'jsonfg',
        parsed: null,
        parseError: { kind: 'json-syntax', message, issues },
        report: null,
        jsonFg: emptyJsonFgInfo(),
      };
    }
    return {
      source,
      format: 'geojson',
      parsed: null,
      parseError: { kind: 'json-syntax', message, issues },
      report: null,
    };
  }

  if (
    hasJsonFgFilename(name)
    || hasExplicitJsonFgSignature(parsed)
    || (!hasGeoJsonFilename(name) && isJsonFgCandidate(parsed))
  ) {
    const adaptation = inspectJsonFg(parsed, inspectGeoJSON);
    if (adaptation.status === 'valid') {
      return {
        source,
        format: 'jsonfg',
        parsed: adaptation.geometryView,
        parseError: null,
        report: adaptation.report,
        jsonFg: adaptation.info,
      };
    }

    const unsupported = adaptation.status === 'unsupported';
    return {
      source,
      format: 'jsonfg',
      parsed: null,
      parseError: {
        kind: unsupported ? 'unsupported-jsonfg' : 'invalid-jsonfg',
        message: adaptation.message,
        issues: [],
      },
      report: adaptation.status === 'invalid' ? adaptation.report : null,
      jsonFg: adaptation.info,
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
  const reportWithSourceLocations = withSourceIssueLocations(report, issues, rawText.length);
  return {
    source,
    format: 'geojson',
    parsed: null,
    parseError: {
      kind: 'invalid-geojson',
      message: reportWithSourceLocations.diagnostics[0]?.message ?? 'Invalid GeoJSON.',
      issues,
    },
    report: reportWithSourceLocations,
  };
}

export function getGeoJSONForViewer(document: SpatialDocument): GeoJsonValue | null {
  const parsed = document.parsed;
  if (document.report?.valid !== true || parsed === null) return null;

  const unsafeFeatureIndexes = new Set<number>();
  for (const diagnostic of document.report.diagnostics) {
    if (diagnostic.code !== 'coordinate-out-of-range') continue;
    if (diagnostic.featureIndex === undefined) return null;

    let feature: unknown;
    if (parsed.type === 'FeatureCollection') {
      if (
        !Number.isSafeInteger(diagnostic.featureIndex)
        || diagnostic.featureIndex < 0
        || diagnostic.featureIndex >= parsed.features.length
      ) return null;
      feature = parsed.features[diagnostic.featureIndex];
    } else if (parsed.type === 'Feature' && diagnostic.featureIndex === 0) {
      feature = parsed;
    } else {
      return null;
    }

    if (
      typeof feature !== 'object'
      || feature === null
      || !('type' in feature)
      || feature.type !== 'Feature'
      || ('id' in feature && diagnostic.featureId !== undefined && feature.id !== diagnostic.featureId)
    ) return null;
    unsafeFeatureIndexes.add(diagnostic.featureIndex);
  }

  if (unsafeFeatureIndexes.size === 0) return parsed;
  if (parsed.type === 'FeatureCollection') {
    const viewerValue = JSON.parse(JSON.stringify(parsed)) as GeoJsonValue;
    if (viewerValue.type !== 'FeatureCollection') return null;
    viewerValue.features.forEach((feature, index) => {
      if (unsafeFeatureIndexes.has(index)) {
        viewerValue.features[index] = { ...feature, geometry: null } as unknown as typeof feature;
      }
    });
    return viewerValue;
  }
  if (parsed.type === 'Feature' && unsafeFeatureIndexes.has(0)) {
    return { ...parsed, geometry: null } as unknown as GeoJsonValue;
  }
  return null;
}
