export function isControlledEditorEcho(
  editorText: string,
  currentSourceText: string,
): boolean {
  return editorText === currentSourceText;
}
