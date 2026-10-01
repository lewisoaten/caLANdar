import * as React from "react";
import { useContext } from "react";
import { useParams } from "react-router-dom";
import { useSnackbar, type SnackbarKey } from "notistack";
import moment from "moment";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Drawer from "@mui/material/Drawer";
import FormControlLabel from "@mui/material/FormControlLabel";
import Skeleton from "@mui/material/Skeleton";
import Switch from "@mui/material/Switch";
import AddSharp from "@mui/icons-material/AddSharp";
import AutorenewSharp from "@mui/icons-material/AutorenewSharp";
import ErrorOutlineSharp from "@mui/icons-material/ErrorOutlineSharp";
import EventBusySharp from "@mui/icons-material/EventBusySharp";
import { UserContext, UserDispatchContext } from "../UserProvider";
import { dateParser } from "../utils";
import { GameScheduleEntry } from "../types/game_schedule";
import GameScheduleDetails, { TimingControls } from "./GameScheduleDetails";
import { EmptyState, PageHeader, colors, tint, useIsMobile } from "./hl";
import { useScheduleData } from "./schedule/useScheduleData";
import ScheduleTimeline from "./schedule/ScheduleTimeline";
import ScheduleDayCards from "./schedule/ScheduleDayCards";
import AddToScheduleDialog, {
  AddRequest,
} from "./schedule/AddToScheduleDialog";
import {
  LAN_DAY_CUTOFF_HOUR,
  MIN_DURATION_HOURS,
  SCHEDULER_WINDOW_HINT,
  Session,
  buildLanDays,
  clockDay,
  dayIndexOf,
  dedupeSchedule,
  findClash,
  fmtClock,
  instantAt,
  outsideEventMessage,
  outsideEventReason,
  sessionKey,
  snap,
  spanShort,
  squadOf,
  toSessions,
  visibleRange,
  whenShort,
  withTimeZone,
} from "./schedule/scheduleModel";
import { rankByVotes, voteRankMap } from "../utils/voteRanking";

const DESCRIPTION =
  "Suggested slots are auto-planned where most of the squad is around, one session per game. Pinned sessions are placed by the host.";

const RECALC_HINT =
  "Re-plan every suggested slot from current votes and attendance. Pinned sessions stay put.";

type Variant = "default" | "success" | "error" | "warning" | "info";

/**
 * The drawer's +/− timing steppers update the shown time straight away and
 * save once the admin pauses for this long (trailing debounce), so mashing a
 * button sends one save and one toast.
 */
export const STEPPER_SAVE_DELAY_MS = 700;

/** Unsaved stepper changes for one session. */
interface TimingDraft {
  key: string;
  st: number;
  dur: number;
}

