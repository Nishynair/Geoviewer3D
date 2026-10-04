import {
  AppBar, 
  Toolbar, 
  Typography
} from "@mui/material";
import UploadButton from "./Buttons/UploadButton";
import ExamplesButton from "./Buttons/ExamplesButton";
import DownloadButton from "./Buttons/DownloadButton";
import CopyButton from "./Buttons/CopyButton";
import InfoButton from "./Buttons/InfoButton";
import type { SpatialDocument } from "../spatialDocument";
import type { CuratedDemo } from "../curatedExamples";

interface MenuBarProps {
  document: SpatialDocument;
  onFileLoad: (name: string, rawText: string) => void;
  onDemoLoad: (demo: CuratedDemo) => void;
  onOpenFile: () => void;
}

export default function MenuBar({ document, onFileLoad, onDemoLoad, onOpenFile }: MenuBarProps) {
  return (
    <AppBar position="static" >
      <Toolbar
        variant="dense"
        sx={{
          px: { xs: 1, sm: 2 },
          '& .MuiIconButton-root': { p: { xs: 0.5, sm: 1 } },
          '& .MuiButton-root': {
            minWidth: { xs: 0, sm: 64 },
            px: { xs: 0.75, sm: 2 },
            fontSize: { xs: '0.75rem', sm: '0.875rem' },
          },
        }}
      >
        <Typography 
          variant="h6" 
          sx={{ 
            fontWeight: "bold",
            flexGrow: 1,
            flexShrink: 1,
            minWidth: 0,
            whiteSpace: 'nowrap',
            fontSize: { xs: '1rem', sm: '1.25rem' },
          }}
        >
          Geoviewer3D
        </Typography>
        <ExamplesButton onFileLoad={onFileLoad} onDemoLoad={onDemoLoad}/>
        <UploadButton onOpenFile={onOpenFile}/>
        <DownloadButton text={document.source.rawText} name={document.source.name}/>
        <CopyButton text={document.source.rawText}/>
        <InfoButton/>
      </Toolbar>
    </AppBar>

  )
}
