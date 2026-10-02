import { IconButton, Tooltip } from '@mui/material';
import KeyboardDoubleArrowLeftIcon from '@mui/icons-material/KeyboardDoubleArrowLeft';
import KeyboardDoubleArrowRightIcon from '@mui/icons-material/KeyboardDoubleArrowRight';
import KeyboardDoubleArrowUpIcon from '@mui/icons-material/KeyboardDoubleArrowUp';
import KeyboardDoubleArrowDownIcon from '@mui/icons-material/KeyboardDoubleArrowDown';

export default function MinimizeMaximizeButton({ expanded, setExpanded, isSmallScreen }) {
  
  const handleToggleExpand = () => {
    setExpanded((prev) => !prev);
  };

  return (
   <Tooltip title={expanded ? "Collapse Viewer" : "Expand Viewer"}>
      <IconButton
        onClick={handleToggleExpand}
        size="small"
        variant="contained"
        component="span"
        sx={{
          position: "absolute",
          color: "#000",
          backgroundColor: "rgba(255,255,255,.25)",
          zIndex: 10,
          // to align the center of the button with the center parts of screen, 
          // instead of the top left
          transform: {
            xs: "translate(-50%, 50%)", // for bottom center
            md: "translate(50%, -50%)", // for right center
          },
          "&:hover": { backgroundColor: "rgba(255,255,255.55)" },
          // Position adjustments based on screen size
          bottom: { xs: 20, md: "50%" },
          left: { xs: "50%", md: "auto" },
          right: { xs: "auto", md: 20 },
          top: { xs: "auto", md: "50%" },
          height: "2em",
          width: "2em",
          border:0,
          borderRadius:999,
        }}
      >
        {
          isSmallScreen ?
          (expanded ? <KeyboardDoubleArrowUpIcon/> :  <KeyboardDoubleArrowDownIcon/>) :
          (expanded ? <KeyboardDoubleArrowLeftIcon/> :  <KeyboardDoubleArrowRightIcon/>)
        }
      </IconButton>
    </Tooltip>
  );
};