export default function EventGameSchedule() {
  const { id } = useParams<{ id: string }>();
  const { signOut } = useContext(UserDispatchContext);
  const userDetails = useContext(UserContext);
  const token = userDetails?.token;
  const isAdmin = userDetails?.isAdmin || false;
  const isMobile = useIsMobile();
  const { enqueueSnackbar, closeSnackbar } = useSnackbar();

  const data = useScheduleData(id, token, signOut);
  const {
    event,
    eventState,
    schedule,
    setSchedule,
    scheduleState,
    refreshSchedule,
    suggestions,
    refreshSuggestions,
    invitations,
    headers,
  } = data;

  const [showSuggestions, setShowSuggestions] = React.useState(true);
  const [selectedKey, setSelectedKey] = React.useState<string | null>(null);
  const [focusKey, setFocusKey] = React.useState<string | null>(null);
  const [addOpen, setAddOpen] = React.useState(false);
  // Bumped on every open so the dialog starts from a clean state.
  const [addNonce, setAddNonce] = React.useState(0);
  const [prefill, setPrefill] = React.useState<{
    day: number;
    st: number;
  } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [recalculating, setRecalculating] = React.useState(false);
  const busyRef = React.useRef(false);
  const toastKey = React.useRef<SnackbarKey | null>(null);

  // ---- derived model -----------------------------------------------------
  const days = React.useMemo(
    () => (event ? buildLanDays(event.timeBegin, event.timeEnd) : []),
    [event],
  );
  const allSessions = React.useMemo(
    () => toSessions(schedule, days),
    [schedule, days],
  );
  const sessions = React.useMemo(
    () => (showSuggestions ? allSessions : allSessions.filter((s) => s.pinned)),
    [allSessions, showSuggestions],
  );
  const range = React.useMemo(
    () => visibleRange(days, allSessions),
    [days, allSessions],
  );
  // Same ranking and trophies as the lobby (shared utils/voteRanking).
  const ranked = React.useMemo(
    () => rankByVotes(suggestions).map((r) => r.suggestion),
    [suggestions],
  );
  const ranks = React.useMemo(() => voteRankMap(suggestions), [suggestions]);
  const suggestionById = React.useMemo(
    () => new Map(suggestions.map((g) => [g.appid, g] as const)),
    [suggestions],
  );
  const squadSize = React.useMemo(
    () => squadOf(invitations).length,
    [invitations],
  );
  const selected = allSessions.find((s) => s.key === selectedKey);

  const defaultDay = React.useMemo(() => {
    if (!days.length) return 0;
    const now = moment();
    if (event && now.isAfter(event.timeBegin) && now.isBefore(event.timeEnd))
      return dayIndexOf(now, days);
    return Math.max(
      0,
      days.findIndex((d) => d.windows.length),
    );
  }, [days, event]);

  // ---- helpers -----------------------------------------------------------
  const say = React.useCallback(
    (message: string, variant: Variant = "default", undo?: () => void) => {
      if (toastKey.current != null) closeSnackbar(toastKey.current);
      toastKey.current = enqueueSnackbar(message, {
        variant,
        autoHideDuration: undo ? 7000 : 3800,
        action: undo
          ? (key) => (
              <Button
                variant="text"
                size="small"
                onClick={() => {
                  closeSnackbar(key);
                  undo();
                }}
                sx={{ color: colors.cyan }}
              >
                Undo
              </Button>
            )
          : undefined,
      });
    },
    [enqueueSnackbar, closeSnackbar],
  );

  /** fetch wrapper: signs out on 401 and returns null on network errors. */
  const send = React.useCallback(
    async (
      method: string,
      url: string,
      body?: unknown,
    ): Promise<Response | null> => {
      try {
        const response = await fetch(url, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        if (response.status === 401) {
          signOut();
          return null;
        }
        return response;
      } catch (error) {
        console.error(`Error calling ${method} ${url}:`, error);
        return null;
      }
    },
    [headers, signOut],
  );

  const readEntry = async (response: Response) =>
    JSON.parse(await response.text(), dateParser) as GameScheduleEntry;

  const timesOf = (day: number, st: number, dur: number) => {
    const start = instantAt(days[day], st);
    return {
      start,
      startTime: start.toISOString(),
      durationMinutes: Math.round(dur * 60),
    };
  };

  const spanLabel = (day: number, st: number, dur: number) =>
    spanShort(days[day], st, dur);

  const withBusy = async <T,>(fn: () => Promise<T>): Promise<T> => {
    busyRef.current = true;
    setBusy(true);
    try {
      return await fn();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  // ---- actions -----------------------------------------------------------

  /**
   * Move/resize a session. Pinned sessions are PATCHed; suggested ones are
   * pinned at the new time. Resolves to the session's key afterwards (null if
   * nothing was saved).
   */
  const place = React.useCallback(
    async (
      s: Session,
      day: number,
      rawSt: number,
      rawDur: number,
      verb: string,
    ): Promise<string | null> => {
      if (!isAdmin || !event || busyRef.current) return null;
      const st = snap(rawSt);
      const dur = Math.max(MIN_DURATION_HOURS, snap(rawDur));
      if (day === s.day && st === s.st && dur === s.dur) return s.key;
      const name = s.entry.gameName;
      const reason = outsideEventReason(
        days,
        day,
        st,
        dur,
        event.timeBegin,
        event.timeEnd,
      );
      const action = verb === "moved to" ? "move" : "resize";
      if (reason) {
        say(
          outsideEventMessage(
            reason,
            name,
            action,
            {
              start: instantAt(days[day] ?? days[0], st),
              end: instantAt(days[day] ?? days[0], st + dur),
            },
            event.timeBegin,
            event.timeEnd,
          ),
          "error",
        );
        return null;
      }
      const clash = findClash(allSessions, days, day, st, dur, s.key);
      if (clash) {
        say(
          `Clashes with ${clash.entry.gameName} (${fmtClock(clash.st)}–${fmtClock(
            clash.st + clash.dur,
          )}). Not moved.`,
          "error",
        );
        return null;
      }
      const { start, startTime, durationMinutes } = timesOf(day, st, dur);
      const wasPinned = s.pinned && s.entry.id > 0;
      const optimistic: GameScheduleEntry = {
        ...s.entry,
        startTime: start,
        durationMinutes,
        isPinned: true,
        isSuggested: false,
      };
      setSchedule((prev) => prev.map((e) => (e === s.entry ? optimistic : e)));

      return withBusy(async () => {
        const response = wasPinned
          ? await send(
              "PATCH",
              `/api/events/${event.id}/game_schedule/${s.entry.id}?as_admin=true`,
              { gameId: s.entry.gameId, startTime, durationMinutes },
            )
          : await send(
              "POST",
              `/api/events/${event.id}/game_schedule/pin?as_admin=true`,
              { gameId: s.entry.gameId, startTime, durationMinutes },
            );
        if (!response || !response.ok) {
          // Put the session back where it was straight away; the refresh
          // below then reconciles with whatever the server has.
          setSchedule((prev) =>
            prev.map((e) => (e === optimistic ? s.entry : e)),
          );
          const text = response ? await response.text() : "";
          if (response) console.error("Failed to update schedule:", text);
          say(
            text.toLowerCase().includes("overlap")
              ? `Cannot ${action} game: it would overlap with another scheduled game`
              : "Failed to update game schedule",
            "error",
          );
          await refreshSchedule({ background: true });
          return null;
        }
        const saved = await readEntry(response);
        const newKey = sessionKey({ ...saved, isPinned: true });
        setSchedule((prev) =>
          prev.map((e) =>
            e === optimistic ? { ...saved, isPinned: true } : e,
          ),
        );
        setSelectedKey((k) => (k === s.key ? newKey : k));
        if (newKey !== s.key) setFocusKey(newKey);
        say(
          `${name} ${verb} ${spanLabel(day, st, dur)}${wasPinned ? "" : " · now pinned"}`,
          "success",
        );
        void refreshSchedule({ background: true });
        return newKey;
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isAdmin, event, days, allSessions, send, say, refreshSchedule],
  );

  // ---- debounced timing steppers ----------------------------------------
  const [draft, setDraftState] = React.useState<TimingDraft | null>(null);
  const draftRef = React.useRef<TimingDraft | null>(null);
  const draftTimer = React.useRef<number | null>(null);
  const placeRef = React.useRef(place);
  const sessionsRef = React.useRef(allSessions);
  React.useLayoutEffect(() => {
    placeRef.current = place;
    sessionsRef.current = allSessions;
  });

  const setDraft = (next: TimingDraft | null) => {
    draftRef.current = next;
    setDraftState(next);
  };

  const cancelDraftTimer = () => {
    if (draftTimer.current != null) window.clearTimeout(draftTimer.current);
    draftTimer.current = null;
  };

  /**
   * Save the pending stepper change now (one PATCH/pin, one toast). Nothing
   * is sent when the draft matches the saved time. A refusal (clash, outside
   * the event) toasts once and the shown time falls back to the saved one.
   * Only reads refs, so it is stable across renders.
   */
  const flushDraft = React.useCallback(function flush(): void {
    if (draftTimer.current != null) window.clearTimeout(draftTimer.current);
    draftTimer.current = null;
    const d = draftRef.current;
    if (!d) return;
    if (busyRef.current) {
      // Another save is in flight; try again once it has had time to land.
      draftTimer.current = window.setTimeout(flush, STEPPER_SAVE_DELAY_MS);
      return;
    }
    const s = sessionsRef.current.find((x) => x.key === d.key);
    draftRef.current = null;
    setDraftState(null);
    if (!s || (d.st === s.st && d.dur === s.dur)) return;
    void placeRef.current(s, s.day, d.st, d.dur, "now runs");
  }, []);

  /** Nudge the selected session's start/length; saves after a pause. */
  const stepDraft = (s: Session, dSt: number, dDur: number) => {
    const cur =
      draftRef.current?.key === s.key
        ? draftRef.current
        : { key: s.key, st: s.st, dur: s.dur };
    setDraft({ key: s.key, st: cur.st + dSt, dur: cur.dur + dDur });
    cancelDraftTimer();
    draftTimer.current = window.setTimeout(flushDraft, STEPPER_SAVE_DELAY_MS);
  };

  // Switching to another session, or leaving the page, saves what's pending.
  React.useEffect(() => {
    if (draftRef.current && draftRef.current.key !== selectedKey) flushDraft();
  }, [selectedKey, flushDraft]);
  React.useEffect(() => flushDraft, [flushDraft]);

  /**
   * Pin / Unpin / Remove with a stepper change still pending: Remove drops
   * it (the session is going), Pin and Unpin save it first. A moved session
   * is pinned by the save itself, so Pin then has nothing left to do.
   */
  const footerAction = async (
    action: "pin" | "unpin" | "remove",
    s: Session,
  ) => {
    const d = draftRef.current;
    cancelDraftTimer();
    if (d && d.key === s.key) {
      setDraft(null);
      if (action !== "remove" && (d.st !== s.st || d.dur !== s.dur)) {
        await place(s, s.day, d.st, d.dur, "now runs");
        if (action === "pin") return;
      }
    }
    if (action === "pin") await pinInPlace(s);
    else await deletePinned(s, action);
  };

  const closeDetails = () => {
    flushDraft();
    setSelectedKey(null);
  };

  const recreate = React.useCallback(
    async (entry: GameScheduleEntry) => {
      if (!event) return;
      const response = await send(
        "POST",
        `/api/events/${event.id}/game_schedule?as_admin=true`,
        {
          gameId: entry.gameId,
          startTime: moment(entry.startTime).toISOString(),
          durationMinutes: entry.durationMinutes,
        },
      );
      if (!response || !response.ok) {
        say(`Couldn't put ${entry.gameName} back on the schedule`, "error");
      } else {
        say(`${entry.gameName} is back on the schedule`, "success");
      }
      void refreshSchedule({ background: true });
    },
    [event, send, say, refreshSchedule],
  );

  /** Delete a pinned session (Remove or Unpin); both can be undone. */
  const deletePinned = async (s: Session, mode: "remove" | "unpin") => {
    if (!isAdmin || !event || !s.entry.id) return;
    await withBusy(async () => {
      const response = await send(
        "DELETE",
        `/api/events/${event.id}/game_schedule/${s.entry.id}?as_admin=true`,
      );
      if (!response || !response.ok) {
        if (response)
          console.error("Failed to delete schedule:", await response.text());
        say(
          mode === "remove"
            ? "Failed to remove game from schedule"
            : "Failed to unpin game",
          "error",
        );
        return;
      }
      setSelectedKey(null);
      setSchedule((prev) => prev.filter((e) => e !== s.entry));
      say(
        mode === "remove"
          ? `${s.entry.gameName} removed from the schedule.`
          : `${s.entry.gameName} unpinned · back to auto-planning.`,
        "success",
        () => void recreate(s.entry),
      );
      void refreshSchedule({ background: true });
    });
  };

  const pinInPlace = async (s: Session) => {
    if (!isAdmin || !event) return;
    const clash = findClash(allSessions, days, s.day, s.st, s.dur, s.key);
    if (clash) {
      say(
        `Clashes with ${clash.entry.gameName} (${fmtClock(clash.st)}–${fmtClock(
          clash.st + clash.dur,
        )}). Not pinned.`,
        "error",
      );
      return;
    }
    await withBusy(async () => {
      const response = await send(
        "POST",
        `/api/events/${event.id}/game_schedule/pin?as_admin=true`,
        {
          gameId: s.entry.gameId,
          startTime: moment(s.entry.startTime).toISOString(),
          durationMinutes: s.entry.durationMinutes,
        },
      );
      if (!response || !response.ok) {
        if (response)
          console.error("Failed to pin game:", await response.text());
        say("Failed to pin game to schedule", "error");
        return;
      }
      const saved = await readEntry(response);
      const newKey = sessionKey({ ...saved, isPinned: true });
      setSchedule((prev) =>
        prev.map((e) => (e === s.entry ? { ...saved, isPinned: true } : e)),
      );
      setSelectedKey(newKey);
      say(
        `${s.entry.gameName} pinned to ${whenShort(days[s.day], s.st)}`,
        "success",
      );
      void refreshSchedule({ background: true });
    });
  };

  const recalculate = async () => {
    if (!isAdmin || !event) return;
    setRecalculating(true);
    try {
      const response = await send(
        "POST",
        withTimeZone(
          `/api/events/${event.id}/game_schedule/recalculate?as_admin=true`,
        ),
      );
      if (!response || !response.ok) {
        if (response)
          console.error(
            "Failed to recalculate schedule:",
            await response.text(),
          );
        say("Failed to recalculate suggested schedule", "error");
        return;
      }
      const planned = (await response.json()) as GameScheduleEntry[];
      await refreshSchedule({ background: true });
      const pinned = schedule.filter((e) => e.isPinned);
      const pinnedCount = pinned.length;
      // Count games, not raw entries: one session per game, and games that
      // are pinned are never suggested again (same rule as the timeline).
      const n = Array.isArray(planned)
        ? dedupeSchedule([...pinned, ...planned]).filter((e) => !e.isPinned)
            .length
        : 0;
      const kept = `Your ${pinnedCount} pinned session${pinnedCount === 1 ? " is" : "s are"} unchanged.`;
      // No Undo: suggested slots are never stored – the server re-plans them
      // from votes and attendance on every load – so there is nothing to
      // restore, and pinned sessions are never touched.
      say(
        n
          ? `Suggested ${n} game${n === 1 ? "" : "s"}, one session each, from the latest votes and attendance. ${kept}`
          : `No games left to suggest from the current votes and attendance. ${kept}`,
        "success",
      );
    } finally {
      setRecalculating(false);
    }
  };

  const addSession = async (req: AddRequest): Promise<boolean> => {
    if (!isAdmin || !event) return false;
    const { startTime, durationMinutes } = timesOf(req.day, req.st, req.dur);
    let suggestedOk = true;
    if (req.isNew) {
      const r = await send("POST", `/api/events/${event.id}/suggested_games`, {
        appid: req.gameId,
        comment: null,
      });
      suggestedOk = !!r && r.ok;
      if (r && !r.ok) console.error("Failed to suggest game:", await r.text());
    }
    const response = await send(
      "POST",
      `/api/events/${event.id}/game_schedule?as_admin=true`,
      { gameId: req.gameId, startTime, durationMinutes },
    );
    if (!response || !response.ok) {
      const text = response ? await response.text() : "";
      if (response) console.error("Failed to create schedule:", text);
      say(
        text.toLowerCase().includes("overlap")
          ? "Cannot add game: it would overlap with another scheduled game"
          : "Failed to add game to schedule",
        "error",
      );
      if (req.isNew && suggestedOk) void refreshSuggestions();
      return false;
    }
    const saved = await readEntry(response);
    setSchedule((prev) => [...prev, { ...saved, isPinned: true }]);
    void refreshSchedule({ background: true });
    if (req.isNew) void refreshSuggestions();
    const when = whenShort(days[req.day], req.st);
    if (req.isNew && !suggestedOk) {
      say(
        `${req.name} pinned to ${when}. It couldn't be suggested (you need to have RSVP'd to suggest games).`,
        "warning",
      );
    } else {
      say(
        req.isNew
          ? `${req.name} suggested, voted and pinned to ${when}.`
          : `${req.name} pinned to ${when}.`,
        "success",
      );
    }
    return true;
  };

  const openAdd = (pre: { day: number; st: number } | null) => {
    setSelectedKey(null);
    setPrefill(pre);
    setAddNonce((n) => n + 1);
    setAddOpen(true);
  };

  const hasClash = React.useCallback(
    (day: number, st: number, dur: number, key: string) =>
      !!findClash(allSessions, days, day, st, dur, key),
    [allSessions, days],
  );

  const clearFocus = React.useCallback(() => setFocusKey(null), []);

  // ---- render ------------------------------------------------------------

  if (eventState === "error") {
    return (
      <>
        <PageHeader kicker="RUN ORDER" title="Schedule" />
        <EmptyState
          variant="panel"
          icon={<ErrorOutlineSharp />}
          title="Couldn't load this event"
          description="Check your connection and try again."
          action={
            <Button variant="outlined" onClick={data.reloadEvent}>
              Retry
            </Button>
          }
        />
      </>
    );
  }

  if (!event) {
    return (
      <Box
        role="status"
        aria-label="Loading schedule"
        sx={{ display: "flex", flexDirection: "column", gap: 3 }}
      >
        <Skeleton variant="rectangular" height={120} />
        <Skeleton variant="rectangular" height={260} />
        <Skeleton variant="rectangular" height={180} />
      </Box>
    );
  }

  // What the drawer shows: the unsaved stepper draft, else the saved time.
  const shown =
    selected && draft?.key === selected.key
      ? { st: draft.st, dur: draft.dur }
      : selected
        ? { st: selected.st, dur: selected.dur }
        : undefined;

  const timing: TimingControls | undefined =
    selected && shown && isAdmin
      ? {
          days: days.map((d) => ({
            label: d.short,
            active: d.index === selected.day,
            onPick: () => {
              // A day pick saves straight away, carrying any pending times.
              cancelDraftTimer();
              setDraft(null);
              void place(selected, d.index, shown.st, shown.dur, "moved to");
            },
          })),
          start: fmtClock(shown.st),
          end: fmtClock(shown.st + shown.dur),
          pending: draft?.key === selected.key,
          onCommit: flushDraft,
          onStartEarlier:
            shown.st - 0.5 >= LAN_DAY_CUTOFF_HOUR
              ? () => stepDraft(selected, -0.5, 0.5)
              : undefined,
          onStartLater:
            shown.dur > MIN_DURATION_HOURS
              ? () => stepDraft(selected, 0.5, -0.5)
              : undefined,
          onEndEarlier:
            shown.dur > MIN_DURATION_HOURS
              ? () => stepDraft(selected, 0, -0.5)
              : undefined,
          onEndLater:
            shown.st + shown.dur < LAN_DAY_CUTOFF_HOUR + 24
              ? () => stepDraft(selected, 0, 0.5)
              : undefined,
        }
      : undefined;

  const selectedDay = selected ? days[selected.day] : undefined;
  const selectedClock =
    shown && selectedDay ? clockDay(selectedDay, shown.st) : undefined;
  // The entry as the drawer should show it while a stepper change is pending.
  const shownEntry =
    selected && shown && selectedDay && draft?.key === selected.key
      ? {
          ...selected.entry,
          startTime: instantAt(selectedDay, shown.st),
          durationMinutes: Math.round(shown.dur * 60),
        }
      : selected?.entry;
  const timelineOverlay =
    scheduleState === "loading" && !schedule.length ? (
      <Box role="status" aria-label="Loading schedule" sx={{ p: 2.5 }}>
        {days.map((d) => (
          <Skeleton
            key={d.index}
            variant="rectangular"
            height={42}
            sx={{ mb: 1.75 }}
          />
        ))}
      </Box>
    ) : scheduleState === "error" ? (
      <EmptyState
        icon={<ErrorOutlineSharp />}
        title="Couldn't load the schedule"
        description="The timeline will appear once it loads."
        action={
          <Button variant="outlined" onClick={() => void refreshSchedule()}>
            Retry
          </Button>
        }
      />
    ) : undefined;

  return (
    <>
      <PageHeader
        kicker="RUN ORDER"
        title="Schedule"
        description={
          <>
            {DESCRIPTION}
            <Box
              component="span"
              data-testid="schedule-window-hint"
              sx={{
                display: "block",
                mt: 0.75,
                pl: 1.25,
                borderLeft: `2px solid ${colors.lime}`,
                fontSize: 14,
              }}
            >
              {SCHEDULER_WINDOW_HINT}
            </Box>
          </>
        }
        actions={
          isAdmin ? (
            <>
              <Button
                variant="outlined"
                color="success"
                size="large"
                startIcon={<AutorenewSharp />}
                onClick={() => void recalculate()}
                disabled={recalculating}
                title={RECALC_HINT}
              >
                {recalculating ? "Recalculating…" : "Recalculate"}
              </Button>
              <Button
                variant="contained"
                size="large"
                startIcon={<AddSharp />}
                onClick={() => openAdd(null)}
              >
                Add to schedule
              </Button>
            </>
          ) : undefined
        }
      />

      <ScheduleTimeline
        days={days}
        sessions={sessions}
        range={range}
        isAdmin={isAdmin}
        ranks={ranks}
        hasClash={hasClash}
        onOpen={setSelectedKey}
        onPlace={place}
        onAddAt={(day, st) => openAdd({ day, st })}
        focusKey={focusKey}
        onFocused={clearFocus}
        overlay={timelineOverlay}
        legendExtra={
          <FormControlLabel
            control={
              <Switch
                checked={showSuggestions}
                onChange={(e) => setShowSuggestions(e.target.checked)}
              />
            }
            label="Show suggested"
            sx={{
              mr: 0,
              minHeight: 44,
              "& .MuiFormControlLabel-label": {
                fontSize: 13,
                color: colors.textMuted,
              },
            }}
          />
        }
      />

      {scheduleState !== "error" &&
        (scheduleState === "ready" && !sessions.length ? (
          <EmptyState
            variant="panel"
            icon={<EventBusySharp />}
            title="Nothing scheduled yet"
            description={
              isAdmin
                ? "Use Add to schedule, tap the timeline, or Recalculate to plan suggested games."
                : showSuggestions
                  ? "Games appear here once the squad has voted and the host has pinned sessions."
                  : "No pinned sessions yet. Turn on suggested slots to see the auto-plan."
            }
          />
        ) : (
          <ScheduleDayCards
            days={days}
            sessions={sessions}
            suggestions={suggestionById}
            ranks={ranks}
            squadSize={squadSize}
            onOpen={setSelectedKey}
          />
        ))}

      <Drawer
        anchor={isMobile ? "bottom" : "right"}
        open={!!selected}
        onClose={closeDetails}
        slotProps={{
          paper: {
            role: "dialog",
            "aria-modal": true,
            "aria-labelledby": "session-details-title",
            sx: isMobile
              ? {
                  maxHeight: "88vh",
                  borderTop: `1px solid ${tint("cyan", 0.35)}`,
                  display: "flex",
                  flexDirection: "column",
                }
              : {
                  width: "min(460px, 100%)",
                  height: "100%",
                  borderLeft: `1px solid ${tint("cyan", 0.35)}`,
                  display: "flex",
                  flexDirection: "column",
                },
          } as object,
        }}
      >
        {isMobile && (
          <Box
            aria-hidden="true"
            sx={{
              width: 44,
              height: 4,
              flex: "none",
              backgroundColor: tint("neutral", 0.35),
              mx: "auto",
              mt: 1.25,
            }}
          />
        )}
        {selected && selectedDay && shown && shownEntry && (
          <GameScheduleDetails
            scheduleEntry={shownEntry}
            suggestion={suggestionById.get(selected.entry.gameId)}
            invitations={invitations}
            eventStart={event.timeBegin.toISOString()}
            eventEnd={event.timeEnd.toISOString()}
            onClose={closeDetails}
            isAdmin={isAdmin}
            onPin={() => void footerAction("pin", selected)}
            onUnpin={() => void footerAction("unpin", selected)}
            onRemove={() => void footerAction("remove", selected)}
            rank={ranks.get(selected.entry.gameId)?.rank ?? null}
            trophyRank={ranks.get(selected.entry.gameId)?.trophyRank ?? null}
            whenLabel={`${selectedClock?.short} ${selectedClock?.dateLabel} · ${fmtClock(
              shown.st,
            )} → ${fmtClock(shown.st + shown.dur)}${
              selectedClock?.nextDay ? ` (${selectedDay.short} NIGHT)` : ""
            }`}
            timing={timing}
            busy={busy}
            titleId="session-details-title"
          />
        )}
      </Drawer>

      {isAdmin && (
        <AddToScheduleDialog
          key={addNonce}
          open={addOpen}
          onClose={() => setAddOpen(false)}
          days={days}
          sessions={allSessions}
          timeBegin={event.timeBegin}
          timeEnd={event.timeEnd}
          suggestions={ranked}
          ranks={ranks}
          squadSize={squadSize}
          eventTitle={event.title}
          prefill={prefill}
          defaultDay={defaultDay}
          token={token}
          onConfirm={addSession}
        />
      )}
    </>
  );
}
