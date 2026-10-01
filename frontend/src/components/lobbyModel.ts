/**
 * Pure helpers for the event lobby (HlLobby): hero labels, squad summary,
 * attendance cells and the game-vote ranking. Kept free of React so they can
 * be unit tested (see `src/__tests__/lobbyModel.test.ts`).
 */
import moment from "moment";
import { RSVP } from "../types/invitations";
import { getAttendanceGrid, TIME_PERIODS } from "../utils/attendanceBuckets";
import type { HlTone } from "./hl";
import { ownDeskLabel } from "./seatFloorPlanModel";

/** `EVT-001` style tag for an event id. */
export const formatEventId = (id: number): string =>
  `EVT-${String(Math.max(0, Math.trunc(id))).padStart(3, "0")}`;

/** `FRI 16 OCT 18:00 → SUN 18 OCT 16:00` (viewer's local time). */
export const formatEventRange = (
  begin: moment.Moment,
  end: moment.Moment,
): string => {
  const f = (m: moment.Moment) =>
    moment(m).local().format("ddd D MMM HH:mm").toUpperCase();
  return `${f(begin)} → ${f(end)}`;
};

/**
 * Split a title so the design's cyan accent can go on a trailing token that
 * contains a digit ("Autumn LAN **2026**"). Titles without one are unaccented.
 */
export const splitTitleAccent = (
  title: string,
): { head: string; accent: string | null } => {
  const trimmed = title.trim();
  const m = /^(.*\S)\s+(\S*\d\S*)$/.exec(trimmed);
  if (!m) return { head: trimmed, accent: null };
  return { head: m[1], accent: m[2] };
};

export type RsvpState = "yes" | "maybe" | "no" | "none";

export const rsvpState = (response: RSVP | null | undefined): RsvpState =>
  response === RSVP.yes
    ? "yes"
    : response === RSVP.maybe
      ? "maybe"
      : response === RSVP.no
        ? "no"
        : "none";

export interface RsvpStatusCopy {
  text: string;
  sub: string;
  tone: HlTone;
  /** Short squad-list tag. */
  tag: string;
  /** Call to action on the lobby's RSVP panel. */
  cta: string;
}

export const RSVP_STATUS: Record<RsvpState, RsvpStatusCopy> = {
  yes: {
    text: "You're in",
    sub: "Locked in. Your seat and slots are reserved.",
    tone: "lime",
    tag: "IN",
    cta: "Edit RSVP",
  },
  maybe: {
    text: "Maybe",
    sub: "Tentative. Your seat's held; confirm when you know.",
    tone: "amber",
    tag: "MAYBE",
    cta: "Edit RSVP",
  },
  no: {
    text: "Not going",
    sub: "You've sat this one out. Changed your mind?",
    tone: "pink",
    tag: "OUT",
    cta: "Update RSVP",
  },
  none: {
    text: "RSVP needed",
    sub: "You're invited. Pick your slots and claim a desk before they go.",
    tone: "cyan",
    tag: "INVITED",
    cta: "RSVP now",
  },
};

export interface AttendanceCell {
  /** e.g. "SAT Evening". */
  label: string;
  on: boolean;
}

export interface AttendanceDayLabel {
  /** e.g. "SAT". */
  label: string;
  /** Number of in-range cells that belong to this day. */
  span: number;
}

/**
 * One cell per in-range attendance bucket (on the API's UTC grid) plus the
 * day labels spanning them, for the lobby's attendance strips.
 */
export const attendanceCells = (
  attendance: number[] | null | undefined,
  timeBegin: moment.Moment,
  timeEnd: moment.Moment,
): { cells: AttendanceCell[]; days: AttendanceDayLabel[] } => {
  const cells: AttendanceCell[] = [];
  const days: AttendanceDayLabel[] = [];
  getAttendanceGrid(timeBegin, timeEnd).forEach((day) => {
    const dayLabel = day.dayStart.format("ddd").toUpperCase();
    let span = 0;
    day.slots.forEach((slot) => {
      if (slot.attendanceIndex === null) return;
      span++;
      cells.push({
        label: `${dayLabel} ${TIME_PERIODS[slot.slot]}`,
        on: attendance?.[slot.attendanceIndex] === 1,
      });
    });
    if (span > 0) days.push({ label: dayLabel, span });
  });
  return { cells, days };
};

