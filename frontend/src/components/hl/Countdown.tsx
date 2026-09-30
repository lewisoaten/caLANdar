import * as React from "react";
import Box from "@mui/material/Box";
import type { SxProps, Theme } from "@mui/material/styles";
import { colors, fonts, tint, srOnly } from "./tokens";

/** Anything with a millisecond value: Date, moment, epoch ms or ISO string. */
export type TimeLike = Date | number | string | { valueOf(): number };

export interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** True once the target has passed (all parts are 0). */
  done: boolean;
}

export const toMillis = (t: TimeLike): number =>
  typeof t === "string" ? Date.parse(t) : Number(t.valueOf());

/** Split the time remaining until `target` (from `now`) into d/h/m/s. */
export function splitCountdown(
  target: TimeLike,
  now: TimeLike,
): CountdownParts {
  const diff = Math.floor((toMillis(target) - toMillis(now)) / 1000);
  if (!Number.isFinite(diff) || diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, done: true };
  }
  return {
    days: Math.floor(diff / 86400),
    hours: Math.floor((diff % 86400) / 3600),
    minutes: Math.floor((diff % 3600) / 60),
    seconds: diff % 60,
    done: false,
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Compact readout: `15D 18:43:39` (`long`) or `15D` (`short`). */
export function formatCountdown(
  parts: CountdownParts,
  style: "long" | "short" = "long",
): string {
  if (style === "short") {
    return parts.days > 0
      ? `${parts.days}D`
      : `${pad(parts.hours)}:${pad(parts.minutes)}`;
  }
  return `${parts.days}D ${pad(parts.hours)}:${pad(parts.minutes)}:${pad(parts.seconds)}`;
}

/** Current time in ms, re-rendering every `intervalMs` (default 1s). */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

export interface CountdownProps {
  /** When the countdown ends (e.g. `event.timeBegin`). */
  target: TimeLike;
  /** Accessible name for the timer. */
  label?: string;
  /** `cells` = boxed DAYS/HRS/MIN/SEC readout; `inline` = `T-15D 18:43:39`. */
  variant?: "cells" | "inline";
  /** Override "now" (tests/stories); otherwise ticks every second. */
  now?: TimeLike;
  /** Shown in place of the readout once the target has passed. */
  doneContent?: React.ReactNode;
  sx?: SxProps<Theme>;
}

/** Live countdown to a moment in time. */
export function Countdown({
  target,
  label = "Time remaining",
  variant = "cells",
  now,
  doneContent,
  sx,
}: CountdownProps) {
  const ticking = useNow(1000);
  const parts = splitCountdown(target, now ?? ticking);

  if (parts.done && doneContent !== undefined) return <>{doneContent}</>;

  if (variant === "inline") {
    return (
      <Box
        component="span"
        role="timer"
        aria-label={label}
        sx={[
          {
            fontFamily: fonts.mono,
            fontVariantNumeric: "tabular-nums",
            color: colors.cyan,
          },
          ...(Array.isArray(sx) ? sx : [sx]),
        ]}
      >
        T-{formatCountdown(parts)}
      </Box>
    );
  }

  const cells: Array<[number, string, string]> = [
    [parts.days, "DAYS", "days"],
    [parts.hours, "HRS", "hours"],
    [parts.minutes, "MIN", "minutes"],
    [parts.seconds, "SEC", "seconds"],
  ];

  return (
    <Box
      role="timer"
      aria-label={label}
      sx={[
        {
          display: "flex",
          flexWrap: "wrap",
          gap: "10px",
          alignItems: "stretch",
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {cells.map(([value, short, long]) => (
        <Box
          key={short}
          sx={{
            minWidth: "clamp(68px, 9vw, 92px)",
            padding: "10px 12px 8px",
            border: `1px solid ${tint("cyan", 0.35)}`,
            backgroundColor: "rgba(6,7,11,0.65)",
            display: "flex",
            flexDirection: "column",
            gap: "2px",
          }}
        >
          <Box
            component="span"
            sx={{
              fontFamily: fonts.mono,
              fontSize: "clamp(26px, 3.4vw, 40px)",
              fontWeight: 700,
              lineHeight: 1,
              color: colors.cyan,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {pad(value)}
            <Box component="span" sx={srOnly}>
              {` ${long}`}
            </Box>
          </Box>
          <Box
            component="span"
            aria-hidden="true"
            sx={{
              fontFamily: fonts.mono,
              fontSize: 10,
              letterSpacing: "0.18em",
              color: colors.textMuted,
            }}
          >
            {short}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

export default Countdown;
