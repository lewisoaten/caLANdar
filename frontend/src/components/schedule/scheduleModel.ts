/**
 * Pure model for the HyperLAN schedule timeline.
 *
 * Times on the timeline are expressed as *hours past local midnight* of a
 * "LAN day". A LAN day runs from 06:00 to 06:00 the next morning (the same
 * convention as the attendance grid), so a session at 00:30 on Saturday sits
 * at hour 24.5 of Friday's row instead of opening a new row. Everything here
 * is free of React so it can be unit tested directly.
 */
import moment from "moment";
import { GameScheduleEntry } from "../../types/game_schedule";
import { Gamer } from "../../types/game_suggestions";
import { InvitationLiteData, RSVP } from "../../types/invitations";
import { getAttendanceBuckets } from "../../utils/attendanceBuckets";

/** Hour (local) at which one LAN day hands over to the next. */
export const LAN_DAY_CUTOFF_HOUR = 6;
/** Snapping step for every move / resize, in hours. */
export const SNAP_HOURS = 0.5;
/** Shortest allowed session, in hours. */
export const MIN_DURATION_HOURS = 0.5;
/** Longest length offered by the add dialog, in hours. */
export const MAX_ADD_DURATION_HOURS = 8;
/** Default length of a new session, in hours (the existing 120 minutes). */
export const DEFAULT_DURATION_HOURS = 2;

/**
 * The backend scheduler (`api/src/scheduler.rs`) never has a game in progress
 * between `NIGHT_START_HOUR` (01:00) and `DAY_START_HOUR` (10:00) **local wall
 * clock**: a session may end at exactly 01:00 and start at exactly 10:00. The
 * UI sends the browser's zone as `?tz=` (see `browserTimeZone`), so the
 * window is the same wall-clock 10:00 → 01:00 every day for both, even across
 * a DST change (that day's window is then 24 ± 1h long). It only plans inside
 * the event, so each day's window is [10:00, 01:00 next day] (local)
 * intersected with the event. Keep these in sync with `scheduler.rs`.
 */
export const SCHEDULER_DAY_START_HOUR = 10;
export const SCHEDULER_NIGHT_START_HOUR = 1;
/** Window on a LAN-day row, in hours past the row's local midnight. */
export const SCHEDULER_WINDOW_START = SCHEDULER_DAY_START_HOUR;
export const SCHEDULER_WINDOW_END = 24 + SCHEDULER_NIGHT_START_HOUR;

/** `10:00 – 01:00`: the window as people read it. */
export const SCHEDULER_WINDOW_LABEL = `${String(SCHEDULER_DAY_START_HOUR).padStart(2, "0")}:00 – ${String(
  SCHEDULER_NIGHT_START_HOUR,
).padStart(2, "0")}:00`;

/** One-line explanation of the window, shown in the header and legend. */
export const SCHEDULER_WINDOW_HINT = `Auto-schedule window: ${SCHEDULER_WINDOW_LABEL} each day (your local time). Suggested sessions are planned inside it; pinned sessions can go any time.`;

/**
 * The browser's IANA zone (e.g. `Europe/London`), sent to the scheduler so
 * its window matches the one drawn here. Undefined when the browser can't say
 * (the API then defaults to Europe/London).
 */
export const browserTimeZone = (): string | undefined => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
};

/** `url` with the browser's zone added as `tz` (when known). */
export const withTimeZone = (url: string, tz = browserTimeZone()): string =>
  tz
    ? `${url}${url.includes("?") ? "&" : "?"}tz=${encodeURIComponent(tz)}`
    : url;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export interface LanDay {
  index: number;
  /** Local midnight of the calendar day this LAN day starts on. */
  date: moment.Moment;
  /** `FRI` */
  short: string;
  /** `Friday` */
  name: string;
  /** `13 NOV` */
  dateLabel: string;
  /** Auto-schedule window segments on this row, as [startHour, endHour]. */
  windows: Array<[number, number]>;
}

export interface Session {
  /** Stable React key: `p<id>` for pinned, `s<gameId>@<start ms>` for suggested. */
  key: string;
  entry: GameScheduleEntry;
  day: number;
  /** Start, in hours past the LAN day's local midnight (6 <= st < 30). */
  st: number;
  /** Length in hours. */
  dur: number;
  pinned: boolean;
}

export interface VisibleRange {
  h0: number;
  h1: number;
  span: number;
}

