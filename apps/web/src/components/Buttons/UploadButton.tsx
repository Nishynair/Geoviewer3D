import { IconButton, Tooltip } from "@mui/material";
import UploadOutlinedIcon from '@mui/icons-material/UploadOutlined';

interface UploadButtonProps {
  onOpenFile: () => void;
}

export default function UploadButton({ onOpenFile }: UploadButtonProps) {
  return (
    <Tooltip title="Upload GeoJSON or JSON-FG">
      <IconButton aria-label="Upload GeoJSON or JSON-FG" onClick={onOpenFile}>
        <UploadOutlinedIcon sx={{ color: 'white' }} />
      </IconButton>
    </Tooltip>
  );
}
