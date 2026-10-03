import {
  AppBar, 
  Toolbar, 
  Typography
} from "@mui/material";
import UploadButton from "./Buttons/UploadButton";
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
        <UploadButton onFileLoad={onFileLoad}/>
        <DownloadButton text={document.source.rawText}/>
        <CopyButton text={document.source.rawText}/>
        <InfoButton/>
      </Toolbar>
    </AppBar>

  )
}
