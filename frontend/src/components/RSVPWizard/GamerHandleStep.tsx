import * as React from "react";
import { useEffect } from "react";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { colors, fonts, tint } from "../hl";

interface GamerHandleStepProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  onValidationChange?: (isValid: boolean) => void;
}

/** Pure validation for a callsign; returns an error message or "". */
export const validateHandle = (value: string): string => {
  if (!value || value.trim().length === 0) return "Callsign is required";
  if (value.length < 2) return "Callsign must be at least 2 characters";
  if (value.length > 50) return "Callsign must be less than 50 characters";
  return "";
};

/** Step: your callsign (gamer handle) for this event. */
export default function GamerHandleStep(props: GamerHandleStepProps) {
  const error = validateHandle(props.value);
  const { onValidationChange } = props;

  useEffect(() => {
    onValidationChange?.(error === "");
  }, [error, onValidationChange]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    props.onChange(event.target.value);
  };

  const showError = !!error && props.value.length > 0;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <Typography
        id="callsign-help"
        component="p"
        sx={{ m: 0, fontSize: 15, color: colors.textMuted }}
      >
        What should the squad call you? This shows on the seat map and roster.
      </Typography>
      <TextField
        label="Callsign"
        variant="outlined"
        value={props.value}
        onChange={handleChange}
        disabled={props.disabled}
        error={showError}
        helperText={showError ? error : "2–50 characters"}
        autoFocus
        fullWidth
        required
        slotProps={{
          htmlInput: {
            maxLength: 60,
            autoComplete: "nickname",
            spellCheck: false,
          },
        }}
        sx={{
          mt: 1,
          "& .MuiInputBase-input": {
            minHeight: 24,
            fontSize: 20,
            fontWeight: 600,
            letterSpacing: "0.02em",
          },
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: tint("cyan", 0.4),
          },
          "& .MuiFormHelperText-root": { fontFamily: fonts.mono },
        }}
      />
    </Box>
  );
}
