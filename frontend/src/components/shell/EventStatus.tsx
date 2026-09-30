import Box from "@mui/material/Box";
import {
  formatCountdown,
  splitCountdown,
  useNow,
  type TimeLike,
} from "../hl/Countdown";
import { colors, fonts, srOnly, tint } from "../hl/tokens";
import { eventPhase } from "./navModel";

interface EventTimes {
  timeBegin: TimeLike & { valueOf(): number };
  timeEnd: TimeLike & { valueOf(): number };
}

/** `T-15D 18:43:39` until doors open, `LIVE NOW` during, `ENDED` after. */
export function EventCountdownText({ event }: { event: EventTimes }) {
  const now = useNow(1000);
  const phase = eventPhase(event.timeBegin, event.timeEnd, now);
  if (phase === "live") return <>LIVE NOW</>;
  if (phase === "ended") return <>ENDED</>;
  return <>T-{formatCountdown(splitCountdown(event.timeBegin, now))}</>;
}

/**
 * Top-bar status pill for the active event: lime while counting down or live,
 * neutral once it has ended. `compact` (mobile) shows only `T-15D`.
 */
export function EventStatusPill({
  event,
  compact = false,
}: {
  event: EventTimes;
  compact?: boolean;
}) {
  const now = useNow(1000);
  const phase = eventPhase(event.timeBegin, event.timeEnd, now);
  const parts = splitCountdown(event.timeBegin, now);
  const text =
    phase === "live"
      ? "LIVE NOW"
      : phase === "ended"
        ? "ENDED"
        : compact
          ? `T-${formatCountdown(parts, "short")}`
          : `DOORS OPEN · T-${formatCountdown(parts)}`;
  const ended = phase === "ended";
  const color = ended ? colors.textMuted : colors.lime;

  return (
    <Box
      sx={{
        flex: "none",
        display: "flex",
        alignItems: "center",
        gap: 1,
        height: 34,
        px: 1.5,
        border: `1px solid ${ended ? tint("neutral", 0.3) : tint("lime", 0.35)}`,
        backgroundColor: ended ? "transparent" : tint("lime", 0.06),
        fontFamily: fonts.mono,
        fontSize: 12,
        whiteSpace: "nowrap",
        color,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {!ended && (
        <Box
          component="span"
          aria-hidden="true"
          sx={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            backgroundColor: color,
            animation: "hlPulse 1.6s ease-in-out infinite",
          }}
        />
      )}
      <span aria-hidden="true">{text}</span>
      <Box component="span" sx={srOnly}>
        {phase === "upcoming"
          ? `Doors open ${new Date(event.timeBegin.valueOf()).toLocaleString()}`
          : phase === "live"
            ? "Event is live now"
            : "Event has ended"}
      </Box>
    </Box>
  );
}
