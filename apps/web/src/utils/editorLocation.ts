import type { SourceTextLocation } from './diagnosticNavigation';

interface EditorPosition {
  lineNumber: number;
  column: number;
}

interface EditorRange {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}

interface EditorModel {
  getValueLength(): number;
  getPositionAt(offset: number): EditorPosition;
}

export interface SourceLocationEditor {
  getModel(): EditorModel | null;
  setSelection(range: EditorRange): void;
  revealRangeInCenter(range: EditorRange): void;
  focus(): void;
}

export function revealSourceLocation(
  editor: SourceLocationEditor,
  location: SourceTextLocation,
): boolean {
  const model = editor.getModel();
  if (!model
    || !Number.isSafeInteger(location.start)
    || !Number.isSafeInteger(location.end)
    || location.start < 0
    || location.end < location.start
    || location.end > model.getValueLength()) {
    return false;
  }

  const start = model.getPositionAt(location.start);
  const end = model.getPositionAt(location.end);
  const range: EditorRange = {
    startLineNumber: start.lineNumber,
    startColumn: start.column,
    endLineNumber: end.lineNumber,
    endColumn: end.column,
  };
  editor.setSelection(range);
  editor.revealRangeInCenter(range);
  editor.focus();
  return true;
}
