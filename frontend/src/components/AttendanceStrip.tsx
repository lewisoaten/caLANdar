import * as React from "react";
import Box from "@mui/material/Box";
import moment from "moment";
import { colors, fonts, hairline, tint, tones, type HlTone } from "./hl";
import { attendanceCells } from "./lobbyModel";
import { getAttendanceDescription } from "../utils/attendanceDescription";

interface AttendanceStripProps {
  attendance: number[] | null | undefined;
  timeBegin: moment.Moment;
  timeEnd: moment.Moment;
  /** Colour of attended blocks (lime for IN, amber for MAYBE). */
  tone?: HlTone;
  /** `lg` = 28px cells with day labels (RSVP panel); `sm` = 5px bars (squad rows). */
  size?: "sm" | "lg";
  /** Treat every block as off (OUT / not responded). */
  off?: boolean;
  /** Prefix for the accessible description, e.g. "NightOwl attending". */
  label?: string;
}

/**
 * Row of attendance blocks. Colour is backed by an accessible text summary
 * ("Attending: Friday evening until Sunday morning") so meaning never relies
 * on colour alone.
 */
export default function AttendanceStrip({
  attendance,
  timeBegin,
  timeEnd,
  tone = "lime",
  size = "sm",
  off = false,
  label = "Attending",
}: AttendanceStripProps) {
  const { cells, days } = attendanceCells(
    off ? null : attendance,
    timeBegin,
    timeEnd,
  );
  if (cells.length === 0) return null;
  const description = off
    ? `${label}: none`
    : `${label}: ${getAttendanceDescription(attendance ?? null, timeBegin, timeEnd)}`;
  const lg = size === "lg";
  const onColor = tones[tone].solid;

  return (
    <Box
      sx={{ display: "flex", flexDirection: "column", gap: lg ? 1 : 0 }}
      role="img"
      aria-label={description}
    >
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))`,
          gap: lg ? "3px" : "2px",
          maxWidth: lg ? undefined : 200,
        }}
      >
        {cells.map((cell, i) => (
          <Box
            key={i}
            title={
              lg ? `${cell.label}: ${cell.on ? "there" : "away"}` : undefined
            }
            sx={{
              height: lg ? 28 : 5,
              backgroundColor: cell.on
                ? onColor
                : tint("neutral", lg ? 0.06 : 0.12),
              border: lg
                ? `1px solid ${cell.on ? "transparent" : tint("neutral", 0.18)}`
                : undefined,
            }}
          />
        ))}
      </Box>
      {lg && (
        <Box
          aria-hidden="true"
          sx={{
            display: "grid",
            gridTemplateColumns: days.map((d) => `${d.span}fr`).join(" "),
            fontFamily: fonts.mono,
            fontSize: 10,
            letterSpacing: "0.14em",
            color: colors.textMuted,
          }}
        >
          {days.map((d, i) => (
            <Box
              component="span"
              key={`${d.label}-${i}`}
              sx={
                i > 0
                  ? { borderLeft: `1px solid ${hairline.panel}`, pl: "6px" }
                  : undefined
              }
            >
              {d.label}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
