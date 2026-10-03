import { useState } from "react";
import { IconButton, Tooltip } from "@mui/material";
import CopyAllOutlinedIcon from '@mui/icons-material/CopyAllOutlined';
import SnackbarAlert from "../SnackbarAlert";

interface CopyButtonProps {
  text: string;
}

export default function CopyButton({ text }: CopyButtonProps) {
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
    <>
      <Tooltip title="Copy to clipboard">
        <IconButton component="span" onClick={handleCopy}>
          <CopyAllOutlinedIcon sx={{ color: "white" }} />
        </IconButton>
      </Tooltip>
      {copied && <SnackbarAlert 
        message="Copied"
      />}
    </>
  );
}