/** Key for a schedule entry (suggested entries have no id yet). */
export const sessionKey = (entry: GameScheduleEntry): string =>
  entry.isPinned && entry.id
    ? `p${entry.id}`
    : `s${entry.gameId}@${moment(entry.startTime).valueOf()}`;

/** Whole days between two local midnights (DST-safe). */
const dayDiff = (a: moment.Moment, b: moment.Moment) =>
  Math.round(
    (a.clone().startOf("day").valueOf() - b.clone().startOf("day").valueOf()) /
      DAY_MS,
  );

/** Local midnight of the LAN day an instant belongs to. */
export const lanDayDate = (t: moment.MomentInput): moment.Moment =>
  moment(t).local().subtract(LAN_DAY_CUTOFF_HOUR, "hours").startOf("day");

/** Hours past `day`'s local midnight, by wall clock (so DST days still line up). */
export const hoursInDay = (t: moment.MomentInput, day: LanDay): number => {
  const m = moment(t).local();
  return (
    dayDiff(m, day.date) * 24 +
    m.hours() +
    m.minutes() / 60 +
    m.seconds() / 3600
  );
};

/** The instant at `h` hours past `day`'s local midnight. */
export const instantAt = (day: LanDay, h: number): moment.Moment => {
  const whole = Math.floor(h);
  const minutes = Math.round((h - whole) * 60);
  return day.date
    .clone()
    .add(Math.floor(whole / 24), "days")
    .hours(((whole % 24) + 24) % 24)
    .minutes(minutes)
    .seconds(0)
    .milliseconds(0);
};

/**
 * `hour`:00 local wall time on the calendar day of `date` (overflowing into the
 * next day for `hour` >= 24). Built with `new Date(y, m, d, h)` semantics, the
 * same DST resolution the backend's `local_instant` uses: an hour that happens
 * twice resolves to the earlier one, a skipped hour lands just after the jump.
 */
const localHour = (date: moment.Moment, hour: number): number =>
  new Date(date.year(), date.month(), date.date(), hour, 0, 0, 0).valueOf();

/**
 * Absolute auto-schedule windows (ms since epoch) for an event: 10:00 → 01:00
 * next day, local wall clock, for every local day the event touches, clipped
 * to the event.
 */
export const autoScheduleWindows = (
  timeBegin: moment.MomentInput,
  timeEnd: moment.MomentInput,
): Array<[number, number]> => {
  const begin = moment(timeBegin).valueOf();
  const end = moment(timeEnd).valueOf();
  if (!(end > begin)) return [];
  const out: Array<[number, number]> = [];
  const last = moment(end).local().startOf("day");
  // Start a day early: the previous evening's window can run past midnight.
  for (
    let d = moment(begin).local().startOf("day").subtract(1, "day");
    !d.isAfter(last);
    d = d.clone().add(1, "day")
  ) {
    const s = Math.max(begin, localHour(d, SCHEDULER_WINDOW_START));
    const e = Math.min(end, localHour(d, SCHEDULER_WINDOW_END));
    if (e > s) out.push([s, e]);
  }
  return out;
};

/**
 * One entry per game, as the scheduler intends: a game that has a pinned
 * session gets no suggested one, and a game suggested twice keeps only its
 * earliest suggestion. Pinned entries are always kept. A defensive guard in
 * case the API ever returns duplicates.
 */
export const dedupeSchedule = (
  entries: GameScheduleEntry[],
): GameScheduleEntry[] => {
  const pinnedGames = new Set(
    entries.filter((e) => e.isPinned).map((e) => e.gameId),
  );
  const firstSuggested = new Map<number, GameScheduleEntry>();
  for (const e of entries) {
    if (e.isPinned || pinnedGames.has(e.gameId)) continue;
    const prev = firstSuggested.get(e.gameId);
    if (
      !prev ||
      moment(e.startTime).valueOf() < moment(prev.startTime).valueOf()
    )
      firstSuggested.set(e.gameId, e);
  }
  return entries.filter(
    (e) => e.isPinned || firstSuggested.get(e.gameId) === e,
  );
};

