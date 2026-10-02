import './App.css'
import { useEffect, useState, useMemo } from 'react';
import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { TEXT_BOX_MIN_WIDTH, TEXT_BOX_MAX_WIDTH } from './consts';
import GeojsonEditor  from "./components/GeojsonEditor";
import KlccFlat from "./assets/sampleJSON/klcc-flat.json"
import Viewer3D from './components/Viewer';
import MenuBar from './components/MenuBar'
import MinimizeMaximizeButton from './components/Buttons/MinimizeMaximizeButton';

// Simple debounce function to prevent constantly updating the GeoJSON
const debounce = (fn, ms = 250) => {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function App() {
  const [geojson, setGeojson] = useState(KlccFlat);
  const [editingGeoJSON, setEditingGeoJSON] = useState(false);
  const [stringJson, setStringJson] = useState(JSON.stringify(geojson, null, 2));
  const theme = useTheme();
  const isSmallScreen = useMediaQuery(theme.breakpoints.down('md'));
  const [expanded, setExpanded] = useState(false);

  // debounce for 1 second before saving a new GeoJSON
  const debouncedSet = useMemo(
    () => debounce((val) =>{
      setEditingGeoJSON(false)
      return setGeojson(JSON.parse(val))
    }, 1000),
    []
  );

  useEffect(() => {
    if (stringJson) {
      setEditingGeoJSON(true);
      debouncedSet(stringJson);
    }
  }, [stringJson, debouncedSet]);

  useEffect(() => {
    if (editingGeoJSON) {
      console.log('Waiting for changes...');
    }
    else{
      console.log('Done');
    }
  }, [editingGeoJSON]);

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
      <MenuBar text={stringJson} setText={setStringJson} />

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
            geojson={geojson}
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
            text={stringJson}
            setText={setStringJson}
            isCompact={isSmallScreen}
          />
        </Box>
      </Box>
    </Box>
  );
}

export default App
