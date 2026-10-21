/**
 * The Live timeline (DESIGN.md §7.2; README "Timeline panel"): read-only,
 * 100px per hour, a sticky lane-label column, your rows first, the NOW line,
 * and blocks drawn by state. Scrolls so NOW sits at ~45% of the width.
 */
import * as React from "react";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import { colors, fonts, tint } from "../hl/tokens";
import type { LiveState } from "../../live/store";
import type { LobbyView } from "../../live/types";
import {
  blockLook,
  clock,
  lobbyPeople,
  lobbySpan,
  packLanes,
  personFor,
  timelineRange,
  visibleLobbies,
  activePrejoins,
  currentMembers,
} from "../../live/selectors";
import { AvatarRow, Mono, coverBackground } from "./liveUi";

export const PX_PER_HOUR = 100;
const HOUR = 3600_000;
const LABEL_W = 44;
const LANE_H = 84;
const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

interface Props {
  state: LiveState;
  now: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Bumped to scroll back to NOW. */
  jumpKey?: number;
}

function blockCount(l: LobbyView): string {
  const inNow = currentMembers(l).length;
  if (l.status === "proposed") {
    const backers = activePrejoins(l).filter(
      (p) => p.pid !== l.proposedBy,
    ).length;
    return `${backers}/1 BACKER`;
  }
  const people =
    l.status === "live" || l.status === "grace" || l.status === "empty"
      ? inNow
      : lobbyPeople(l).length;
  const cap = l.maxPlayers ?? l.teams?.reduce((n, t) => n + t.size, 0) ?? null;
  return cap ? `${people}/${cap}` : people ? String(people) : "";
}

