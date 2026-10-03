import { IconButton, Box, Tooltip } from "@mui/material";
import UploadOutlinedIcon from '@mui/icons-material/UploadOutlined';
import type { ChangeEvent } from 'react';

interface UploadButtonProps {
  setText?: (text: string) => void;
}

export default function UploadButton({ setText = () => {} }: UploadButtonProps) {

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const selectedFile = input.files?.[0];
    
    if (selectedFile){
      // Read file content as text
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result !== 'string') return;
        try{
          // Quick way to validate and format JSON
          const text = JSON.stringify(JSON.parse(reader.result), null, 2);
          setText(text);
          // So that another file can be uploaded
          input.value = '';
        }catch (error: unknown){
          console.error("Invalid GeoJSON:", error instanceof Error ? error.message : error);
        }
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
