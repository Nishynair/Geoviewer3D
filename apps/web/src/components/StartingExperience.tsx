import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';

interface StartingExperienceProps {
  onOpenFile: () => void;
  isReadingFile?: boolean;
  errorMessage?: string | null;
}

export default function StartingExperience({
  onOpenFile,
  isReadingFile = false,
  errorMessage = null,
}: StartingExperienceProps) {
  return (
    <Paper
      component="section"
      variant="outlined"
      aria-labelledby="starting-experience-heading"
      sx={{ p: { xs: 1.5, md: 2 }, mx: 1, mt: 1, mb: 0.5 }}
    >
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          alignItems: { sm: 'center' },
          justifyContent: 'space-between',
          gap: 1.5,
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography id="starting-experience-heading" component="h1" variant="h6">
            Open or drop a spatial file
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Drop a GeoJSON or supported JSON-FG file anywhere in the workspace.
          </Typography>
        </Box>
        <Button
          type="button"
          variant="contained"
          onClick={onOpenFile}
          sx={{ flex: '0 0 auto', alignSelf: { xs: 'flex-start', sm: 'center' } }}
        >
          Choose a file
        </Button>
      </Box>

      <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 0, mt: 1 }}>
        Your file is read and inspected in this browser. Map requests can reveal the area in view:
        the globe requests Cesium Ion terrain, OpenStreetMap building tiles, and Bing imagery.
        Comparing a feature with terrain sends its coordinates to Cesium for terrain sampling.
      </Typography>

      {isReadingFile && (
        <Alert severity="info" role="status" sx={{ mt: 1 }}>
          Reading your file…
        </Alert>
      )}
      {errorMessage && (
        <Alert severity="error" role="alert" sx={{ mt: 1 }}>
          {errorMessage}
        </Alert>
      )}
    </Paper>
  );
}
