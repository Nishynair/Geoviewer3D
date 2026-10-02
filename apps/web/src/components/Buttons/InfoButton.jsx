import { useState } from "react";
import {
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  Tooltip,
  Typography,
  Link,
  Button,
  Box,
} from "@mui/material";
import InfoOutlineIcon from "@mui/icons-material/InfoOutline";

export default function InfoButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Tooltip title="About">
        <IconButton variant="contained" component="span" onClick={() => setOpen(true)}>
          <InfoOutlineIcon sx={{ color:"white" }} />
        </IconButton>
      </Tooltip>
      {/* Dialog content */}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>About Geoviewer3D</DialogTitle>
        <DialogContent dividers>
          <Box sx={{ mb: 2 }}>
            <Typography variant="body1" gutterBottom>
              <strong>GeoJSON</strong> is an open standard format designed for
              representing simple geographical features, along with their
              non-spatial attributes. It’s built on top of JSON and commonly used
              in mapping and GIS applications.
            </Typography>
            <Link
              href="https://en.wikipedia.org/wiki/GeoJSON"
              target="_blank"
              rel="noopener noreferrer"
            >
              Learn more on Wikipedia →
            </Link>
          </Box>

          <Box sx={{ mb: 2 }}>
            <Typography variant="body1" gutterBottom>
              <strong>Geoviewer3D</strong> is an open-source web app that lets
              you visualize and explore <em>GeoJSON</em> files in 3D using
              CesiumJS. You can upload, inspect, and orbit around geographical
              data interactively right in your browser.
            </Typography>
          </Box>

          <Box>
            <Typography variant="body1">
              You can view the source code and contribute on GitHub:
            </Typography>
            <Link
              href="https://github.com/nishynair/Geoviewer3D"
              target="_blank"
              rel="noopener noreferrer"
            >
              github.com/nishynair/Geoviewer3D →
            </Link>
          </Box>
        </DialogContent>

        <Box sx={{ p: 2, textAlign: "right" }}>
          <Button onClick={() => setOpen(false)}>Close</Button>
        </Box>
      </Dialog>
    </>
  );
}