export function LiveTimeline({
  state,
  now,
  selectedId,
  onSelect,
  jumpKey,
}: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const range = timelineRange(state);
  // Re-pack once a minute; lanes change with state, not with seconds.
  const minute = Math.floor(now / 60000);
  const lanes = useMemo(
    () => packLanes(visibleLobbies(state), state.me, minute * 60000),
    // `state` is replaced on every update; its lobbies and me are what count.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.lobbies, state.me, minute],
  );

  const t0 = range?.[0] ?? now;
  const t1 = range?.[1] ?? now + HOUR;
  const width = ((t1 - t0) / HOUR) * PX_PER_HOUR;
  const x = (t: number) => ((t - t0) / HOUR) * PX_PER_HOUR;
  const markT = Math.min(Math.max(now, t0), t1);
  const markX = x(markT);
  const beforeEvent = state.event && now < Date.parse(state.event.timeBegin);

  // Our own scrolling also fires `scroll`; only the user's counts.
  const programmatic = useRef(false);
  const scrollToNow = () => {
    const el = scroller.current;
    if (!el) return;
    const target = Math.max(0, markX + LABEL_W - el.clientWidth * 0.45);
    if (Math.abs(el.scrollLeft - target) < 1) return;
    programmatic.current = true;
    el.scrollLeft = target;
  };

  // Scroll to NOW on load and when asked; then once a minute only if the
  // user hasn't scrolled away by hand.
  const userScrolled = useRef(false);
  useLayoutEffect(() => {
    userScrolled.current = false;
    scrollToNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpKey, state.loaded]);
  useEffect(() => {
    if (!userScrolled.current) scrollToNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minute]);

  if (!range) return null;

  const ticks: { t: number; label: string; midnight: boolean }[] = [];
  for (let t = t0; t <= t1; t += HOUR) {
    const d = new Date(t);
    const midnight = d.getHours() === 0;
    ticks.push({
      t,
      label: midnight ? `${DAYS[d.getDay()]} 00:00` : clock(t),
      midnight,
    });
  }

  const hourBg = `${PX_PER_HOUR}px 100%`;
  const lanesToDraw = lanes.length
    ? lanes
    : [{ label: "1", mine: false, lobbies: [] as LobbyView[] }];

  return (
    <Box
      ref={scroller}
      data-testid="live-timeline"
      onScroll={() => {
        if (programmatic.current) programmatic.current = false;
        else userScrolled.current = true;
      }}
      sx={{ overflowX: "auto", overflowY: "hidden" }}
    >
      <Box
        sx={{
          width: width + LABEL_W,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Hour ticks */}
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
            {ticks.map((k) => (
              <Box
                key={k.t}
                component="span"
                sx={{
                  position: "absolute",
                  top: "5px",
                  left: x(k.t),
                  transform: k.t === t0 ? "none" : "translateX(-50%)",
                  fontFamily: fonts.mono,
                  fontSize: 10,
                  color: k.midnight ? colors.cyan : colors.textDim,
                  fontWeight: k.midnight ? 700 : 400,
                  whiteSpace: "nowrap",
                }}
              >
                {k.label}
              </Box>
            ))}
          </Box>
        </Box>

        {lanesToDraw.map((lane, i) => (
          <Box
            key={`${lane.label}-${i}`}
            sx={{
              display: "flex",
              height: LANE_H,
              borderTop: `1px solid ${lane.mine ? tint("cyan", 0.4) : tint("cyan", 0.1)}`,
              backgroundColor: lane.mine ? tint("cyan", 0.06) : "transparent",
            }}
          >
            <Box
              sx={{
                position: "sticky",
                left: 0,
                zIndex: 3,
                width: LABEL_W,
                flex: "none",
                display: "grid",
                placeItems: "center",
                backgroundColor: colors.surfaceSolid,
                borderRight: `1px solid ${tint("cyan", 0.12)}`,
              }}
            >
              {lane.mine ? (
                <Mono
                  size={10}
                  color={colors.ink}
                  sx={{ backgroundColor: colors.cyan, px: "4px", py: "1px" }}
                >
                  YOU
                </Mono>
              ) : (
                <Mono size={10} color={colors.textDim}>
                  {lane.label}
                </Mono>
              )}
            </Box>
            <Box
              sx={{
                position: "relative",
                width,
                flex: "none",
                backgroundImage: `linear-gradient(90deg, ${tint("cyan", 0.05)} 1px, transparent 1px)`,
                backgroundSize: hourBg,
              }}
            >
              <Box
                aria-hidden="true"
                sx={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: 0,
                  width: markX,
                  background: "rgba(255,255,255,0.02)",
                }}
              />
              {lane.lobbies.map((l) => (
                <TimelineBlock
                  key={l.id}
                  lobby={l}
                  state={state}
                  now={now}
                  left={x(lobbySpan(l, now)[0])}
                  width={x(lobbySpan(l, now)[1]) - x(lobbySpan(l, now)[0]) - 3}
                  futureFrom={
                    l.status === "live"
                      ? x(now) - x(lobbySpan(l, now)[0])
                      : null
                  }
                  selected={l.id === selectedId}
                  onSelect={onSelect}
                />
              ))}
              <Box
                aria-hidden="true"
                sx={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: markX,
                  width: "2px",
                  backgroundColor: beforeEvent ? colors.cyan : colors.lime,
                  boxShadow: `0 0 10px ${beforeEvent ? colors.cyan : colors.lime}`,
                  zIndex: 2,
                }}
              />
            </Box>
          </Box>
        ))}

        {/* NOW label */}
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
            <Mono
              size={10}
              color={colors.ink}
              sx={{
                position: "absolute",
                top: "3px",
                left: markX,
                transform: "translateX(-50%)",
                backgroundColor: beforeEvent ? colors.cyan : colors.lime,
                px: "6px",
                py: "1px",
              }}
            >
              {beforeEvent ? `DOORS ${clock(t0)}` : `NOW ${clock(now)}`}
            </Mono>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

function TimelineBlock({
  lobby: l,
  state,
  now,
  left,
  width,
  futureFrom,
  selected,
  onSelect,
}: {
  lobby: LobbyView;
  state: LiveState;
  now: number;
  left: number;
  width: number;
  futureFrom: number | null;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const look = blockLook(l, state.votes, now);
  const people = lobbyPeople(l).map((pid) => personFor(state, pid));
  const [start] = lobbySpan(l, now);
  const label = look.label || clock(start);
  return (
    <ButtonBase
      onClick={() => onSelect(l.id)}
      aria-label={`${l.name}, ${look.label || "played"} ${clock(start)}`}
      aria-pressed={selected}
      sx={{
        position: "absolute",
        top: "14px",
        bottom: "8px",
        left,
        width: Math.max(width, 24),
        display: "block",
        textAlign: "left",
        overflow: "hidden",
        boxSizing: "border-box",
        border: `${l.status === "live" ? 2 : 1}px ${look.dashed ? "dashed" : "solid"} ${look.border}`,
        boxShadow: look.glow,
        backgroundColor: colors.surfaceSolid,
        backgroundImage: coverBackground(l.gameId, l.kind),
        backgroundSize: "cover",
        backgroundPosition: "center",
        outline: selected ? `2px solid ${colors.text}` : "none",
        outlineOffset: 1,
        opacity: l.virtual ? 0.85 : 1,
        "&.Mui-focusVisible": { outline: `2px solid ${colors.cyan}` },
      }}
    >
      <Box
        aria-hidden="true"
        sx={{ position: "absolute", inset: 0, background: "rgba(6,7,11,0.7)" }}
      />
      {futureFrom != null && futureFrom < width && (
        <Box
          aria-hidden="true"
          sx={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: Math.max(0, futureFrom),
            right: 0,
            background:
              "repeating-linear-gradient(135deg,rgba(6,7,11,0.55) 0 6px,rgba(6,7,11,0.25) 6px 12px)",
            borderLeft: "1px dashed rgba(238,243,255,0.5)",
          }}
        />
      )}
      <Box
        sx={{
          position: "relative",
          height: "100%",
          boxSizing: "border-box",
          p: "5px 8px",
          display: "flex",
          flexDirection: "column",
          gap: "2px",
          minWidth: 0,
        }}
      >
        <Mono
          size={9}
          color={look.color}
          spacing="0.1em"
          sx={{ overflow: "hidden", textOverflow: "ellipsis" }}
        >
          {label}
        </Mono>
        <Box
          component="span"
          sx={{
            fontWeight: 700,
            fontSize: 13,
            color: colors.text,
            textTransform: "uppercase",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {l.name}
        </Box>
        <Box
          sx={{
            display: "flex",
            gap: "4px",
            alignItems: "center",
            mt: "auto",
            minWidth: 0,
            overflow: "hidden",
          }}
        >
          <AvatarRow people={people} size={16} max={6} me={state.me} />
          <Mono size={9} color={colors.text2} weight={500}>
            {blockCount(l)}
          </Mono>
        </Box>
      </Box>
    </ButtonBase>
  );
}

export default LiveTimeline;
