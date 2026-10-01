import * as React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import WizardSeatSelector from "./WizardSeatSelector";
import { colors } from "../hl";

interface SeatSelectionStepProps {
  eventId: number;
  attendanceBuckets: number[] | null;
  disabled?: boolean;
  hasSeating: boolean;
  allowUnspecifiedSeat: boolean;
  unspecifiedSeatLabel?: string;
  selectedSeatId: number | null;
  reservedSeatId: number | null;
  onSeatSelect: (
    seatId: number | null,
    label?: string,
    roomName?: string,
  ) => void;
}

/** Step: pick a seat on the floor plan (the picker itself is WizardSeatSelector). */
export default function SeatSelectionStep(props: SeatSelectionStepProps) {
  if (!props.hasSeating) {
    return null;
  }

  const isOptional = props.allowUnspecifiedSeat;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.75 }}>
      <Typography
        component="p"
        sx={{ m: 0, fontSize: 15, color: colors.textMuted }}
      >
        {isOptional
          ? "Tap a free seat on the floor plan, or bring your own. You can move later on the seat map."
          : "Tap a free seat on the floor plan. This event needs everyone to pick a seat; you can move later on the seat map."}
      </Typography>
      <WizardSeatSelector
        eventId={props.eventId}
        attendanceBuckets={props.attendanceBuckets}
        selectedSeatId={props.selectedSeatId}
        onSeatSelect={props.onSeatSelect}
        allowUnspecifiedSeat={props.allowUnspecifiedSeat}
        unspecifiedSeatLabel={props.unspecifiedSeatLabel}
        reservedSeatId={props.reservedSeatId}
        disabled={props.disabled || false}
      />
    </Box>
  );
}
