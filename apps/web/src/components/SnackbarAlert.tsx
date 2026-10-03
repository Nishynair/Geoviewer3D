import { useState } from 'react';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import type { AlertColor } from '@mui/material/Alert';

interface SnackbarAlertProps {
  message: string;
  severity?: AlertColor;
  duration?: number;
  vertical?: 'bottom' | 'top';
  horizontal?: 'center' | 'left' | 'right';
}

export default function SnackbarAlert ({
  message, 
  severity="success", 
  duration=2000, 
  vertical="bottom", 
  horizontal="left"
}: SnackbarAlertProps) {
  const [open, setOpen] = useState(true);

  const handleClose = () => {
    setOpen(false);
  };

  return (
    <Snackbar 
      open={open} 
      autoHideDuration={duration} 
      onClose={handleClose}
      anchorOrigin={{ vertical, horizontal }}
    >
      <Alert
        onClose={handleClose}
        severity={severity}
        sx={{ width: '100%' }}
      >
        {message}
      </Alert>
    </Snackbar>
  )
}
