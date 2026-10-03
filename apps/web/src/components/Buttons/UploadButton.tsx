import { IconButton, Box, Tooltip } from "@mui/material";
import UploadOutlinedIcon from '@mui/icons-material/UploadOutlined';
import type { ChangeEvent } from 'react';

interface UploadButtonProps {
  onFileLoad: (name: string, rawText: string) => void;
}

export default function UploadButton({ onFileLoad }: UploadButtonProps) {

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const selectedFile = input.files?.[0];
    
    if (selectedFile){
      // Read file content as text
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result !== 'string') return;
        onFileLoad(selectedFile.name, reader.result);
        // So that another file can be uploaded
        input.value = '';
      }
      reader.readAsText(selectedFile);
    }
       
  };

  return (
    <Box >
      {/* The hidden file input */}
      <input
        accept=".json,.geojson"
        id="upload-json"
        type="file"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />
      <label htmlFor="upload-json">
        <Tooltip title='Upload GeoJSON'>
          <IconButton component="span">
            <UploadOutlinedIcon sx={{ color:"white" }}/>
          </IconButton>
        </Tooltip>
      </label>
    </Box>
  );
}
