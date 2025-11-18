import * as React from "react";
import {
  Typography,
  ToggleButtonGroup,
  ToggleButton,
  Stack,
  Box,
} from "@mui/material";
import { RSVP } from "../../types/invitations";

interface RSVPResponseStepProps {
  value: RSVP | null;
  onChange: (value: RSVP | null) => void;
  disabled?: boolean;
}

export default function RSVPResponseStep(props: RSVPResponseStepProps) {
  const handleChange = (
    _event: React.MouseEvent<HTMLElement>,
    newValue: string | null,
  ) => {
    props.onChange(newValue as RSVP | null);
  };

  return (
    <Stack spacing={3}>
      <Typography variant="h6" component="h2">
        Will you be attending?
      </Typography>
      <Box display="flex" justifyContent="center">
        <ToggleButtonGroup
          color="primary"
          value={props.value}
          exclusive
          onChange={handleChange}
          aria-label="RSVP Response"
          disabled={props.disabled}
          size="large"
        >
          <ToggleButton color="success" value={RSVP.yes}>
            Yes
          </ToggleButton>
          <ToggleButton color="warning" value={RSVP.maybe}>
            Maybe
          </ToggleButton>
          <ToggleButton color="error" value={RSVP.no}>
            No
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>
    </Stack>
  );
}