/** One LAN day per row, from the event's first to its last day. */
export const buildLanDays = (
  timeBegin: moment.MomentInput,
  timeEnd: moment.MomentInput,
): LanDay[] => {
  const first = lanDayDate(timeBegin);
  const endMs = Math.max(
    moment(timeBegin).valueOf(),
    moment(timeEnd).valueOf() - 1,
  );
  const last = lanDayDate(endMs);
  const count = Math.max(1, Math.min(31, dayDiff(last, first) + 1));
  const windows = autoScheduleWindows(timeBegin, timeEnd);
  const days: LanDay[] = [];
  for (let i = 0; i < count; i++) {
    const date = first.clone().add(i, "days");
    const day: LanDay = {
      index: i,
      date,
      short: date.format("ddd").toUpperCase(),
      name: date.format("dddd"),
      dateLabel: date.format("D MMM").toUpperCase(),
      windows: [],
    };
    const rowStart = instantAt(day, LAN_DAY_CUTOFF_HOUR).valueOf();
    const rowEnd = instantAt(day, LAN_DAY_CUTOFF_HOUR + 24).valueOf();
    for (const [ws, we] of windows) {
      const s = Math.max(ws, rowStart);
      const e = Math.min(we, rowEnd);
      if (e > s) day.windows.push([hoursInDay(s, day), hoursInDay(e, day)]);
    }
    days.push(day);
  }
  return days;
};

/** Index of the LAN day an instant falls on (clamped to the event's days). */
export const dayIndexOf = (t: moment.MomentInput, days: LanDay[]): number => {
  if (!days.length) return 0;
  const i = dayDiff(lanDayDate(t), days[0].date);
  return Math.max(0, Math.min(days.length - 1, i));
};

/** Schedule entries placed on the timeline grid (see `dedupeSchedule`). */
export const toSessions = (
  entries: GameScheduleEntry[],
  days: LanDay[],
): Session[] =>
  dedupeSchedule(entries)
    .map((entry) => {
      const day = dayIndexOf(entry.startTime, days);
      return {
        key: sessionKey(entry),
        entry,
        day,
        st: days.length ? hoursInDay(entry.startTime, days[day]) : 0,
        dur: entry.durationMinutes / 60,
        pinned: entry.isPinned,
      };
    })
    .sort((a, b) => a.day - b.day || a.st - b.st);

/**
 * Visible hours: the union of the auto-schedule windows, widened to whole
 * hours so any session outside them still shows.
 */
export const visibleRange = (
  days: LanDay[],
  sessions: Session[],
): VisibleRange => {
  const starts = [
    ...days.flatMap((d) => d.windows.map((w) => w[0])),
    ...sessions.map((s) => s.st),
  ];
  const ends = [
    ...days.flatMap((d) => d.windows.map((w) => w[1])),
    ...sessions.map((s) => s.st + s.dur),
  ];
  if (!starts.length) return { h0: 8, h1: 24, span: 16 };
  let h0 = Math.floor(Math.min(...starts));
  let h1 = Math.ceil(Math.max(...ends));
  if (h1 - h0 < 2) h1 = h0 + 2;
  h0 = Math.max(LAN_DAY_CUTOFF_HOUR, h0);
  h1 = Math.min(LAN_DAY_CUTOFF_HOUR + 24, Math.max(h1, h0 + 1));
  return { h0, h1, span: h1 - h0 };
};

/** Percentage (0-100) of `h` across the range. */
export const pct = (h: number, r: VisibleRange) => ((h - r.h0) / r.span) * 100;

/** `18:30` (hours >= 24 wrap to the next morning). */
export const fmtClock = (h: number): string => {
  const total = Math.round(h * 60);
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
};

/** `2h`, `2h 30m`, `30m`. */
export const fmtDur = (h: number): string => {
  const total = Math.round(h * 60);
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  if (!hh) return `${mm}m`;
  return mm ? `${hh}h ${mm}m` : `${hh}h`;
};

export interface Tick {
  h: number;
  label: string;
  align: "start" | "center" | "end";
}

/** Hour labels: every 2h (every 1h when the span is 12h or less). */
export const buildTicks = (r: VisibleRange): Tick[] => {
  const step = r.span > 12 ? 2 : 1;
  const ticks: Tick[] = [];
  for (let h = r.h0; h <= r.h1; h += step) {
    ticks.push({
      h,
      label: h === 24 && h === r.h1 ? "24:00" : fmtClock(h),
      align: h === r.h0 ? "start" : h === r.h1 ? "end" : "center",
    });
  }
  return ticks;
};

/** Gridlines every 30 minutes; `major` on each labelled hour. */
export const buildGridLines = (
  r: VisibleRange,
): Array<{ h: number; major: boolean }> => {
  const step = r.span > 12 ? 2 : 1;
  const lines: Array<{ h: number; major: boolean }> = [];
  for (let h = r.h0 + SNAP_HOURS; h < r.h1; h += SNAP_HOURS) {
    lines.push({ h, major: (h - r.h0) % step === 0 });
  }
  return lines;
};

