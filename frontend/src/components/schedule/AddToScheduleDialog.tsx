import * as React from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import IconButton from "@mui/material/IconButton";
import NativeSelect from "@mui/material/NativeSelect";
import Typography from "@mui/material/Typography";
import BlockSharp from "@mui/icons-material/BlockSharp";
import ChevronRightSharp from "@mui/icons-material/ChevronRightSharp";
import CloseSharp from "@mui/icons-material/CloseSharp";
import EventAvailableSharp from "@mui/icons-material/EventAvailableSharp";
import EventBusySharp from "@mui/icons-material/EventBusySharp";
import HowToVoteSharp from "@mui/icons-material/HowToVoteSharp";
import ScheduleSharp from "@mui/icons-material/ScheduleSharp";
import SwapHorizSharp from "@mui/icons-material/SwapHorizSharp";
import moment from "moment";
import { GameSuggestion } from "../../types/game_suggestions";
import {
  Kicker,
  SearchField,
  Trophy,
  colors,
  fonts,
  hairline,
  tint,
} from "../hl";
import { ScheduleNote } from "../GameScheduleDetails";
import {
  DEFAULT_DURATION_HOURS,
  LAN_DAY_CUTOFF_HOUR,
  LanDay,
  MAX_ADD_DURATION_HOURS,
  SNAP_HOURS,
  Session,
  findClash,
  firstFreeStart,
  fmtClock,
  fmtDur,
  isOutsideWindow,
  outsideEventReason,
} from "./scheduleModel";

export interface AddRequest {
  gameId: number;
  name: string;
  /** Not suggested yet: suggest (records the vote) before scheduling. */
  isNew: boolean;
  day: number;
  st: number;
  dur: number;
}

interface SteamGame {
  appid: number;
  name: string;
}

export interface AddToScheduleDialogProps {
  open: boolean;
  onClose: () => void;
  days: LanDay[];
  sessions: Session[];
  timeBegin: moment.MomentInput;
  timeEnd: moment.MomentInput;
  /** Suggestions in vote order. */
  suggestions: GameSuggestion[];
  ranks: Map<number, number>;
  squadSize: number;
  eventTitle: string;
  /** Tapped slot on the timeline, if any. */
  prefill: { day: number; st: number } | null;
  /** Default day when nothing is pre-filled. */
  defaultDay?: number;
  token?: string;
  onConfirm: (req: AddRequest) => Promise<boolean>;
}

const coverUrl = (appid: number) =>
  `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`;

const START_OPTIONS = Array.from(
  { length: 48 },
  (_, i) => LAN_DAY_CUTOFF_HOUR + i * SNAP_HOURS,
);
const DURATION_OPTIONS = Array.from(
  { length: MAX_ADD_DURATION_HOURS / SNAP_HOURS },
  (_, i) => (i + 1) * SNAP_HOURS,
);

const listHeading = {
  m: 0,
  display: "flex",
  alignItems: "baseline",
  gap: 1.25,
  fontFamily: fonts.mono,
  fontSize: 11,
  fontWeight: 400,
  letterSpacing: "0.16em",
  color: colors.textDim,
} as const;

const emptyBox = (tone: "cyan" | "violet") => ({
  p: 1.5,
  border: `1px dashed ${tone === "cyan" ? tint("cyan", 0.2) : tint("violet", 0.3)}`,
  fontSize: 14,
  color: colors.textMuted,
});

