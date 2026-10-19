/**
 * AUDIT · PLAYERS (admin only, README §1e): the timeline as one row per
 * checked-in gamer, with each stay in a lobby as a segment marked STEAM or
 * MANUAL, and AFK and drop-outs called out.
 */
import * as React from "react";
import Box from "@mui/material/Box";
import { UserAvatar } from "../hl/UserAvatar";
import { colors, tint } from "../hl/tokens";
import type { LiveState } from "../../live/store";
import {
  clock,
  gameColor,
  timelineRange,
  visibleLobbies,
} from "../../live/selectors";
import { Mono, coverBackground } from "./liveUi";
import { PX_PER_HOUR } from "./LiveTimeline";

const HOUR = 3600_000;
const LABEL_W = 160;

export function AuditTimeline({
  state,
  now,
}: {
  state: LiveState;
  now: number;
}) {
  const scroller = React.useRef<HTMLDivElement>(null);
  const range = timelineRange(state);
  const nowX = range ? ((now - range[0]) / HOUR) * PX_PER_HOUR : 0;
  React.useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = Math.max(0, nowX + LABEL_W - el.clientWidth * 0.6);
    // Only on mount: then the admin scrolls.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!range) return null;
  const [t0, t1] = range;
  const width = ((t1 - t0) / HOUR) * PX_PER_HOUR;
  const x = (t: number) => ((t - t0) / HOUR) * PX_PER_HOUR;
  const people = Object.values(state.people)
    .filter((p) => p.checkedIn)
    .sort((a, b) => a.handle.localeCompare(b.handle));
  const lobbies = visibleLobbies(state);

  const ticks: number[] = [];
  for (let t = t0; t <= t1; t += HOUR) ticks.push(t);

  return (
    <Box ref={scroller} sx={{ overflowX: "auto" }} data-testid="audit-timeline">
      <Box sx={{ width: width + LABEL_W }}>
        <Box sx={{ display: "flex", height: 22 }}>
          <Box
            sx={{
              position: "sticky",
              left: 0,
              zIndex: 3,
              width: LABEL_W,
              flex: "none",
              backgroundColor: colors.surfaceSolid,
            }}
          />
          <Box sx={{ position: "relative", width, flex: "none" }}>
            {ticks.map((t) => (
              <Mono
                key={t}
                size={10}
                weight={400}
                color={colors.textDim}
                sx={{
                  position: "absolute",
                  top: "5px",
                  left: x(t),
                  transform: "translateX(-50%)",
                }}
              >
                {clock(t)}
              </Mono>
            ))}
          </Box>
        </Box>
        {people.length === 0 && (
          <Box sx={{ p: 2, color: colors.textMuted, fontSize: 14 }}>
            Nobody has checked in yet.
          </Box>
        )}
        {people.map((p) => {
          const segments = lobbies.flatMap((l) =>
            l.members
              .filter((m) => m.pid === p.pid)
              .map((m) => ({
                l,
                m,
                s: Date.parse(m.joinedAt),
                e: m.leftAt ? Date.parse(m.leftAt) : now,
              })),
          );
          const badge = p.presence?.afk
            ? ["AFK", colors.amber]
            : p.presence?.via
              ? [
                  p.presence.via.toUpperCase(),
                  p.presence.via === "steam"
                    ? colors.textMuted
                    : colors.violetText,
                ]
              : p.hasSteam
                ? ["STEAM", colors.textDim]
                : ["MANUAL", colors.textDim];
          return (
            <Box
              key={p.pid}
              sx={{
                display: "flex",
                height: 36,
                borderTop: `1px solid ${tint("cyan", 0.07)}`,
              }}
            >
              <Box
                sx={{
                  position: "sticky",
                  left: 0,
                  zIndex: 3,
                  width: LABEL_W,
                  flex: "none",
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  px: "10px",
                  boxSizing: "border-box",
                  backgroundColor: colors.surfaceSolid,
                  borderRight: `1px solid ${tint("cyan", 0.12)}`,
                }}
              >
                <UserAvatar name={p.handle} src={p.avatarUrl} size={22} />
                <Box
                  component="span"
                  sx={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: 12,
                    color: colors.text,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {p.handle}
                </Box>
                <Mono size={8} color={badge[1]}>
                  {badge[0]}
                </Mono>
              </Box>
              <Box sx={{ position: "relative", width, flex: "none" }}>
                {segments.map(({ l, m, s, e }) => (
                  <Box
                    key={`${l.id}-${m.joinedAt}`}
                    title={`${l.name} · ${clock(s)}–${m.leftAt ? clock(e) : "now"} · ${m.via}${m.leftReason ? ` · ${m.leftReason}` : ""}`}
                    sx={{
                      position: "absolute",
                      top: "5px",
                      bottom: "5px",
                      left: x(s),
                      width: Math.max(4, x(e) - x(s) - 2),
                      overflow: "hidden",
                      display: "flex",
                      alignItems: "center",
                      border: `1px ${m.via === "steam" ? "solid" : "dashed"} ${gameColor(l)}`,
                      backgroundColor: colors.surfaceSolid,
                      backgroundImage: coverBackground(l.gameId, l.kind),
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }}
                  >
                    <Box
                      sx={{
                        position: "absolute",
                        inset: 0,
                        background: "rgba(6,7,11,0.72)",
                      }}
                    />
                    <Mono
                      size={9}
                      color={colors.text}
                      sx={{ position: "relative", px: "6px" }}
                    >
                      {l.name} · {m.via.toUpperCase()}
                      {m.leftReason === "elsewhere" ? " · DROPPED" : ""}
                    </Mono>
                  </Box>
                ))}
                <Box
                  sx={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    left: x(now),
                    width: "2px",
                    backgroundColor: colors.lime,
                  }}
                />
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

export default AuditTimeline;