export const snap = (h: number) => Math.round(h / SNAP_HOURS) * SNAP_HOURS;

/** Absolute [start, end) of a placement, in ms. */
export const placementSpan = (
  days: LanDay[],
  day: number,
  st: number,
  dur: number,
): [number, number] => {
  const start = instantAt(days[day], st).valueOf();
  return [start, start + Math.round(dur * 60) * 60 * 1000];
};

/**
 * The pinned session a placement would overlap, if any. Suggested sessions
 * never block: the backend re-plans them around pinned ones.
 */
export const findClash = (
  sessions: Session[],
  days: LanDay[],
  day: number,
  st: number,
  dur: number,
  ignoreKey?: string,
): Session | undefined => {
  if (!days[day]) return undefined;
  const [s, e] = placementSpan(days, day, st, dur);
  return sessions.find((o) => {
    if (!o.pinned || o.key === ignoreKey) return false;
    const os = moment(o.entry.startTime).valueOf();
    const oe = os + o.entry.durationMinutes * 60 * 1000;
    return os < e && s < oe;
  });
};

/** Why a placement falls outside the event, or null when it fits. */
export const outsideEventReason = (
  days: LanDay[],
  day: number,
  st: number,
  dur: number,
  timeBegin: moment.MomentInput,
  timeEnd: moment.MomentInput,
): "before" | "after" | null => {
  if (!days[day]) return "before";
  const [s, e] = placementSpan(days, day, st, dur);
  if (s < moment(timeBegin).valueOf()) return "before";
  if (e > moment(timeEnd).valueOf()) return "after";
  return null;
};

/**
 * The refusal shown when a move/resize would leave the event, in local time
 * and in the same "… Not moved." shape as the clash message.
 */
export const outsideEventMessage = (
  reason: "before" | "after",
  gameName: string,
  action: "move" | "resize",
  span: { start: moment.MomentInput; end: moment.MomentInput },
  timeBegin: moment.MomentInput,
  timeEnd: moment.MomentInput,
): string => {
  const at = (t: moment.MomentInput) => moment(t).local().format("ddd HH:mm");
  const outcome = action === "move" ? "Not moved." : "Not resized.";
  return reason === "before"
    ? `${gameName} would start at ${at(span.start)}, before the event begins (${at(timeBegin)}). ${outcome}`
    : `${gameName} would end at ${at(span.end)}, after the event ends (${at(timeEnd)}). ${outcome}`;
};

/** Earliest free start for a new session on a day (30-min steps). */
export const firstFreeStart = (
  sessions: Session[],
  days: LanDay[],
  day: number,
  dur: number,
  timeBegin: moment.MomentInput,
  timeEnd: moment.MomentInput,
): number => {
  const d = days[day];
  if (!d) return 18;
  const from = d.windows.length ? d.windows[0][0] : LAN_DAY_CUTOFF_HOUR;
  const candidates: number[] = [];
  for (let h = snapUp(from); h + dur <= LAN_DAY_CUTOFF_HOUR + 24; h += 0.5)
    candidates.push(h);
  for (const h of candidates) {
    if (
      !findClash(sessions, days, day, h, dur) &&
      !outsideEventReason(days, day, h, dur, timeBegin, timeEnd)
    )
      return h;
  }
  return snapUp(from);
};

const snapUp = (h: number) => Math.ceil(h / SNAP_HOURS - 1e-9) * SNAP_HOURS;

export type DragMode = "move" | "start" | "end";

/**
 * New start/length while dragging. `dh` is the pointer offset in hours
 * (already snapped). Moves stay inside the visible range; resizes keep at
 * least 30 minutes.
 */