const SQUAD_ORDER: Record<RsvpState, number> = {
  yes: 0,
  maybe: 1,
  no: 2,
  none: 3,
};

export interface SquadCounts {
  yes: number;
  maybe: number;
  no: number;
  none: number;
}

/**
 * Sort a squad IN → MAYBE → OUT → not yet responded (then by handle), and
 * count each bucket.
 */
export function summariseSquad<
  T extends { response: RSVP | null; handle: string | null },
>(attendees: readonly T[]): { sorted: T[]; counts: SquadCounts } {
  const counts: SquadCounts = { yes: 0, maybe: 0, no: 0, none: 0 };
  attendees.forEach((a) => counts[rsvpState(a.response)]++);
  const sorted = [...attendees].sort(
    (a, b) =>
      SQUAD_ORDER[rsvpState(a.response)] - SQUAD_ORDER[rsvpState(b.response)] ||
      (a.handle ?? "").localeCompare(b.handle ?? "", undefined, {
        sensitivity: "base",
      }),
  );
  return { sorted, counts };
}

export interface SquadSeating {
  hasSeating: boolean;
  allowUnspecifiedSeat: boolean;
  /** The event's configured label for a floating (no fixed desk) seat. */
  unspecifiedSeatLabel: string;
  /** Desk labels by seat id. */
  labels: Map<number, string>;
}

export interface SquadSeat {
  /**
   * `desk` a reserved desk, `floating` a reservation without a desk,
   * `unseated` going but no reservation yet, `none` not going.
   */
  kind: "desk" | "floating" | "unseated" | "none";
  text: string;
}

/**
 * The squad list's seat column for one guest, or null when the event has no
 * seating. Floating guests show the event's configured label; guests without
 * any reservation show "No seat yet" (older APIs without
 * `hasSeatReservation` can't tell the two apart, so they fall back to the
 * floating label when the event allows one).
 */
export function squadSeatText(
  guest: {
    response: RSVP | null;
    seatId: number | null;
    hasSeatReservation?: boolean;
  },
  seating: SquadSeating,
): SquadSeat | null {
  if (!seating.hasSeating) return null;
  const st = rsvpState(guest.response);
  if (st === "no" || st === "none") return { kind: "none", text: "none" };
  if (guest.seatId !== null)
    return {
      kind: "desk",
      text: seating.labels.get(guest.seatId) ?? "Reserved",
    };
  const floating =
    guest.hasSeatReservation ??
    (seating.allowUnspecifiedSeat ? true : undefined);
  return floating
    ? { kind: "floating", text: ownDeskLabel(seating.unspecifiedSeatLabel) }
    : { kind: "unseated", text: "No seat yet" };
}

export interface RankedSuggestion<T> {
  suggestion: T;
  /** Competition rank by votes (ties share a rank: 1, 1, 3, …). */
  rank: number;
  /** 1-3 when the game earns a trophy (needs at least one vote), else null. */
  trophyRank: number | null;
}

/**
 * Order suggestions by votes (most first, ties by name) and assign ranks.
 * Called after every vote so the list re-sorts live.
 */
export function rankSuggestions<T extends { votes: number; name: string }>(
  suggestions: readonly T[],
): RankedSuggestion<T>[] {
  const sorted = [...suggestions].sort(
    (a, b) =>
      b.votes - a.votes ||
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
  let rank = 0;
  return sorted.map((suggestion, i) => {
    if (i === 0 || suggestion.votes !== sorted[i - 1].votes) rank = i + 1;
    return {
      suggestion,
      rank,
      trophyRank: rank <= 3 && suggestion.votes > 0 ? rank : null,
    };
  });
}

/** Where the event is in its lifecycle at `now`. */
export const eventPhase = (
  timeBegin: moment.Moment,
  timeEnd: moment.Moment,
  now: number,
): "upcoming" | "live" | "ended" =>
  now < timeBegin.valueOf()
    ? "upcoming"
    : now < timeEnd.valueOf()
      ? "live"
      : "ended";
