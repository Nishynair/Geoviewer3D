import { useRef, useState, useEffect} from "react";
import { Box } from "@mui/material";
import Editor from "@monaco-editor/react";
import { check } from "@placemarkio/check-geojson";
import StatusAlert from "./StatusAlert"
import { errorColor } from "../consts";

const extractColumnLineFromErrMsg = (errorMessage) => {
    const re = /\((\d{2}):(\d{2})\)\s*$/;

    const [, line, column] = errorMessage.match(re) || [];
    return [line, column];
}

export default function GeojsonEditor({
  text,
  setText,
  sx = {},
  isCompact = false,
}) {
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const decorationIdsRef = useRef([]);
  const [errorMessages, setErrorMessages] = useState([]);
  const [currentErrorMessage, setCurrentErrorMessage] = useState(null);
  const lineNumbersMinChars = isCompact ? 2 : 4;
  const editorFontSize = isCompact ? 12 : 14;
  const minimapEnabled = !isCompact;

  // Checks if GeoJSON is valid
  useEffect(() => {
    try{
        // validate the geojson, if invalid throw errors
        check(text);
        // if no errors, reset the error prop, and parse it
        setErrorMessages([]);
        setCurrentErrorMessage(null);

    }
   catch (error){
        setErrorMessages(structuredClone(error.issues));
        setCurrentErrorMessage(error.issues[0].message);
    }
  }, [text]);

  useEffect(() => {

    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;
    const model = editor.getModel();

    const newDecorations = [];

    errorMessages.forEach(err => {
        const startCol = err.from;
        const endCol = err.to;
        let sLine, sCol, eLine, eCol;

        // Some line / column numbers are within the error message, so dig for them!
        if(startCol == 0 && endCol == 0){ 
            const [line, column] = extractColumnLineFromErrMsg(err.message);

            if (line){
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


        if(sLine){
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
    if (!editor) return;

    editor.updateOptions({
      lineNumbersMinChars,
      fontSize: editorFontSize,
      minimap: {
        enabled: minimapEnabled,
      },
    });
  }, [lineNumbersMinChars, editorFontSize, minimapEnabled]);

  const onMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

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
      setText(editor.getValue());
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
                value={text}
                defaultLanguage="json"
                onMount={onMount}
            />
        </Box>
    </Box>
  );
}
