import { check, HintError } from '@placemarkio/check-geojson';

export type DiagnosticSeverity = 'info' | 'warning' | 'error';

export interface Diagnostic {
  code: 'invalid-geojson';
  severity: DiagnosticSeverity;
  message: string;
}

export interface InspectionReport {
  valid: boolean;
  diagnostics: Diagnostic[];
}

const FALLBACK_MESSAGE = 'Input is not valid GeoJSON.';

function validReport(): InspectionReport {
  return {
    valid: true,
    diagnostics: [],
  };
}

function invalidReport(error?: unknown): InspectionReport {
  const issues = error instanceof HintError ? error.issues : [];
  const diagnostics: Diagnostic[] = issues.map((issue) => ({
    code: 'invalid-geojson',
    severity: 'error',
    message: issue.message || FALLBACK_MESSAGE,
  }));

  return {
    valid: false,
    diagnostics:
      diagnostics.length > 0
        ? diagnostics
        : [{
            code: 'invalid-geojson',
            severity: 'error',
            message: FALLBACK_MESSAGE,
          }],
  };
}

/** Validates an already-parsed GeoJSON value and reports deterministic diagnostics. */
export function inspectGeoJSON(input: unknown): InspectionReport {
  try {
    const serializedInput = JSON.stringify(input);
    if (typeof serializedInput !== 'string') return invalidReport();

    check(serializedInput);
    return validReport();
  } catch (error: unknown) {
    return invalidReport(error);
  }
}
