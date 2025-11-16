import * as React from "react";
import { Typography, Stack } from "@mui/material";
import SeatSelector from "../SeatSelector";

interface SeatSelectionStepProps {
  eventId: number;
  attendanceBuckets: number[] | null;
  disabled?: boolean;
  hasSeating: boolean;
  onReservationChange?: () => void;
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
      <SeatSelector
        eventId={props.eventId}
        attendanceBuckets={props.attendanceBuckets}
        disabled={props.disabled || false}
        onReservationChange={props.onReservationChange}
      />
    </Stack>
  );
}
