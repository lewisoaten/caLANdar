import * as React from "react";
import Box from "@mui/material/Box";
import CheckSharp from "@mui/icons-material/CheckSharp";
import moment from "moment";
import { getAttendanceGrid, TIME_PERIODS } from "../utils/attendanceBuckets";
import { colors, fonts, hairline, tint, tones, type HlTone } from "./hl";

interface AttendanceSelectorProps {
  timeBegin: moment.Moment;
  timeEnd: moment.Moment;
  value: number[] | null;
  colour?:
    | "primary"
    | "error"
    | "secondary"
    | "info"
    | "success"
    | "warning"
    | "standard"
    | undefined;
  /** Omit for a read-only view. */
  onChange?: (value: number[]) => void;
  /** Accessible name for the group of blocks. */
  label?: string;
  disabled?: boolean;
}

const COLOUR_TONE: Record<string, HlTone> = {
  primary: "lime",
  success: "lime",
  standard: "lime",
  warning: "amber",
  error: "pink",
  secondary: "violet",
  info: "cyan",
};

/** Hours shown under each block (UTC grid, rendered in local time). */
const slotHours = (start: moment.Moment) => {
  const s = moment(start).local();
  return `${s.format("HH:mm")}–${moment(s).add(6, "hours").format("HH:mm")}`;
};

/**
 * Attendance blocks for an event: one toggle tile per in-range 6-hour block
 * ("SAT · Evening"), grouped by day. With `onChange` the tiles are toggle
 * buttons (`aria-pressed`); without, a read-only summary.
 */
export default function AttendanceSelector(props: AttendanceSelectorProps) {
  // The UTC day/slot grid the API validates against. Deriving this from the
  // browser's local calendar makes the bucket count timezone-dependent, which
  // caused RSVPs to be rejected outright.
  const grid = getAttendanceGrid(props.timeBegin, props.timeEnd);

  const bucketCount = grid.reduce(
    (total, day) => total + day.slots.filter((slot) => slot.inRange).length,
    0,
  );

  // Normalise the incoming value to exactly one entry per in-range bucket,
  // defaulting missing entries to "attending".
  const attendance: number[] = Array.from({ length: bucketCount }, (_, i) =>
    props.value && props.value.length > i ? props.value[i] : 1,
  );

  const tone = tones[COLOUR_TONE[props.colour ?? "primary"] ?? "lime"];
  const interactive = Boolean(props.onChange) && !props.disabled;

  const toggle = (index: number) => {
    if (!props.onChange) return;
    const next = [...attendance];
    next[index] = next[index] === 1 ? 0 : 1;
    props.onChange(next);
  };

  return (
    <Box
      role="group"
      aria-label={props.label ?? "Attendance blocks"}
      sx={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(128px, 1fr))",
        gap: 1,
      }}
    >
      {grid.flatMap((day) =>
        day.slots.map((slot) => {
          if (slot.attendanceIndex === null) return null;
          const index = slot.attendanceIndex;
          const on = attendance[index] === 1;
          const dayLabel = day.dayStart.format("ddd").toUpperCase();
          const part = TIME_PERIODS[slot.slot];
          const common = {
            minHeight: 64,
            p: "10px 12px",
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            justifyContent: "center",
            gap: "2px",
            textAlign: "left",
            position: "relative",
            font: "inherit",
            border: `1px solid ${on ? tone.border : tint("cyan", 0.18)}`,
            backgroundColor: on ? tone.fill : "rgba(6,7,11,0.5)",
            color: on ? colors.text : colors.textMuted,
          } as const;
          const content = (
            <>
              <Box
                component="span"
                sx={{
                  fontFamily: fonts.mono,
                  fontSize: 11,
                  letterSpacing: "0.14em",
                }}
              >
                {dayLabel}
              </Box>
              <Box component="span" sx={{ fontSize: 15, fontWeight: 600 }}>
                {part}
              </Box>
              <Box
                component="span"
                sx={{
                  fontFamily: fonts.mono,
                  fontSize: 10,
                  color: colors.textMuted,
                }}
              >
                {slotHours(slot.start)}
              </Box>
              {on && (
                <CheckSharp
                  aria-hidden="true"
                  sx={{
                    position: "absolute",
                    top: 8,
                    right: 8,
                    fontSize: 18,
                    color: tone.fg,
                  }}
                />
              )}
            </>
          );
          const key = `${day.dayStart.valueOf()}-${slot.slot}`;
          if (!props.onChange) {
            return (
              <Box
                key={key}
                sx={common}
                aria-label={`${dayLabel} ${part}: ${on ? "attending" : "not attending"}`}
                role="img"
              >
                {content}
              </Box>
            );
          }
          return (
            <Box
              component="button"
              type="button"
              key={key}
              aria-pressed={on}
              aria-label={`${day.dayStart.format("dddd")} ${part.toLowerCase()} (${slotHours(slot.start)})`}
              disabled={!interactive}
              onClick={() => toggle(index)}
              sx={{
                ...common,
                cursor: interactive ? "pointer" : "not-allowed",
                "&:hover:not(:disabled)": {
                  borderColor: on ? tone.border : hairline.strong,
                },
                "&:focus-visible": {
                  outline: `2px solid ${colors.cyan}`,
                  outlineOffset: 2,
                },
                "&:disabled": { opacity: 0.6 },
              }}
            >
              {content}
            </Box>
          );
        }),
      )}
    </Box>
  );
}
