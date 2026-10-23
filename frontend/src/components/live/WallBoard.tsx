/**
 * The wall-board, `/live/:token` (README §4): no login, read-only, a fixed
 * 1920×1080 canvas scaled to fit the TV. What's on now, what's next, the
 * pink alert strip, admin posts marked for the TV, a 10-hour timeline and
 * the floor. Keeps the screen awake (Wake Lock) and can sleep overnight.
 */
import { HereStrip } from "./HereStrip";
import * as React from "react";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import Box from "@mui/material/Box";
import { UserAvatar } from "../hl/UserAvatar";
import { colors, fonts, tint } from "../hl/tokens";
import { useWallboard } from "../../live/useLive";
import { useServerNow, formatRemaining } from "../../live/clock";
import type { LiveState } from "../../live/store";
import type { LobbyView } from "../../live/types";
import {
  blockLook,
  checkedIn,
  clock,
  currentMembers,
  gameColor,
  lobbyPeople,
  lobbySpan,
  packLanes,
  personFor,
  runningLobbies,
  upNext,
  visibleLobbies,
} from "../../live/selectors";
import { coverBackground } from "./liveUi";
import { LiveFloor } from "./LiveFloor";

const W = 1920;
const H = 1080;
const HOUR = 3600_000;

/** Is `now` inside a `HH:MM-HH:MM` sleep window (local time)? */
export function asleep(
  window: string | null | undefined,
  now: number,
): boolean {
  if (!window) return false;
  const [from, to] = window.split("-").map((t) => {
    const [h, m] = t.trim().split(":").map(Number);
    return h * 60 + m;
  });
  if (!Number.isFinite(from) || !Number.isFinite(to)) return false;
  const d = new Date(now);
  const mins = d.getHours() * 60 + d.getMinutes();
  return from <= to ? mins >= from && mins < to : mins >= from || mins < to;
}

function useScale() {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () =>
      setScale(Math.min(window.innerWidth / W, window.innerHeight / H));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return scale;
}

/** Keep the TV awake while the page is visible. */
function useWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !("wakeLock" in navigator)) return undefined;
    let lock: { release: () => Promise<void> } | null = null;
    let cancelled = false;
    const request = async () => {
      try {
        const wl = (
          navigator as Navigator & {
            wakeLock: {
              request: (
                t: "screen",
              ) => Promise<{ release: () => Promise<void> }>;
            };
          }
        ).wakeLock;
        lock = await wl.request("screen");
        if (cancelled) void lock.release();
      } catch {
        // Not allowed (e.g. battery saver): the TV's own settings apply.
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void request();
    };
    void request();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release();
    };
  }, [enabled]);
}

