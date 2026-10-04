import type { Diagnostic } from '@nish-andran/spatial-doctor';
import type { SpatialDocument } from '../spatialDocument';
import type { SourceTextLocation } from './diagnosticNavigation';
import { resolveDiagnosticFeatureIndex } from './diagnosticNavigation';
import { resolveDiagnosticSourceLocation, resolveMapFeatureSelection } from './featureSourceLocation';

export type WorkspacePanel = 'editor' | 'inspector';

export interface WorkspaceSelection {
  document: SpatialDocument;
  featureIndex: number | null;
  diagnostic: Diagnostic | null;
  sourceLocation: SourceTextLocation | null;
  requestId: number;
}

export interface FeatureSelectionEffects {
  getDocument(): SpatialDocument;
  nextRequestId(): number;
  setSelection(selection: WorkspaceSelection): void;
  setPanel(panel: WorkspacePanel): void;
}

export function createFeatureSelectionController(effects: FeatureSelectionEffects) {
  return {
    selectDiagnostic(diagnostic: Diagnostic): WorkspaceSelection {
      const document = effects.getDocument();
      const referencedFeatureIndex = resolveDiagnosticFeatureIndex(document.parsed, diagnostic);
      const featureIsUnsafe = referencedFeatureIndex !== null
        && document.report?.valid === true
        && document.report.diagnostics.some((reportedDiagnostic) =>
          reportedDiagnostic.code === 'coordinate-out-of-range'
          && resolveDiagnosticFeatureIndex(document.parsed, reportedDiagnostic) === referencedFeatureIndex,
        );
      const selection: WorkspaceSelection = {
        document,
        featureIndex: featureIsUnsafe ? null : referencedFeatureIndex,
        diagnostic,
        sourceLocation: resolveDiagnosticSourceLocation(
          document.source.rawText,
          document.parsed,
          diagnostic,
        ),
        requestId: effects.nextRequestId(),
      };
      effects.setSelection(selection);
      if (selection.sourceLocation) effects.setPanel('editor');
      return selection;
    },

    selectFeatureFromMap(featureIndex: number | null): WorkspaceSelection | null {
      if (featureIndex === null) return null;
      const document = effects.getDocument();
      const resolved = resolveMapFeatureSelection(
        document.source.rawText,
        document.parsed,
        featureIndex,
      );
      if (!resolved) return null;

      const selection: WorkspaceSelection = {
        document,
        featureIndex: resolved.featureIndex,
        diagnostic: null,
        sourceLocation: resolved.sourceLocation,
        requestId: effects.nextRequestId(),
      };
      effects.setSelection(selection);
      effects.setPanel('inspector');
      return selection;
    },

    showFeatureSource(selection: WorkspaceSelection | null): boolean {
      if (!selection
          || selection.document !== effects.getDocument()
          || selection.sourceLocation === null) return false;
      effects.setPanel('editor');
      return true;
    },
  };
}