function GameRow({
  appid,
  name,
  meta,
  rank,
  badge,
  suggested,
  onPick,
}: {
  appid: number;
  name: string;
  meta: string;
  rank?: number;
  badge?: React.ReactNode;
  suggested: boolean;
  onPick: () => void;
}) {
  return (
    <Box component="li" sx={{ listStyle: "none" }}>
      <Box
        component="button"
        type="button"
        onClick={onPick}
        sx={{
          width: "100%",
          minHeight: 56,
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          px: 1.5,
          py: 1.25,
          border: `1px solid ${suggested ? tint("cyan", 0.3) : tint("neutral", 0.14)}`,
          backgroundColor: suggested ? tint("cyan", 0.05) : "transparent",
          cursor: "pointer",
          textAlign: "left",
          color: colors.text,
          font: "inherit",
          "&:hover": {
            borderColor: colors.cyan,
            backgroundColor: tint("cyan", 0.1),
          },
          "&:focus-visible": {
            outline: `2px solid ${colors.cyan}`,
            outlineOffset: 2,
          },
        }}
      >
        <Box
          component="img"
          src={coverUrl(appid)}
          alt=""
          loading="lazy"
          sx={{
            width: 76,
            height: 35,
            flex: "none",
            objectFit: "cover",
            backgroundColor: colors.surface2,
            display: "block",
          }}
        />
        <Box
          component="span"
          sx={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: "3px",
          }}
        >
          <Box
            component="span"
            sx={{ display: "flex", alignItems: "center", gap: 1 }}
          >
            <Box
              component="span"
              sx={{
                fontSize: 15,
                fontWeight: 600,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {name}
            </Box>
            {rank && rank <= 3 && <TrophyBadge rank={rank} />}
          </Box>
          <Box component="span" sx={{ fontSize: 12, color: colors.textMuted }}>
            {meta}
          </Box>
        </Box>
        {badge}
        <ChevronRightSharp
          aria-hidden="true"
          sx={{ fontSize: 20, color: colors.textDim, flex: "none" }}
        />
      </Box>
    </Box>
  );
}

/** Bordered trophy tile used in lists and day cards. */
export function TrophyBadge({
  rank,
  size = 20,
}: {
  rank: number;
  size?: number;
}) {
  const color =
    rank === 1 ? colors.gold : rank === 2 ? colors.silver : colors.bronze;
  return (
    <Box
      component="span"
      title={`#${rank} most voted`}
      sx={{
        width: size,
        height: size,
        flex: "none",
        display: "grid",
        placeItems: "center",
        border: `1px solid ${color}`,
        backgroundColor: rank === 2 ? "rgba(201,211,230,0.10)" : `${color}1f`,
      }}
    >
      <Trophy rank={rank} size={Math.round(size * 0.65)} />
    </Box>
  );
}

const smallTag = (tone: "cyan" | "violet") => ({
  flex: "none",
  fontFamily: fonts.mono,
  fontSize: 10,
  letterSpacing: "0.12em",
  px: "6px",
  py: "2px",
  ...(tone === "cyan"
    ? { border: `1px solid ${tint("cyan", 0.4)}`, color: colors.cyan }
    : {
        border: `1px dashed ${colors.violetLight}`,
        color: colors.violetText,
      }),
});

const selectSx = {
  minHeight: 46,
  fontFamily: fonts.mono,
  fontSize: 15,
  border: `1px solid ${tint("cyan", 0.3)}`,
  backgroundColor: colors.surfaceSolid,
  "&::before, &::after": { display: "none" },
  "& select": { px: 1.25, py: 1.25 },
  "&.Mui-focused": { borderColor: colors.cyan },
} as const;

/**
 * Two-step "Add to schedule" dialog: pick a game (suggested ones first, then
 * any game from the server's Steam cache), then a day, start and length.
 */
export function AddToScheduleDialog({
  open,
  onClose,
  days,
  sessions,
  timeBegin,
  timeEnd,
  suggestions,
  ranks,
  squadSize,
  eventTitle,
  prefill,
  defaultDay = 0,
  token,
  onConfirm,
}: AddToScheduleDialogProps) {
  // The parent remounts the dialog (via `key`) each time it opens, so the
  // initial state below doubles as the reset.
  const [q, setQ] = React.useState("");
  const [picked, setPicked] = React.useState<{
    appid: number;
    name: string;
    isNew: boolean;
  } | null>(null);
  const [day, setDay] = React.useState(prefill ? prefill.day : defaultDay);
  const [st, setSt] = React.useState<number | null>(
    prefill ? prefill.st : null,
  );
  const [dur, setDur] = React.useState(DEFAULT_DURATION_HOURS);
  const [saving, setSaving] = React.useState(false);
  const [results, setResults] = React.useState<{
    query: string;
    ok: boolean;
    games: SteamGame[];
  }>({ query: "", ok: true, games: [] });
  const [cacheCount, setCacheCount] = React.useState<number | null>(null);
  const stepRef = React.useRef<HTMLHeadingElement>(null);
  const titleId = "add-to-schedule-title";

  // Size of the server's Steam cache, for the search prompt.
  React.useEffect(() => {
    if (!open || !token) return;
    const ctrl = new AbortController();
    fetch(`/api/steam-game-update-v2/stats?as_admin=true`, {
      signal: ctrl.signal,
      headers: { Accept: "application/json", Authorization: "Bearer " + token },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && typeof d.gamesCached === "number")
          setCacheCount(d.gamesCached);
      })
      .catch(() => undefined);
    return () => ctrl.abort();
  }, [open, token]);

  const query = q.trim().toLowerCase();
  const suggestedIds = React.useMemo(
    () => new Set(suggestions.map((g) => g.appid)),
    [suggestions],
  );

  // Debounced search of the Steam cache.
  React.useEffect(() => {
    if (!open || !query) return;
    const ctrl = new AbortController();
    const t = window.setTimeout(() => {
      fetch(`/api/steam-game?query=${encodeURIComponent(query)}`, {
        signal: ctrl.signal,
        headers: {
          Accept: "application/json",
          Authorization: "Bearer " + token,
        },
      })
        .then((r) => {
          if (!r.ok) throw new Error(String(r.status));
          return r.json() as Promise<SteamGame[]>;
        })
        .then((games) => setResults({ query, ok: true, games }))
        .catch((e) => {
          if ((e as Error).name !== "AbortError")
            setResults({ query, ok: false, games: [] });
        });
    }, 250);
    return () => {
      ctrl.abort();
      window.clearTimeout(t);
    };
  }, [open, query, token]);

  const steamState: "idle" | "loading" | "ready" | "error" = !query
    ? "idle"
    : results.query !== query
      ? "loading"
      : results.ok
        ? "ready"
        : "error";

  const sugList = suggestions.filter((g) =>
    g.name.toLowerCase().includes(query),
  );
  const catalog = (steamState === "ready" ? results.games : [])
    .filter((g) => !suggestedIds.has(g.appid))
    .slice(0, 8);

  const effectiveSt =
    st ?? firstFreeStart(sessions, days, day, dur, timeBegin, timeEnd);
  const effectiveDur = Math.min(dur, LAN_DAY_CUTOFF_HOUR + 24 - effectiveSt);
  const clash = picked
    ? findClash(sessions, days, day, effectiveSt, effectiveDur)
    : undefined;
  const outsideEvent = outsideEventReason(
    days,
    day,
    effectiveSt,
    effectiveDur,
    timeBegin,
    timeEnd,
  );
  const offWindow = isOutsideWindow(days[day], effectiveSt, effectiveDur);
  const canConfirm = !!picked && !clash && !outsideEvent && !saving;

  const pick = (appid: number, name: string, isNew: boolean) => {
    setPicked({ appid, name, isNew });
    window.setTimeout(() => stepRef.current?.focus(), 0);
  };

  const confirm = async () => {
    if (!picked || !canConfirm) return;
    setSaving(true);
    const ok = await onConfirm({
      gameId: picked.appid,
      name: picked.name,
      isNew: picked.isNew,
      day,
      st: effectiveSt,
      dur: effectiveDur,
    });
    setSaving(false);
    if (ok) onClose();
  };

  const scheduledCount = (appid: number) =>
    sessions.filter((s) => s.entry.gameId === appid).length;

  const firstDay = days[0];
  const lastDay = days[days.length - 1];

  return (
    <Dialog
      open={open}
      onClose={saving ? undefined : onClose}
      aria-labelledby={titleId}
      maxWidth={false}
      slotProps={{
        paper: {
          sx: {
            width: "min(580px, calc(100% - 32px))",
            maxHeight: "calc(100vh - 32px)",
            m: 2,
            display: "flex",
            flexDirection: "column",
          },
        },
      }}
    >
      <Box
        sx={{
          px: 2.5,
          py: 2,
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          borderBottom: `1px solid ${hairline.chrome}`,
        }}
      >
        <Box
          sx={{ flex: 1, display: "flex", flexDirection: "column", gap: 0.5 }}
        >
          <Kicker>ADD TO SCHEDULE</Kicker>
          <Typography
            id={titleId}
            component="h2"
            sx={{
              m: 0,
              fontSize: 24,
              fontWeight: 700,
              textTransform: "uppercase",
              lineHeight: 1,
            }}
          >
            {picked ? "Set the time" : "Pick a game"}
          </Typography>
        </Box>
        {prefill && !picked && days[prefill.day] && (
          <Box
            component="span"
            sx={{
              fontFamily: fonts.mono,
              fontSize: 11,
              letterSpacing: "0.12em",
              px: 1,
              py: 0.5,
              border: `1px solid ${colors.lime}`,
              color: colors.lime,
            }}
          >
            SLOT · {days[prefill.day].short} {fmtClock(prefill.st)}
          </Box>
        )}
        <IconButton
          onClick={onClose}
          disabled={saving}
          aria-label="Close"
          sx={{
            width: 44,
            height: 44,
            flex: "none",
            border: `1px solid ${hairline.control}`,
          }}
        >
          <CloseSharp />
        </IconButton>
      </Box>

      {!picked ? (
        <>
          <Box
            sx={{
              px: 2.5,
              py: 1.75,
              borderBottom: `1px solid ${tint("cyan", 0.1)}`,
            }}
          >
            <SearchField
              value={q}
              onChange={setQ}
              label="Search games"
              placeholder="Search suggested or any Steam game"
              autoFocus
              sx={{
                backgroundColor: "rgba(6,7,11,0.6)",
                borderColor: tint("cyan", 0.35),
              }}
            />
          </Box>
          <Box
            sx={{
              flex: 1,
              overflowY: "auto",
              px: 2.5,
              pt: 2,
              pb: 2.5,
              display: "flex",
              flexDirection: "column",
              gap: 1.25,
            }}
          >
            <Typography component="h3" sx={listHeading}>
              <span>SUGGESTED FOR THIS LAN</span>
              <Box component="span" sx={{ color: colors.cyan }}>
                {sugList.length}
              </Box>
            </Typography>
            {sugList.length ? (
              <Box
                component="ul"
                sx={{
                  m: 0,
                  p: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 1.25,
                }}
              >
                {sugList.map((g) => {
                  const n = scheduledCount(g.appid);
                  return (
                    <GameRow
                      key={g.appid}
                      appid={g.appid}
                      name={g.name}
                      rank={ranks.get(g.appid)}
                      suggested
                      meta={`${g.votes} vote${g.votes === 1 ? "" : "s"} · ${g.gamerOwned.length} of ${squadSize} own it`}
                      badge={
                        n > 0 ? (
                          <Box component="span" sx={smallTag("cyan")}>
                            {n > 1 ? `ON SCHEDULE ×${n}` : "ON SCHEDULE"}
                          </Box>
                        ) : undefined
                      }
                      onPick={() => pick(g.appid, g.name, false)}
                    />
                  );
                })}
              </Box>
            ) : (
              <Box sx={emptyBox("cyan")}>
                {suggestions.length
                  ? "No suggested games match."
                  : "Nothing has been suggested for this LAN yet."}
              </Box>
            )}
            <Box sx={{ height: 6 }} />
            <Typography component="h3" sx={listHeading}>
              <span>ANY STEAM GAME</span>
              <Box component="span" sx={{ color: colors.violetText }}>
                SUGGESTS + VOTES FOR YOU
              </Box>
            </Typography>
            <Box aria-live="polite" sx={{ display: "contents" }}>
              {!query ? (
                <Box sx={emptyBox("violet")}>
                  {cacheCount != null
                    ? `Type to search the ${cacheCount.toLocaleString("en-GB")} cached Steam games.`
                    : "Type to search the Steam game cache."}
                </Box>
              ) : steamState === "loading" ? (
                <Box
                  role="status"
                  sx={{
                    ...emptyBox("violet"),
                    display: "flex",
                    gap: 1.25,
                    alignItems: "center",
                  }}
                >
                  <CircularProgress size={16} aria-hidden="true" />
                  Searching the Steam cache…
                </Box>
              ) : steamState === "error" ? (
                <Box role="alert" sx={emptyBox("violet")}>
                  Couldn&apos;t search the Steam cache. Try again in a moment.
                </Box>
              ) : catalog.length ? (
                <Box
                  component="ul"
                  sx={{
                    m: 0,
                    p: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: 1.25,
                  }}
                >
                  {catalog.map((g) => (
                    <GameRow
                      key={g.appid}
                      appid={g.appid}
                      name={g.name}
                      suggested={false}
                      meta="Not suggested yet"
                      badge={
                        <Box component="span" sx={smallTag("violet")}>
                          NEW
                        </Box>
                      }
                      onPick={() => pick(g.appid, g.name, true)}
                    />
                  ))}
                </Box>
              ) : (
                <Box sx={emptyBox("violet")}>
                  No matches in the Steam cache.
                </Box>
              )}
            </Box>
          </Box>
        </>
      ) : (
        <Box
          sx={{
            flex: 1,
            overflowY: "auto",
            px: 2.5,
            pt: 2.25,
            pb: 2.5,
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.75 }}>
            <Box
              component="img"
              src={coverUrl(picked.appid)}
              alt=""
              sx={{
                width: 120,
                height: 56,
                flex: "none",
                objectFit: "cover",
                backgroundColor: colors.surface2,
                display: "block",
                border: `1px solid ${tint("cyan", 0.2)}`,
              }}
            />
            <Box
              sx={{
                flex: 1,
                minWidth: 0,
                display: "flex",
                flexDirection: "column",
                gap: 0.5,
              }}
            >
              <Typography
                component="h3"
                ref={stepRef}
                tabIndex={-1}
                sx={{
                  m: 0,
                  fontSize: 18,
                  fontWeight: 700,
                  outline: "none",
                  overflowWrap: "anywhere",
                }}
              >
                {picked.name}
              </Typography>
              <Button
                variant="text"
                size="small"
                startIcon={<SwapHorizSharp />}
                onClick={() => setPicked(null)}
                sx={{
                  alignSelf: "flex-start",
                  px: 0.5,
                  textTransform: "none",
                  letterSpacing: 0,
                  fontWeight: 500,
                }}
              >
                Change game
              </Button>
            </Box>
          </Box>
          {picked.isNew && (
            <ScheduleNote tone="violet" icon={<HowToVoteSharp />}>
              Not suggested yet. Adding it suggests it for {eventTitle}, adds
              your vote and pins it here.
            </ScheduleNote>
          )}
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
            <Box
              component="span"
              id="add-day-label"
              sx={{
                fontFamily: fonts.mono,
                fontSize: 10,
                letterSpacing: "0.16em",
                color: colors.textDim,
              }}
            >
              DAY
            </Box>
            <Box
              role="group"
              aria-labelledby="add-day-label"
              sx={{ display: "flex", border: `1px solid ${hairline.control}` }}
            >
              {days.map((d) => (
                <Button
                  key={d.index}
                  aria-pressed={day === d.index}
                  onClick={() => setDay(d.index)}
                  sx={{
                    flex: 1,
                    minWidth: 0,
                    minHeight: 44,
                    fontFamily: fonts.mono,
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: "0.12em",
                    ...(day === d.index
                      ? {
                          backgroundColor: colors.cyan,
                          color: colors.ink,
                          "&:hover": { backgroundColor: colors.cyan },
                        }
                      : {
                          color: colors.textMuted,
                          "&:hover": {
                            color: colors.text,
                            backgroundColor: tint("cyan", 0.06),
                          },
                        }),
                  }}
                >
                  {d.short}
                </Button>
              ))}
            </Box>
          </Box>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 1.25,
            }}
          >
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
              <Box
                component="label"
                htmlFor="add-start"
                sx={{
                  fontFamily: fonts.mono,
                  fontSize: 10,
                  letterSpacing: "0.16em",
                  color: colors.textDim,
                }}
              >
                START
              </Box>
              <NativeSelect
                id="add-start"
                value={String(effectiveSt)}
                onChange={(e) => setSt(parseFloat(e.target.value))}
                sx={selectSx}
              >
                {START_OPTIONS.map((h) => (
                  <option key={h} value={String(h)}>
                    {fmtClock(h)}
                    {h >= 24 ? " (next day)" : ""}
                  </option>
                ))}
              </NativeSelect>
            </Box>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
              <Box
                component="label"
                htmlFor="add-length"
                sx={{
                  fontFamily: fonts.mono,
                  fontSize: 10,
                  letterSpacing: "0.16em",
                  color: colors.textDim,
                }}
              >
                LENGTH
              </Box>
              <NativeSelect
                id="add-length"
                value={String(effectiveDur)}
                onChange={(e) => setDur(parseFloat(e.target.value))}
                sx={selectSx}
              >
                {DURATION_OPTIONS.map((h) => (
                  <option key={h} value={String(h)}>
                    {fmtDur(h)}
                  </option>
                ))}
              </NativeSelect>
            </Box>
          </Box>
          <Box
            aria-live="polite"
            sx={{
              fontFamily: fonts.mono,
              fontSize: 13,
              color: colors.textMuted,
            }}
          >
            {days[day]?.name.toUpperCase()} {fmtClock(effectiveSt)} →{" "}
            {fmtClock(effectiveSt + effectiveDur)} · {fmtDur(effectiveDur)}
          </Box>
          {outsideEvent ? (
            <ScheduleNote tone="pink" icon={<EventBusySharp />}>
              {outsideEvent === "before"
                ? `That starts before the event begins (${firstDay?.short} ${moment(timeBegin).format("HH:mm")}). Pick a later time.`
                : `That runs past the end of the event (${lastDay?.short} ${moment(timeEnd).format("HH:mm")}). Pick an earlier time or a shorter length.`}
            </ScheduleNote>
          ) : clash ? (
            <ScheduleNote tone="pink" icon={<BlockSharp />}>
              Clashes with {clash.entry.gameName} ({fmtClock(clash.st)}–
              {fmtClock(clash.st + clash.dur)}). Pick another time.
            </ScheduleNote>
          ) : offWindow ? (
            <ScheduleNote tone="amber" icon={<ScheduleSharp />}>
              Outside the auto-schedule window. That&apos;s fine, it just means
              fewer of the squad may be around.
            </ScheduleNote>
          ) : null}
          <Box
            sx={{
              display: "flex",
              gap: 1.25,
              justifyContent: "flex-end",
              flexWrap: "wrap",
            }}
          >
            <Button
              variant="outlined"
              color="inherit"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              startIcon={
                saving ? (
                  <CircularProgress size={16} color="inherit" />
                ) : (
                  <EventAvailableSharp />
                )
              }
              onClick={confirm}
              disabled={!canConfirm}
            >
              {saving
                ? "Saving…"
                : picked.isNew
                  ? "Suggest, vote & schedule"
                  : "Add to schedule"}
            </Button>
          </Box>
        </Box>
      )}
    </Dialog>
  );
}

export default AddToScheduleDialog;
