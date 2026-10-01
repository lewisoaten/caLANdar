import * as React from "react";
import Box from "@mui/material/Box";
import BlockSharp from "@mui/icons-material/BlockSharp";
import EmojiEventsSharp from "@mui/icons-material/EmojiEventsSharp";
import { colors, fonts, hairline, srOnly, tint } from "../hl";
import { getTrophyColor } from "../../utils/trophyColors";
import {
  DragMode,
  LAN_DAY_CUTOFF_HOUR,
  LanDay,
  MIN_DURATION_HOURS,
  Session,
  VisibleRange,
  buildGridLines,
  buildTicks,
  dragPlacement,
  pct,
  placementLabel,
  spanLong,
} from "./scheduleModel";

/** Pointer travel (px) below which a press counts as a tap. */
export const TAP_THRESHOLD_PX = 5;

export interface ScheduleTimelineProps {
  days: LanDay[];
  sessions: Session[];
  range: VisibleRange;
  isAdmin: boolean;
  ranks: Map<number, number>;
  /** True when a placement would overlap another pinned session. */
  hasClash: (day: number, st: number, dur: number, key: string) => boolean;
  onOpen: (key: string) => void;
  /** Commit a move/resize; resolves to the session's (possibly new) key. */
  onPlace: (
    session: Session,
    day: number,
    st: number,
    dur: number,
    verb: string,
  ) => Promise<string | null>;
  /** Tap on empty space (admin): add a session there. */
  onAddAt: (day: number, st: number) => void;
  /** Key of a block that should take focus once rendered. */
  focusKey?: string | null;
  onFocused?: () => void;
  /** Extra controls on the right of the legend bar. */
  legendExtra?: React.ReactNode;
  /** Replaces the tracks (loading / error). */
  overlay?: React.ReactNode;
}

interface DragState {
  key: string;
  day: number;
  st: number;
  dur: number;
  clash: boolean;
}

interface DragRef {
  session: Session;
  mode: DragMode;
  x0: number;
  y0: number;
  moved: boolean;
}

const HINT_ID = "schedule-block-hint";

/** Session blocks are a full 44px touch target; tracks leave 4px around them. */
const BLOCK_HEIGHT = 44;
const TRACK_HEIGHT = BLOCK_HEIGHT + 8;

const blockBase = {
  position: "relative",
  height: BLOCK_HEIGHT,
  boxSizing: "border-box",
  display: "flex",
  alignItems: "center",
  gap: "5px",
  px: "9px",
  overflow: "hidden",
  whiteSpace: "nowrap",
  fontSize: 11,
  fontWeight: 600,
  touchAction: "none",
  userSelect: "none",
  outlineOffset: 2,
  "&:focus-visible": { outline: `2px solid ${colors.cyan}` },
} as const;

const variantSx = {
  pinned: {
    backgroundColor: colors.cyan,
    border: `1px solid ${colors.cyan}`,
    color: colors.ink,
    "&:hover": { backgroundColor: colors.text },
  },
  suggested: {
    backgroundColor: tint("violet", 0.22),
    border: `1px dashed ${colors.violetLight}`,
    color: "#e2d9ff",
    "&:hover": { backgroundColor: tint("violet", 0.38) },
  },
  drag: {
    fontWeight: 700,
    backgroundColor: colors.text,
    border: `1px solid ${colors.cyan}`,
    color: colors.ink,
    cursor: "grabbing",
    boxShadow: `0 0 0 2px ${colors.cyan}, 0 0 28px -2px ${tint("cyan", 0.9)}`,
    zIndex: 2,
  },
  clash: {
    fontWeight: 700,
    backgroundColor: tint("pink", 0.3),
    border: `1px solid ${colors.pink}`,
    color: "#ffd1e3",
    cursor: "not-allowed",
    boxShadow: `0 0 24px -2px ${tint("pink", 0.8)}`,
    zIndex: 2,
  },
} as const;

