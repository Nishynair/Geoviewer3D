import './App.css'
import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { TEXT_BOX_MIN_WIDTH, TEXT_BOX_MAX_WIDTH } from './consts';
import GeojsonEditor from './components/GeojsonEditor';
import KlccFlat from './assets/sampleJSON/klcc-flat.json';
import Viewer3D from './components/Viewer';
import MenuBar from './components/MenuBar';
import MinimizeMaximizeButton from './components/Buttons/MinimizeMaximizeButton';
import { inspectGeoJSON } from 'spatial-doctor';
import {
  createSpatialDocument,
  getGeoJSONForViewer,
  type SpatialDocument,
} from './spatialDocument';

function App() {
  const [document, setDocument] = useState<SpatialDocument>(() =>
    createSpatialDocument('klcc-flat.json', JSON.stringify(KlccFlat, null, 2), inspectGeoJSON),
  );
  const [viewerDocument, setViewerDocument] = useState(document);
  const theme = useTheme();
  const isSmallScreen = useMediaQuery(theme.breakpoints.down('md'));
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => setViewerDocument(document), 1000);
    return () => window.clearTimeout(timeout);
  }, [document]);

  const handleTextChange = (rawText: string) => {
    setDocument((currentDocument) =>
      createSpatialDocument(currentDocument.source.name, rawText, inspectGeoJSON),
    );
  };

  const handleFileLoad = (name: string, rawText: string) => {
    setDocument(createSpatialDocument(name, rawText, inspectGeoJSON));
  };

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        minWidth: 0,
        minHeight: "100%",
      }}
    >
      <MenuBar
        document={document}
        onFileLoad={handleFileLoad}
      />

      <Box
        sx={{
          display: "grid",
          flex: 1,
          transition: "all 0.3s ease",
          gridTemplateColumns: isSmallScreen
            ? "1fr"
            : expanded
              ? "1fr 0fr"
              : `minmax(0, 1fr) clamp(${TEXT_BOX_MIN_WIDTH}, 40vw, ${TEXT_BOX_MAX_WIDTH})`,
          gridTemplateRows: isSmallScreen
            ? expanded
              ? "1fr 0fr"
              : "minmax(0, 0.55fr) minmax(0, 0.45fr)"
            : "minmax(0, 1fr)",
          gap: 1,
          padding: 1,
          overflow: "hidden",
        }}
      >
        {/* LEFT: 3D Viewer */}
        <Box
          sx={{
            position: "relative",
            minWidth: 0,
            minHeight: { xs: "45vh", md: 0 },
            borderRadius: 2,
            overflow: "hidden",
          }}
        >
          <MinimizeMaximizeButton expanded={expanded} setExpanded={setExpanded} isSmallScreen={isSmallScreen}/>
          
          <Viewer3D
            geojson={getGeoJSONForViewer(viewerDocument)}
            sx={{
              width: "100%",
              height: "100%",
            }}
          />
        </Box>

        {/* RIGHT: GeoJSON Editor */}
        <Box
          sx={{
            minWidth: 0,
            height: "100%",
            borderRadius: 2,
            overflow: "hidden",
            bgcolor: theme.palette.background.default,
            visibility: expanded ? "hidden" : "visible",
            pointerEvents: expanded ? "none" : "auto",
          }}
        >
          <GeojsonEditor
            document={document}
            onTextChange={handleTextChange}
            isCompact={isSmallScreen}
          />
        </Box>
      </Box>
    </Box>
  );
}

export default App