export const dragPlacement = (
  mode: DragMode,
  orig: { st: number; dur: number },
  dh: number,
  r: VisibleRange,
): { st: number; dur: number } => {
  const end0 = orig.st + orig.dur;
  if (mode === "move") {
    const lo = Math.min(r.h0, orig.st);
    const hi = Math.max(r.h1, end0) - orig.dur;
    return { st: clamp(orig.st + dh, lo, hi), dur: orig.dur };
  }
  if (mode === "start") {
    const st = clamp(
      orig.st + dh,
      Math.min(r.h0, orig.st),
      end0 - MIN_DURATION_HOURS,
    );
    return { st, dur: end0 - st };
  }
  const end = clamp(
    end0 + dh,
    orig.st + MIN_DURATION_HOURS,
    Math.max(r.h1, end0),
  );
  return { st: orig.st, dur: end - orig.st };
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

/** Attendees who said yes or maybe (the same set the owner counts use). */
export const squadOf = (invitations: InvitationLiteData[]) =>
  invitations.filter(
    (i) => i.response === RSVP.yes || i.response === RSVP.maybe,
  );

export interface Around {
  here: Gamer[];
  away: Gamer[];
  /** False when the time is outside the event's attendance grid. */
  known: boolean;
}

/**
 * Who is around when a session starts, from each attendee's attendance
 * buckets (the canonical grid in `utils/attendanceBuckets`).
 */
export const whoIsAround = (
  invitations: InvitationLiteData[],
  timeBegin: moment.MomentInput,
  timeEnd: moment.MomentInput,
  start: moment.MomentInput,
): Around => {
  const squad = squadOf(invitations);
  const toGamer = (i: InvitationLiteData): Gamer => ({
    handle: i.handle,
    avatarUrl: i.avatarUrl,
  });
  const t = moment(start).valueOf();
  const slot = getAttendanceBuckets(moment(timeBegin), moment(timeEnd)).find(
    (b) => b.start.valueOf() <= t && t < b.start.valueOf() + 6 * HOUR_MS,
  );
  if (!slot || slot.attendanceIndex == null)
    return { here: [], away: squad.map(toGamer), known: false };
  const idx = slot.attendanceIndex;
  const here: Gamer[] = [];
  const away: Gamer[] = [];
  squad.forEach((i) =>
    (i.attendance?.[idx] === 1 ? here : away).push(toGamer(i)),
  );
  return { here, away, known: true };
};

export interface ClockDay {
  /** `SAT` */
  short: string;
  /** `Saturday` */
  name: string;
  /** `14 NOV` */
  dateLabel: string;
  /** True when `h` is past midnight, i.e. the next calendar day of the row. */
  nextDay: boolean;
}

/**
 * The real local calendar day of hour `h` on a LAN day row. Rows run
 * 06:00–06:00, so 24.5 on Friday's row is Saturday 00:30.
 */
export const clockDay = (day: LanDay, h: number): ClockDay => {
  const offset = Math.floor(h / 24);
  const d = day.date.clone().add(offset, "days");
  return {
    short: d.format("ddd").toUpperCase(),
    name: d.format("dddd"),
    dateLabel: d.format("D MMM").toUpperCase(),
    nextDay: offset > 0,
  };
};

/**
 * Short label for a time on a row: `FRI 18:30`, or `SAT 00:30 (FRI NIGHT)`
 * when it is after midnight but still listed under Friday.
 */
export const whenShort = (day: LanDay | undefined, h: number): string => {
  if (!day) return fmtClock(h);
  const c = clockDay(day, h);
  return `${c.short} ${fmtClock(h)}${c.nextDay ? ` (${day.short} NIGHT)` : ""}`;
};

/**
 * Spoken / long label for a time on a row: `Friday 18:30`, or
 * `Saturday 00:30 (Friday night)`.
 */
export const whenLong = (day: LanDay | undefined, h: number): string => {
  if (!day) return fmtClock(h);
  const c = clockDay(day, h);
  return `${c.name} ${fmtClock(h)}${c.nextDay ? ` (${day.name} night)` : ""}`;
};

/** `FRI 18:30 → 20:30`, or `SAT 00:30 → 02:30 (FRI NIGHT)`. */
export const spanShort = (
  day: LanDay | undefined,
  st: number,
  dur: number,
): string => {
  if (!day) return `${fmtClock(st)} → ${fmtClock(st + dur)}`;
  const c = clockDay(day, st);
  return `${c.short} ${fmtClock(st)} → ${fmtClock(st + dur)}${
    c.nextDay ? ` (${day.short} NIGHT)` : ""
  }`;
};

/** `Friday 18:30 to 20:30`, or `Saturday 00:30 to 02:30 (Friday night)`. */
export const spanLong = (
  day: LanDay | undefined,
  st: number,
  dur: number,
): string => {
  if (!day) return `${fmtClock(st)} to ${fmtClock(st + dur)}`;
  const c = clockDay(day, st);
  return `${c.name} ${fmtClock(st)} to ${fmtClock(st + dur)}${
    c.nextDay ? ` (${day.name} night)` : ""
  }`;
};

/** `FRI 18:30 → 20:30 · 2h` (real day after midnight, see `spanShort`). */
export const placementLabel = (
  day: LanDay | undefined,
  st: number,
  dur: number,
) => `${spanShort(day, st, dur)} · ${fmtDur(dur)}`;
