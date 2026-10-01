import * as React from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import moment from "moment";
import AttendanceSelector from "../AttendanceSelector";
import { getAttendanceDescription } from "../../utils/attendanceDescription";
import { getAttendanceBucketCount } from "../../utils/attendanceBuckets";
import { colors, tones } from "../hl";

interface AttendanceStepProps {
  timeBegin: moment.Moment;
  timeEnd: moment.Moment;
  value: number[] | null;
  onChange: (value: number[]) => void;
  disabled?: boolean;
  /** Colour of selected blocks (amber for a "maybe"). */
  tone?: "success" | "warning";
}

/** Step: which 6-hour blocks you'll be there for. */
export default function AttendanceStep(props: AttendanceStepProps) {
  const count = getAttendanceBucketCount(props.timeBegin, props.timeEnd);
  const selected = props.value?.filter((v) => v === 1).length ?? 0;
  const hasSelection = selected > 0;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.75 }}>
      <Typography
        id="attendance-help"
        component="p"
        sx={{ m: 0, fontSize: 15, color: colors.textMuted }}
      >
        Tap the blocks you&apos;ll be there for. Helps us plan games and seats.
      </Typography>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
        <Button
          size="small"
          variant="outlined"
          color="inherit"
          disabled={props.disabled || selected === count}
          onClick={() => props.onChange(Array.from({ length: count }, () => 1))}
        >
          All weekend
        </Button>
        <Button
          size="small"
          variant="text"
          color="inherit"
          disabled={props.disabled || selected === 0}
          onClick={() => props.onChange(Array.from({ length: count }, () => 0))}
        >
          Clear
        </Button>
      </Box>
      <AttendanceSelector
        timeBegin={props.timeBegin}
        timeEnd={props.timeEnd}
        value={props.value}
        colour={props.tone ?? "success"}
        onChange={props.onChange}
        disabled={props.disabled}
        label="Attendance blocks"
      />
      <Box
        role="status"
        sx={{
          fontSize: 14,
          color: hasSelection ? colors.text2 : tones.amber.fg,
          minHeight: 22,
        }}
      >
        {hasSelection ? (
          <>
            <Box component="strong" sx={{ color: colors.text }}>
              {selected}/{count} blocks:
            </Box>{" "}
            {getAttendanceDescription(
              props.value,
              props.timeBegin,
              props.timeEnd,
            )}
          </>
        ) : (
          "Pick at least one block to continue."
        )}
      </Box>
    </Box>
  );
}
