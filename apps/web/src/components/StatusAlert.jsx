import Alert from '@mui/material/Alert';
import { defaultValidMessage } from "../consts";

export default function StatusAlert ({
  successMessage = defaultValidMessage,
  errorMessage = null,
}) {

  return (
    <Alert severity={errorMessage ? "error" : "success"}>
      {errorMessage || successMessage}
    </Alert>
  );
}