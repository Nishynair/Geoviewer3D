import { useState } from "react";
import { IconButton, Tooltip } from "@mui/material";
import CopyAllOutlinedIcon from '@mui/icons-material/CopyAllOutlined';
import SnackbarAlert from "../SnackbarAlert";

export default function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);

      // reset back to normal after 2 seconds
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <Tooltip title="Copy to clipboard">
      <IconButton variant="contained" component="span" onClick={handleCopy}>
        <CopyAllOutlinedIcon sx={{ color:"white" }}/>
      </IconButton>
      {copied && <SnackbarAlert 
        message="Copied"
      />}
    </Tooltip>
  );
}