function NowCard({
  state,
  lobby,
  now,
}: {
  state: LiveState;
  lobby: LobbyView;
  now: number;
}) {
  const c = gameColor(lobby);
  const inside = currentMembers(lobby);
  const cap =
    lobby.maxPlayers ?? lobby.teams?.reduce((n, t) => n + t.size, 0) ?? null;
  const [start] = lobbySpan(lobby, now);
  return (
    <Box
      sx={{
        position: "relative",
        flex: "1 1 0",
        minWidth: 0,
        border: `2px solid ${c}`,
        boxShadow: `0 0 40px -14px ${c}`,
        backgroundImage: coverBackground(lobby.gameId, lobby.kind),
        backgroundSize: "cover",
        backgroundPosition: "center",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(6,7,11,0.15) 0%, rgba(6,7,11,0.92) 75%)",
        }}
      />
      <Box
        sx={{
          position: "relative",
          p: "22px 26px",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
        }}
      >
        <Box
          sx={{
            fontFamily: fonts.mono,
            fontSize: 20,
            fontWeight: 700,
            color: c,
            letterSpacing: "0.12em",
          }}
        >
          {lobby.status === "grace"
            ? "STARTING"
            : lobby.status === "empty"
              ? "EMPTY"
              : "LIVE"}{" "}
          · SINCE {clock(start)}
        </Box>
        <Box
          sx={{
            fontSize: 34,
            fontWeight: 700,
            textTransform: "uppercase",
            color: "#fff",
            lineHeight: 1.05,
          }}
        >
          {lobby.name}
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {inside.slice(0, 8).map((m) => {
            const p = personFor(state, m.pid);
            return (
              <UserAvatar
                key={m.pid}
                name={p?.handle ?? "?"}
                src={p?.avatarUrl}
                size={44}
              />
            );
          })}
          <Box sx={{ flex: 1 }} />
          {cap != null && (
            <Box
              sx={{ fontFamily: fonts.mono, fontSize: 22, color: colors.text2 }}
            >
              {Math.max(0, cap - inside.length)} OPEN
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}

function TvTimeline({ state, now }: { state: LiveState; now: number }) {
  const t0 = Math.floor((now - 3 * HOUR) / HOUR) * HOUR;
  const t1 = t0 + 10 * HOUR;
  const width = 1340;
  const x = (t: number) =>
    ((Math.min(Math.max(t, t0), t1) - t0) / (t1 - t0)) * width;
  const lobbies = visibleLobbies(state).filter((l) => {
    const [s, e] = lobbySpan(l, now);
    return e > t0 && s < t1;
  });
  const lanes = packLanes(lobbies, null, now).slice(0, 4);
  const ticks: number[] = [];
  for (let t = t0; t <= t1; t += HOUR) ticks.push(t);
  return (
    <Box sx={{ position: "relative", width, height: "100%" }}>
      {ticks.map((t) => (
        <Box
          key={t}
          sx={{
            position: "absolute",
            top: 0,
            left: x(t),
            transform: t === t0 ? "none" : "translateX(-50%)",
            fontFamily: fonts.mono,
            fontSize: 20,
            color: colors.textDim,
          }}
        >
          {clock(t)}
        </Box>
      ))}
      {lanes.map((lane, i) => (
        <Box
          key={i}
          sx={{
            position: "absolute",
            top: 36 + i * 74,
            left: 0,
            width,
            height: 66,
            borderTop: `1px solid ${tint("cyan", 0.1)}`,
          }}
        >
          {lane.lobbies.map((l) => {
            const [s, e] = lobbySpan(l, now);
            const look = blockLook(l, state.votes, now);
            return (
              <Box
                key={l.id}
                sx={{
                  position: "absolute",
                  top: 6,
                  bottom: 4,
                  left: x(s),
                  width: Math.max(8, x(e) - x(s) - 4),
                  overflow: "hidden",
                  border: `2px ${look.dashed ? "dashed" : "solid"} ${look.border}`,
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
                <Box
                  sx={{
                    position: "relative",
                    px: "10px",
                    py: "4px",
                    fontSize: 20,
                    fontWeight: 700,
                    color: "#fff",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    textTransform: "uppercase",
                  }}
                >
                  {l.name}
                </Box>
              </Box>
            );
          })}
        </Box>
      ))}
      <Box
        sx={{
          position: "absolute",
          top: 30,
          bottom: 0,
          left: x(now),
          width: "3px",
          backgroundColor: colors.lime,
          boxShadow: `0 0 14px ${colors.lime}`,
        }}
      />
    </Box>
  );
}

export default function WallBoard() {
  const { token } = useParams();
  const { connection, state } = useWallboard(token ?? null);
  const now = useServerNow(state, 1000);
  const scale = useScale();
  const sleeping = asleep(state.event?.wallboardSleep, now);
  useWakeLock(!sleeping);

  // Asleep: drop the stream (nobody's watching), wake with the clock.
  useEffect(() => {
    if (!connection) return;
    if (sleeping) connection.stop();
    else connection.start();
  }, [connection, sleeping]);

  const frame = (children: React.ReactNode) => (
    <Box
      sx={{
        position: "fixed",
        inset: 0,
        backgroundColor: colors.bg,
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: W,
          height: H,
          transform: `translate(-50%, -50%) scale(${scale})`,
          transformOrigin: "center",
          color: colors.text,
          fontFamily: fonts.ui,
        }}
      >
        {children}
      </Box>
    </Box>
  );

  if (state.error === "notFound")
    return frame(
      <Box
        sx={{
          display: "grid",
          placeItems: "center",
          height: "100%",
          fontSize: 40,
        }}
      >
        This wall-board link is no longer valid.
      </Box>,
    );
  if (!state.loaded)
    return frame(
      <Box
        sx={{
          display: "grid",
          placeItems: "center",
          height: "100%",
          fontSize: 40,
          color: colors.textMuted,
        }}
      >
        Connecting…
      </Box>,
    );
  if (sleeping)
    return frame(
      <Box
        sx={{
          display: "grid",
          placeItems: "center",
          height: "100%",
          textAlign: "center",
        }}
      >
        <Box>
          <Box
            sx={{
              fontFamily: fonts.mono,
              fontSize: 120,
              fontWeight: 700,
              color: colors.textMuted,
            }}
          >
            {clock(now)}
          </Box>
          <Box
            sx={{
              fontFamily: fonts.mono,
              fontSize: 28,
              color: colors.textDim,
              letterSpacing: "0.2em",
            }}
          >
            SLEEPING · BACK AT {state.event?.wallboardSleep?.split("-")[1]}
          </Box>
        </Box>
      </Box>,
    );

  const running = runningLobbies(state);
  const inGame = new Set(
    running.flatMap((l) => currentMembers(l).map((m) => m.pid)),
  ).size;
  const here = checkedIn(state).length;
  const next = upNext(state, now, 3);
  const alert = visibleLobbies(state)
    .filter(
      (l) => (l.status === "waiting" || l.status === "grace") && l.graceUntil,
    )
    .sort(
      (a, b) => Date.parse(a.graceUntil ?? "") - Date.parse(b.graceUntil ?? ""),
    )[0];
  const post = [...state.feed]
    .reverse()
    .find(
      (r) =>
        r.kind === "toast.admin" &&
        r.payload?.tv &&
        (r.payload.ttl === "dismiss" || now - Date.parse(r.at) < 10 * 60_000),
    );

  return frame(
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        gap: "24px",
        p: "36px 44px",
        boxSizing: "border-box",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "baseline", gap: "32px" }}>
        <Box
          sx={{
            fontSize: 48,
            fontWeight: 700,
            textTransform: "uppercase",
            flex: 1,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {state.event?.title}
        </Box>
        <Box
          sx={{
            fontFamily: fonts.mono,
            fontSize: 26,
            color: colors.lime,
            letterSpacing: "0.12em",
          }}
        >
          {inGame} OF {here} IN GAME
        </Box>
        <Box sx={{ fontFamily: fonts.mono, fontSize: 52, fontWeight: 700 }}>
          {clock(now)}
        </Box>
      </Box>

      <HereStrip state={state} tv />

      {(alert || post) && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {alert && (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: "28px",
                p: "18px 28px",
                border: `3px solid ${colors.pink}`,
                backgroundColor: "#2a0a17",
                boxShadow: `0 0 50px -10px ${colors.pink}`,
              }}
            >
              <Box
                sx={{
                  fontFamily: fonts.mono,
                  fontSize: 22,
                  fontWeight: 700,
                  color: colors.ink,
                  backgroundColor: colors.pink,
                  px: "10px",
                  py: "2px",
                }}
              >
                {alert.status === "waiting"
                  ? "NOBODY'S IN YET"
                  : "STARTING · JOIN NOW"}
              </Box>
              <Box
                sx={{
                  flex: 1,
                  fontSize: 34,
                  fontWeight: 700,
                  textTransform: "uppercase",
                }}
              >
                {alert.name}
              </Box>
              <Box
                sx={{
                  fontFamily: fonts.mono,
                  fontSize: 64,
                  fontWeight: 700,
                  textShadow: `0 0 24px ${colors.pink}`,
                }}
              >
                {formatRemaining(alert.graceUntil ?? now, now)}
              </Box>
            </Box>
          )}
          {post && (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: "24px",
                p: "16px 28px",
                border: `3px solid ${colors.amber}`,
                backgroundColor: "#231904",
              }}
            >
              <Box
                sx={{
                  fontFamily: fonts.mono,
                  fontSize: 22,
                  fontWeight: 700,
                  color: colors.ink,
                  backgroundColor: colors.amber,
                  px: "10px",
                  py: "2px",
                }}
              >
                FROM THE ADMINS
              </Box>
              <Box sx={{ fontSize: 34, fontWeight: 700 }}>
                {post.payload.text}
              </Box>
            </Box>
          )}
        </Box>
      )}

      <Box sx={{ display: "flex", gap: "24px", height: 330, flex: "none" }}>
        <Box sx={{ flex: 1, minWidth: 0, display: "flex", gap: "20px" }}>
          {running.length === 0 ? (
            <Box
              sx={{
                flex: 1,
                display: "grid",
                placeItems: "center",
                border: `2px dashed ${tint("neutral", 0.3)}`,
                fontSize: 34,
                color: colors.textMuted,
              }}
            >
              Nothing running. What&apos;s next?
            </Box>
          ) : (
            running
              .slice(0, 3)
              .map((l) => (
                <NowCard key={l.id} state={state} lobby={l} now={now} />
              ))
          )}
        </Box>
        <Box
          sx={{
            width: 460,
            flex: "none",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          <Box
            sx={{
              fontFamily: fonts.mono,
              fontSize: 22,
              color: colors.cyan,
              letterSpacing: "0.16em",
            }}
          >
            NEXT
          </Box>
          {next.map((l) => (
            <Box
              key={l.id}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: "16px",
                p: "10px 14px",
                border: `1px solid ${tint("cyan", 0.25)}`,
              }}
            >
              <Box
                sx={{ fontFamily: fonts.mono, fontSize: 28, fontWeight: 700 }}
              >
                {clock(l.start)}
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box
                  sx={{
                    fontSize: 24,
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {l.name}
                </Box>
                <Box
                  sx={{
                    fontFamily: fonts.mono,
                    fontSize: 20,
                    color: blockLook(l, state.votes, now).color,
                  }}
                >
                  {blockLook(l, state.votes, now).label || "PLANNED"} ·{" "}
                  {lobbyPeople(l).length} IN
                </Box>
              </Box>
            </Box>
          ))}
          {next.length === 0 && (
            <Box sx={{ fontSize: 24, color: colors.textMuted }}>
              Nothing planned yet.
            </Box>
          )}
        </Box>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, display: "flex", gap: "24px" }}>
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            border: `1px solid ${tint("cyan", 0.16)}`,
            p: "16px",
            overflow: "hidden",
          }}
        >
          <TvTimeline state={state} now={now} />
        </Box>
        <Box
          sx={{
            width: 500,
            flex: "none",
            border: `1px solid ${tint("cyan", 0.16)}`,
            overflow: "hidden",
          }}
        >
          <LiveFloor state={state} tv />
        </Box>
      </Box>
    </Box>,
  );
}