/** Tiny trophy tile shown inside a block for the top three games. */
function MiniTrophy({ rank }: { rank: number | undefined }) {
  const color = getTrophyColor(rank);
  if (!color) return null;
  return (
    <Box
      component="span"
      aria-hidden="true"
      sx={{
        width: 14,
        height: 14,
        flex: "none",
        display: "grid",
        placeItems: "center",
        backgroundColor: color,
        color: colors.ink,
      }}
    >
      <EmojiEventsSharp sx={{ fontSize: 11 }} />
    </Box>
  );
}

/**
 * One row per LAN day with the auto-schedule window in green and each session
 * as a block. Admins drag blocks (across rows too), resize them from either
 * edge, or use the keyboard; everything snaps to 30 minutes.
 */
export function ScheduleTimeline({
  days,
  sessions,
  range,
  isAdmin,
  ranks,
  hasClash,
  onOpen,
  onPlace,
  onAddAt,
  focusKey,
  onFocused,
  legendExtra,
  overlay,
}: ScheduleTimelineProps) {
  const tracks = React.useRef<Array<HTMLDivElement | null>>([]);
  const blocks = React.useRef(new Map<string, HTMLDivElement>());
  const dragRef = React.useRef<DragRef | null>(null);
  const dragStateRef = React.useRef<DragState | null>(null);
  const justDragged = React.useRef(false);
  const [drag, setDragState] = React.useState<DragState | null>(null);
  const setDrag = (d: DragState | null) => {
    dragStateRef.current = d;
    setDragState(d);
  };

  const ticks = React.useMemo(() => buildTicks(range), [range]);
  const lines = React.useMemo(() => buildGridLines(range), [range]);

  React.useEffect(() => {
    if (!focusKey) return;
    const el = blocks.current.get(focusKey);
    if (el) {
      el.focus();
      onFocused?.();
    }
  }, [focusKey, sessions, onFocused]);

  // Latest props for the window-level pointer handlers (which are created once).
  const latest = React.useRef({ range, hasClash, onPlace });
  React.useLayoutEffect(() => {
    latest.current = { range, hasClash, onPlace };
  });

  const handlers = React.useMemo(() => {
    const move = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = ev.clientX - d.x0;
      const dy = ev.clientY - d.y0;
      if (!d.moved && Math.hypot(dx, dy) < TAP_THRESHOLD_PX) return;
      d.moved = true;
      const track = tracks.current[d.session.day];
      if (!track) return;
      const r = latest.current.range;
      const width = track.getBoundingClientRect().width || 1;
      const dh = Math.round((dx / width) * r.span * 2) / 2;
      const next = dragPlacement(d.mode, d.session, dh, r);
      // Change row only while the pointer is over a track; in the gaps
      // between tracks keep the last row hit so the block doesn't jitter.
      let day = dragStateRef.current?.day ?? d.session.day;
      if (d.mode === "move") {
        const hit = tracks.current.findIndex((t) => {
          if (!t) return false;
          const b = t.getBoundingClientRect();
          return ev.clientY >= b.top && ev.clientY < b.bottom;
        });
        if (hit >= 0) day = hit;
      } else {
        day = d.session.day;
      }
      setDrag({
        key: d.session.key,
        day,
        st: next.st,
        dur: next.dur,
        clash: latest.current.hasClash(day, next.st, next.dur, d.session.key),
      });
    };
    const detach = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
    };
    const finish = (commit: boolean) => {
      detach();
      const d = dragRef.current;
      const g = dragStateRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!d || !d.moved || !g) return;
      justDragged.current = true;
      window.setTimeout(() => (justDragged.current = false), 50);
      const s = d.session;
      if (!commit || (g.day === s.day && g.st === s.st && g.dur === s.dur))
        return;
      // onPlace reports clashes itself and leaves the session where it was.
      void latest.current.onPlace(
        s,
        g.day,
        g.st,
        g.dur,
        d.mode === "move" ? "moved to" : "now runs",
      );
    };
    const up = () => finish(true);
    const cancel = () => finish(false);
    const attach = () => {
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", cancel);
    };
    return { attach, detach };
  }, []);

  React.useEffect(() => handlers.detach, [handlers]);

  const startDrag = (
    e: React.PointerEvent<HTMLElement>,
    session: Session,
    mode: DragMode,
  ) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.stopPropagation();
    if (!isAdmin) return;
    e.preventDefault();
    blocks.current.get(session.key)?.focus({ preventScroll: true });
    dragRef.current = {
      session,
      mode,
      x0: e.clientX,
      y0: e.clientY,
      moved: false,
    };
    handlers.attach();
  };

  const onKey = (e: React.KeyboardEvent, s: Session) => {
    const k = e.key;
    if (k === "Enter" || k === " ") {
      e.preventDefault();
      onOpen(s.key);
      return;
    }
    if (!isAdmin) return;
    const step = { ArrowLeft: -0.5, ArrowRight: 0.5 }[k];
    if (step != null) {
      e.preventDefault();
      if (e.shiftKey) {
        const dur = Math.max(MIN_DURATION_HOURS, s.dur + step);
        if (dur !== s.dur && s.st + dur <= LAN_DAY_CUTOFF_HOUR + 24)
          void onPlace(s, s.day, s.st, dur, "now runs");
      } else {
        const st = s.st + step;
        if (st >= LAN_DAY_CUTOFF_HOUR && st + s.dur <= LAN_DAY_CUTOFF_HOUR + 24)
          void onPlace(s, s.day, st, s.dur, "moved to");
      }
      return;
    }
    const dd = { ArrowUp: -1, ArrowDown: 1 }[k];
    if (dd != null) {
      e.preventDefault();
      if (days[s.day + dd])
        void onPlace(s, s.day + dd, s.st, s.dur, "moved to");
    }
  };

  const onTrackClick = (e: React.MouseEvent<HTMLDivElement>, day: number) => {
    if (!isAdmin || justDragged.current) return;
    const r = e.currentTarget.getBoundingClientRect();
    const st = Math.min(
      range.h1 - 1,
      range.h0 +
        Math.floor(((e.clientX - r.left) / (r.width || 1)) * range.span * 2) /
          2,
    );
    onAddAt(day, Math.max(range.h0, st));
  };

  const label = (h: number) => `${pct(h, range).toFixed(3)}%`;

  return (
    <Box
      component="section"
      aria-label="Timeline"
      sx={{
        border: `1px solid ${hairline.panel}`,
        backgroundColor: colors.surface,
      }}
    >
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "8px 18px",
          px: { xs: 2, md: 2.5 },
          py: 1.5,
          borderBottom: `1px solid ${tint("cyan", 0.1)}`,
          fontSize: 13,
          color: colors.textMuted,
        }}
      >
        <LegendItem swatch={{ backgroundColor: colors.cyan }} label="Pinned" />
        <LegendItem
          swatch={{
            border: `1px dashed ${colors.violetLight}`,
            backgroundColor: tint("violet", 0.15),
          }}
          label="Suggested"
        />
        <LegendItem
          swatch={{
            borderLeft: `1px solid ${colors.lime}`,
            borderRight: `1px solid ${colors.lime}`,
            backgroundColor: tint("lime", 0.12),
          }}
          label="Auto-schedule window"
        />
        {legendExtra && <Box sx={{ ml: "auto" }}>{legendExtra}</Box>}
      </Box>
      {overlay ?? (
        <Box
          sx={{ overflowX: "auto", px: { xs: 2, md: 2.5 }, pt: 3.75, pb: 2.25 }}
        >
          <Box
            sx={{
              minWidth: 640,
              display: "flex",
              flexDirection: "column",
              gap: "14px",
            }}
          >
            <Box
              aria-hidden="true"
              sx={{
                display: "grid",
                gridTemplateColumns: "48px 1fr",
                gap: "12px",
              }}
            >
              <span />
              <Box sx={{ position: "relative", height: 16 }}>
                {ticks.map((t) => (
                  <Box
                    key={t.h}
                    component="span"
                    sx={{
                      position: "absolute",
                      left: label(t.h),
                      top: 0,
                      transform:
                        t.align === "center"
                          ? "translateX(-50%)"
                          : t.align === "end"
                            ? "translateX(-100%)"
                            : "none",
                      fontFamily: fonts.mono,
                      fontSize: 10,
                      lineHeight: "16px",
                      color: colors.textMuted,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {t.label}
                  </Box>
                ))}
              </Box>
            </Box>
            {days.map((day) => {
              const rowSessions = sessions
                .map((s) =>
                  drag && drag.key === s.key
                    ? { ...s, day: drag.day, st: drag.st, dur: drag.dur }
                    : s,
                )
                .filter((s) => s.day === day.index);
              const dg = drag && drag.day === day.index ? drag : null;
              return (
                <Box
                  key={day.index}
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "48px 1fr",
                    gap: "12px",
                    alignItems: "center",
                  }}
                >
                  <Box
                    component="span"
                    title={`${day.name} ${day.dateLabel}`}
                    sx={{
                      fontFamily: fonts.mono,
                      fontSize: 12,
                      fontWeight: 700,
                      letterSpacing: "0.12em",
                    }}
                  >
                    {day.short}
                  </Box>
                  <Box
                    ref={(el: HTMLDivElement | null) => {
                      tracks.current[day.index] = el;
                    }}
                    data-testid={`timeline-track-${day.index}`}
                    onClick={(e) => onTrackClick(e, day.index)}
                    title={
                      isAdmin ? "Tap empty space to add a session here" : ""
                    }
                    sx={{
                      position: "relative",
                      height: TRACK_HEIGHT,
                      backgroundColor: tint("neutral", 0.04),
                      cursor: isAdmin ? "copy" : "default",
                    }}
                  >
                    {lines.map((l) => (
                      <Box
                        key={l.h}
                        aria-hidden="true"
                        sx={{
                          position: "absolute",
                          top: 0,
                          bottom: 0,
                          left: label(l.h),
                          width: "1px",
                          backgroundColor: l.major
                            ? tint("cyan", 0.12)
                            : tint("cyan", 0.035),
                          pointerEvents: "none",
                        }}
                      />
                    ))}
                    {day.windows.map(([w0, w1]) => (
                      <Box
                        key={`${w0}-${w1}`}
                        aria-hidden="true"
                        sx={{
                          position: "absolute",
                          top: 0,
                          bottom: 0,
                          left: label(w0),
                          width: `${(((w1 - w0) / range.span) * 100).toFixed(3)}%`,
                          backgroundColor: tint("lime", 0.07),
                          borderLeft: `1px solid ${tint("lime", 0.6)}`,
                          borderRight: `1px solid ${tint("lime", 0.6)}`,
                          boxSizing: "border-box",
                          pointerEvents: "none",
                        }}
                      />
                    ))}
                    {rowSessions.map((s) => {
                      const rank = ranks.get(s.entry.gameId);
                      const isDrag = drag?.key === s.key;
                      const v = isDrag
                        ? drag.clash
                          ? "clash"
                          : "drag"
                        : s.pinned
                          ? "pinned"
                          : "suggested";
                      const name = s.entry.gameName;
                      const aria = `${name}, ${spanLong(day, s.st, s.dur)}, ${s.pinned ? "pinned" : "suggested"}${
                        rank && rank <= 3 ? `, number ${rank} most voted` : ""
                      }`;
                      return (
                        <Box
                          key={s.key}
                          ref={(el: HTMLDivElement | null) => {
                            if (el) blocks.current.set(s.key, el);
                            else blocks.current.delete(s.key);
                          }}
                          role="button"
                          tabIndex={0}
                          aria-label={aria}
                          aria-describedby={HINT_ID}
                          title={name}
                          data-session={s.key}
                          onClick={(e: React.MouseEvent) => {
                            e.stopPropagation();
                            if (justDragged.current) return;
                            onOpen(s.key);
                          }}
                          onKeyDown={(e: React.KeyboardEvent) => onKey(e, s)}
                          onPointerDown={(e: React.PointerEvent<HTMLElement>) =>
                            startDrag(e, s, "move")
                          }
                          sx={{
                            ...blockBase,
                            ...variantSx[v],
                            position: "absolute",
                            top: 4,
                            left: label(s.st),
                            width: `${((s.dur / range.span) * 100).toFixed(3)}%`,
                            cursor:
                              v === "clash"
                                ? "not-allowed"
                                : isAdmin
                                  ? isDrag
                                    ? "grabbing"
                                    : "grab"
                                  : "pointer",
                          }}
                        >
                          {v === "clash" && (
                            <BlockSharp
                              aria-hidden="true"
                              sx={{ fontSize: 14, flex: "none" }}
                            />
                          )}
                          {!isDrag && <MiniTrophy rank={rank} />}
                          <Box
                            component="span"
                            sx={{
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {name}
                          </Box>
                          {isAdmin && !isDrag && (
                            <>
                              <ResizeHandle
                                side="left"
                                suggested={!s.pinned}
                                onPointerDown={(e) => startDrag(e, s, "start")}
                              />
                              <ResizeHandle
                                side="right"
                                suggested={!s.pinned}
                                onPointerDown={(e) => startDrag(e, s, "end")}
                              />
                            </>
                          )}
                        </Box>
                      );
                    })}
                    {dg && (
                      <Box
                        aria-hidden="true"
                        sx={{
                          position: "absolute",
                          top: -26,
                          left: label(dg.st),
                          transform:
                            pct(dg.st, range) > 70
                              ? "translateX(-60%)"
                              : "none",
                          height: 20,
                          display: "inline-flex",
                          alignItems: "center",
                          px: 1,
                          backgroundColor: colors.bg,
                          border: `1px solid ${dg.clash ? colors.pink : colors.cyan}`,
                          color: dg.clash ? colors.pinkText : colors.cyan,
                          fontFamily: fonts.mono,
                          fontSize: 11,
                          fontWeight: 700,
                          whiteSpace: "nowrap",
                          zIndex: 3,
                          pointerEvents: "none",
                        }}
                      >
                        {placementLabel(day, dg.st, dg.dur)}
                        {dg.clash ? " · CLASH" : ""}
                      </Box>
                    )}
                  </Box>
                </Box>
              );
            })}
          </Box>
        </Box>
      )}
      <Box id={HINT_ID} sx={srOnly}>
        {isAdmin
          ? "Enter opens details. Arrow keys move 30 minutes, Shift plus arrows change the length, Up and Down change the day."
          : "Enter opens details."}
      </Box>
    </Box>
  );
}

function LegendItem({
  swatch,
  label,
}: {
  swatch: Record<string, string>;
  label: string;
}) {
  return (
    <Box
      component="span"
      sx={{ display: "flex", alignItems: "center", gap: 1 }}
    >
      <Box
        component="span"
        aria-hidden="true"
        sx={{ width: 14, height: 14, boxSizing: "border-box", ...swatch }}
      />
      {label}
    </Box>
  );
}

function ResizeHandle({
  side,
  suggested,
  onPointerDown,
}: {
  side: "left" | "right";
  suggested: boolean;
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
}) {
  return (
    <Box
      component="span"
      aria-hidden="true"
      data-handle={side}
      onPointerDown={onPointerDown}
      sx={{
        position: "absolute",
        top: 0,
        bottom: 0,
        [side]: 0,
        width: 7,
        cursor: "ew-resize",
        backgroundColor: suggested ? tint("violet", 0.3) : "rgba(6,7,11,0.22)",
      }}
    />
  );
}

export default ScheduleTimeline;
