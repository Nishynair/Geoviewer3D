import { useRef, useEffect } from "react";
import type { SxProps, Theme } from "@mui/material/styles";
import { Box } from "@mui/material";
import Editor, { type OnMount } from "@monaco-editor/react";
import StatusAlert from "./StatusAlert"
import { errorColor } from "../consts";
import type { SpatialDocument } from "../spatialDocument";
import type { HintIssue } from "@placemarkio/check-geojson";
import type { SourceTextLocation } from "../utils/diagnosticNavigation";
import { clearSourceLocationSelection, revealSourceLocation } from "../utils/editorLocation";

type MonacoEditor = Parameters<OnMount>[0];
type Monaco = Parameters<OnMount>[1];
const NO_VALIDATION_ISSUES: HintIssue[] = [];

interface GeojsonEditorProps {
  document: SpatialDocument;
  onTextChange: (text: string) => void;
  sx?: SxProps<Theme>;
  isCompact?: boolean;
  sourceLocation?: SourceTextLocation | null;
  sourceLocationRequestId?: number;
}

const extractColumnLineFromErrMsg = (errorMessage: string): [string | undefined, string | undefined] => {
    const re = /\((\d{2}):(\d{2})\)\s*$/;

    const [, line, column] = errorMessage.match(re) || [];
    return [line, column];
}

export default function GeojsonEditor({
  document,
  onTextChange,
  sx = {},
  isCompact = false,
  sourceLocation = null,
  sourceLocationRequestId = 0,
}: GeojsonEditorProps) {
  const editorRef = useRef<MonacoEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const decorationIdsRef = useRef<string[]>([]);
  const locationRequestRef = useRef(0);
  const errorMessages = document.parseError?.issues ?? NO_VALIDATION_ISSUES;
  const currentErrorMessage = document.parseError?.message ?? null;
  const lineNumbersMinChars = isCompact ? 2 : 4;
  const editorFontSize = isCompact ? 12 : 14;
  const minimapEnabled = !isCompact;

  useEffect(() => {

    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;
    const model = editor.getModel();
    if (!model) return;

    const newDecorations: Parameters<MonacoEditor['deltaDecorations']>[1] = [];

    errorMessages.forEach(err => {
        const startCol = err.from;
        const endCol = err.to;
        let sLine: number | undefined;
        let sCol: number | undefined;
        let eLine: number | undefined;
        let eCol: number | undefined;

        // Some line / column numbers are within the error message, so dig for them!
        if (startCol === 0 && endCol === 0) {
            const [line, column] = extractColumnLineFromErrMsg(err.message);

            if (line && column){
                sLine = eLine = parseInt(line);
                sCol = parseInt(column);
                eCol = parseInt(column) + 1;
            }
        }
        else{
            const sPos = model.getPositionAt(startCol);
            const ePos = model.getPositionAt(endCol);
            sLine = sPos.lineNumber;
            sCol = sPos.column;
            eLine = ePos.lineNumber;
            eCol = ePos.column;
        }


        if (sLine !== undefined && sCol !== undefined && eLine !== undefined && eCol !== undefined) {
            // Highlight characters
            newDecorations.push({
                range: new monaco.Range(sLine, sCol, eLine, eCol),
                options: {
                className: "hl-char",
                stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
                },
            });
        }

    });


    decorationIdsRef.current = editor.deltaDecorations(decorationIdsRef.current, newDecorations);
  }, [errorMessages]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || sourceLocationRequestId === locationRequestRef.current) return;
    locationRequestRef.current = sourceLocationRequestId;
    if (sourceLocation) revealSourceLocation(editor, sourceLocation);
    else clearSourceLocationSelection(editor);
  }, [sourceLocation, sourceLocationRequestId]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    editor.updateOptions({
      lineNumbersMinChars,
      fontSize: editorFontSize,
      minimap: {
        enabled: minimapEnabled,
      },
    });
  }, [lineNumbersMinChars, editorFontSize, minimapEnabled]);

  const onMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    locationRequestRef.current = sourceLocationRequestId;

    if (sourceLocation) revealSourceLocation(editor, sourceLocation);

    editor.updateOptions({
      fontLigatures: true,
      renderWhitespace: "selection",
      lineNumbersMinChars,
      fontSize: editorFontSize,
      minimap: {
        enabled: minimapEnabled,
      },
      cursorBlinking: "smooth",
      scrollBeyondLastLine: false,
      automaticLayout: true,
    });

    // Check if content changed
    editor.onDidChangeModelContent(() => {
      onTextChange(editor.getValue());
    });
  };

  return (
    <Box
        sx={{
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            height: "100%",
            borderColor: "divider",
            gap:1,
            ...sx,
        }}>
        <Box sx={{
            flex: "0 1 auto",
        }}>
            <StatusAlert errorMessage={currentErrorMessage} />
        </Box>
        <Box
            sx={{
                flex: "1 1 auto",
                minHeight: 0,
                "& .hl-char": { backgroundColor: errorColor },
                // to get rounded borders, prevent monaco from painting over it
                overflow: "hidden", 
                borderRadius: 2,
                borderColor: "divider",
            }}
        >
            <Editor
                value={document.source.rawText}
                defaultLanguage="json"
                onMount={onMount}
            />
        </Box>
    </Box>
  );
}
