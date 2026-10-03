import { IconButton, Tooltip } from "@mui/material";
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';

interface DownloadButtonProps {
  text: string;
  name: string;
}

export default function DownloadButton({ text, name }: DownloadButtonProps) {
  const handleDownload = () => {
    // Prompt user for a filename
    const filename = prompt("Enter file name:", name);
    if (!filename) return;

    try {
      // Create a Blob from the JSON
      const blob = new Blob([text], { type: "application/json" });

      // Create a temporary download link
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;

      // Trigger the download
      document.body.appendChild(link);
      link.click();

      // Cleanup
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Download failed:", error);
    }
  };

  return (
    <Tooltip title='Download current document'>
      <IconButton component="span" onClick={handleDownload}>
        <DownloadOutlinedIcon sx={{ color:"white" }}/>
      </IconButton>
    </Tooltip>
  );
}
