export type EditorTextChangeDisposition = 'controlled-echo' | 'user-edit';

export function createEditorTextChangeHandler(
  getCurrentSourceText: () => string,
  onUserEdit: (editorText: string) => void,
): (editorText: string) => EditorTextChangeDisposition {
  return (editorText) => {
    if (editorText === getCurrentSourceText()) return 'controlled-echo';
    onUserEdit(editorText);
    return 'user-edit';
  };
}
