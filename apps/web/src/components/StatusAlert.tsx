import Alert from '@mui/material/Alert';
import { defaultValidMessage } from "../consts";

interface StatusAlertProps {
  successMessage?: string;
  errorMessage?: string | null;
}

export default function StatusAlert ({
  successMessage = defaultValidMessage,
  errorMessage = null,
}: StatusAlertProps) {

  return (
    <Alert severity={errorMessage ? "error" : "success"}>
      {errorMessage || successMessage}
    </Alert>
  );
}
