import * as React from "react";
import { Typography, Stack } from "@mui/material";
import WizardSeatSelector from "./WizardSeatSelector";

interface SeatSelectionStepProps {
  eventId: number;
  attendanceBuckets: number[] | null;
  disabled?: boolean;
  hasSeating: boolean;
  allowUnspecifiedSeat: boolean;
  selectedSeatId: number | null;
  onSeatSelect: (seatId: number | null, label?: string, roomName?: string) => void;
}

export default function SeatSelectionStep(props: SeatSelectionStepProps) {
  if (!props.hasSeating) {
    return null;
  }

  const isOptional = props.allowUnspecifiedSeat;

  return (
    <Stack spacing={3}>
      <Typography variant="h6" component="h2">
        Choose your seat {isOptional ? "(Optional)" : ""}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {isOptional
          ? "You can select a seat now or skip this step and choose one later."
          : "Please select a seat to continue. This event requires seat selection."}
      </Typography>
      <WizardSeatSelector
        eventId={props.eventId}
        attendanceBuckets={props.attendanceBuckets}
        selectedSeatId={props.selectedSeatId}
        onSeatSelect={props.onSeatSelect}
        allowUnspecifiedSeat={props.allowUnspecifiedSeat}
        disabled={props.disabled || false}
      />
    </Stack>
  );
}
