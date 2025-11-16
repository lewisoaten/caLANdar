import * as React from "react";
import { Typography, Stack, Alert, Button } from "@mui/material";

interface SeatSelectionStepProps {
  eventId: number;
  attendanceBuckets: number[] | null;
  disabled?: boolean;
  hasSeating: boolean;
  onSkip?: () => void;
}

export default function SeatSelectionStep(props: SeatSelectionStepProps) {
  if (!props.hasSeating) {
    return null;
  }

  return (
    <Stack spacing={3}>
      <Typography variant="h6" component="h2">
        Choose your seat (Optional)
      </Typography>
      <Typography variant="body2" color="text.secondary">
        You can select a seat now or skip this step and choose one later.
      </Typography>
      <Alert severity="info">
        Seat selection will be available after you complete your RSVP. You can
        come back later to choose your seat on the event page.
      </Alert>
      {props.onSkip && (
        <Button variant="outlined" onClick={props.onSkip} fullWidth>
          Skip for now
        </Button>
      )}
    </Stack>
  );
}
