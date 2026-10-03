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

interface MenuBarProps {
  document: SpatialDocument;
  onFileLoad: (name: string, rawText: string) => void;
}

export default function MenuBar({ document, onFileLoad }: MenuBarProps) {
  return (
    <AppBar position="static" >
      <Toolbar variant="dense">
        <Typography 
          variant="h6" 
          sx={{ 
            fontWeight: "bold",
            flexGrow: 1,
          }}
        >
          Geoviewer3D
        </Typography>
        <ExamplesButton onFileLoad={onFileLoad}/>
        <UploadButton onFileLoad={onFileLoad}/>
        <DownloadButton text={document.source.rawText} name={document.source.name}/>
        <CopyButton text={document.source.rawText}/>
        <InfoButton/>
      </Toolbar>
    </AppBar>

  )
}
