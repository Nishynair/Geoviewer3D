import { IconButton, Box, Tooltip } from "@mui/material";
import UploadOutlinedIcon from '@mui/icons-material/UploadOutlined';

export default function UploadButton({setText = ()=>{} }) {

  const handleFileChange = (event) => {
    const selectedFile = event.target.files[0];
    
    if (selectedFile){
      // Read file content as text
      const reader = new FileReader();
      reader.onload = (e) => {
        try{
          // Quick way to validate and format JSON
          const text = JSON.stringify(JSON.parse(e.target.result), null, 2);
          setText(text);
          // So that another file can be uploaded
          event.target.value = null;
        }catch (error){
          console.error("Invalid GeoJSON:", error.message);
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
          <IconButton variant="contained" component="span">
            <UploadOutlinedIcon sx={{ color:"white" }}/>
          </IconButton>
        </Tooltip>
      </label>
    </Box>
  );
}
