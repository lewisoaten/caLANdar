import Box from "@mui/material/Box";
import { Tag } from "../hl/Tag";
import { fonts, colors } from "../hl/tokens";
import type { ConnectionStatus } from "../../live/types";

const pad = (n: number) => String(n).padStart(2, "0");
const clock = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/**
 * `● LIVE` when connected, `RECONNECTING…` in amber, `OFFLINE · last update
 * 19:42` otherwise (DESIGN.md §7.1): at a LAN, the network is the thing most
 * likely to break.
 */
export function ConnectionIndicator({
  status,
  lastUpdate,
}: {
  status: ConnectionStatus;
  lastUpdate: number | null;
}) {
  const label =
    status === "live"
      ? "LIVE"
      : status === "connecting"
        ? "CONNECTING…"
        : status === "reconnecting"
          ? "RECONNECTING…"
          : status === "polling"
            ? "NOT LIVE YET"
            : status === "paused"
              ? "PAUSED"
              : "OFFLINE";
  const tone =
    status === "live"
      ? "lime"
      : status === "reconnecting" || status === "connecting"
        ? "amber"
        : status === "offline"
          ? "pink"
          : "neutral";
  return (
    <Box
      role="status"
      aria-live="polite"
      sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}
    >
      <Tag tone={tone} dot={status === "live" ? "pulse" : true} size="sm">
        {label}
      </Tag>
      {status !== "live" && lastUpdate != null && (
        <Box
          component="span"
          sx={{ fontFamily: fonts.mono, fontSize: 10, color: colors.textDim }}
        >
          LAST UPDATE {clock(lastUpdate)}
        </Box>
      )}
    </Box>
  );
}
