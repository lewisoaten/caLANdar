import * as React from "react";
import { useState, useEffect } from "react";
import { Typography, TextField, Stack, Alert } from "@mui/material";

interface GamerHandleStepProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  onValidationChange?: (isValid: boolean) => void;
}

export default function GamerHandleStep(props: GamerHandleStepProps) {
  const [error, setError] = useState<string>("");

  useEffect(() => {
    // Validate handle
    if (!props.value || props.value.trim().length === 0) {
      setError("Handle is required");
      props.onValidationChange?.(false);
    } else if (props.value.length < 2) {
      setError("Handle must be at least 2 characters");
      props.onValidationChange?.(false);
    } else if (props.value.length > 50) {
      setError("Handle must be less than 50 characters");
      props.onValidationChange?.(false);
    } else {
      setError("");
      props.onValidationChange?.(true);
    }
  }, [props.value, props.onValidationChange]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    props.onChange(event.target.value);
  };

  return (
    <Stack spacing={3}>
      <Typography variant="h6" component="h2">
        Enter your gamer handle
      </Typography>
      <Typography variant="body2" color="text.secondary">
        This is how you&apos;ll be identified to other attendees.
      </Typography>
      <TextField
        label="Gamer Handle"
        variant="outlined"
        value={props.value}
        onChange={handleChange}
        disabled={props.disabled}
        error={!!error && props.value.length > 0}
        helperText={error && props.value.length > 0 ? error : ""}
        autoFocus
        fullWidth
        required
      />
      {!error && props.value && (
        <Alert severity="success">Handle is valid!</Alert>
      )}
    </Stack>
  );
}
