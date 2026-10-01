/**
 * Pure helpers for the Events page (`EventSelection`) and its cards
 * (`EventCard`): date readouts, RSVP status tags and the featured event's
 * meta line. Kept free of React so they are easy to unit test.
 */
import moment from "moment";
import { RSVP } from "../types/invitations";
import type { HlTone } from "./hl/tokens";
import type { EventPhase } from "./shell/navModel";

export { eventPhase, pickActiveEvent } from "./shell/navModel";
export type { EventPhase };

/** Filter tabs on the Events page, matching the API's `filter` values. */
export type EventFilter = "upcoming" | "past" | "all";

export const EVENT_FILTERS: ReadonlyArray<{ id: EventFilter; label: string }> =
  [
    { id: "upcoming", label: "Upcoming" },
    { id: "past", label: "Past" },
    { id: "all", label: "All" },
  ];

/**
 * The signed-in user's answer to an event invitation. `undefined` = not known
 * (still loading, or the lookup failed); `null` = invited, not answered yet.
 */
export type MyRsvp = RSVP | null | undefined;

type TimeLike = moment.Moment | Date | number | string;

const en = (t: TimeLike) => moment(t).clone().locale("en");

/** The calendar tile on a card: `{ day: "04", mon: "DEC" }`. */
export function formatDayBlock(timeBegin: TimeLike) {
  const m = en(timeBegin);
  return { day: m.format("DD"), mon: m.format("MMM").toUpperCase() };
}

/**
 * The card's time range, e.g. `FRI 18:00 → SAT 23:00`. Events spanning a week
 * or more get dates instead of weekday names so the range is unambiguous.
 */
export function formatCardRange(timeBegin: TimeLike, timeEnd: TimeLike) {
  const b = en(timeBegin);
  const e = en(timeEnd);
  const long = e.diff(b, "days", true) >= 6;
  const fmt = long ? "DD MMM HH:mm" : "ddd HH:mm";
  if (!long && b.isSame(e, "day")) {
    return `${b.format("ddd HH:mm")} → ${e.format("HH:mm")}`.toUpperCase();
  }
  return `${b.format(fmt)} → ${e.format(fmt)}`.toUpperCase();
}

/**
 * The featured event's date line, e.g. `FRI 16 → SUN 18 OCT 2026`, widening
 * to `FRI 30 OCT → SUN 01 NOV 2026` or full dates when month/year differ.
 */
export function formatFeaturedRange(timeBegin: TimeLike, timeEnd: TimeLike) {
  const b = en(timeBegin);
  const e = en(timeEnd);
  let out: string;
  if (b.isSame(e, "day")) {
    out = `${b.format("ddd DD MMM YYYY")} · ${b.format("HH:mm")} → ${e.format("HH:mm")}`;
  } else if (!b.isSame(e, "year")) {
    out = `${b.format("ddd DD MMM YYYY")} → ${e.format("ddd DD MMM YYYY")}`;
  } else if (!b.isSame(e, "month")) {
    out = `${b.format("ddd DD MMM")} → ${e.format("ddd DD MMM YYYY")}`;
  } else {
    out = `${b.format("ddd DD")} → ${e.format("ddd DD MMM YYYY")}`;
  }
  return out.toUpperCase();
}

export interface StatusTag {
  label: string;
  tone: HlTone;
}

/**
 * Status tag for an event card: the user's RSVP for upcoming/live events,
 * `ENDED` (plus `ATTENDED` if they said yes) for past ones. Returns `null`
 * while the RSVP is unknown for an event that hasn't ended.
 */
export function cardStatus(phase: EventPhase, rsvp: MyRsvp): StatusTag | null {
  if (phase === "ended") {
    return {
      label: rsvp === RSVP.yes ? "Ended · Attended" : "Ended",
      tone: "neutral",
    };
  }
  if (rsvp === undefined) return null;
  switch (rsvp) {
    case RSVP.yes:
      return { label: "You're in", tone: "lime" };
    case RSVP.maybe:
      return { label: "Maybe", tone: "amber" };
    case RSVP.no:
      return { label: "Not going", tone: "pink" };
    default:
      return { label: "RSVP needed", tone: "cyan" };
  }
}

/** Status tag + call to action for the featured (next / live) event. */
export function featuredStatus(rsvp: MyRsvp): StatusTag & { cta: string } {
  switch (rsvp) {
    case RSVP.yes:
      return { label: "You're in", tone: "lime", cta: "Enter lobby" };
    case RSVP.maybe:
      return { label: "Maybe", tone: "amber", cta: "Enter lobby" };
    case RSVP.no:
      return { label: "Not going", tone: "pink", cta: "View event" };
    case null:
      return { label: "RSVP needed", tone: "cyan", cta: "RSVP now" };
    default:
      return { label: "", tone: "cyan", cta: "Open event" };
  }
}

/** Minimal shapes of the invitation list / seat rows used for the meta line. */
export interface AttendeeLite {
  response: RSVP | null;
  seatId?: number | null;
}

export interface SquadSummary {
  going: number;
  /** `null` when the event has no seats configured. */
  seatsLeft: number | null;
}

/** Count RSVP-yes attendees and unclaimed seats. */
export function summariseSquad(
  attendees: readonly AttendeeLite[],
  seats: ReadonlyArray<{ id: number }>,
): SquadSummary {
  const going = attendees.filter((a) => a.response === RSVP.yes).length;
  if (seats.length === 0) return { going, seatsLeft: null };
  const seatIds = new Set(seats.map((s) => s.id));
  const taken = new Set(
    attendees
      .map((a) => a.seatId)
      .filter((id): id is number => id != null && seatIds.has(id)),
  );
  return { going, seatsLeft: Math.max(0, seatIds.size - taken.size) };
}

/** `7 GOING · 4 SEATS LEFT` (singular forms, seats part only when known). */
export function formatSquadSummary({ going, seatsLeft }: SquadSummary) {
  const parts = [`${going} going`];
  if (seatsLeft != null) {
    parts.push(`${seatsLeft} ${seatsLeft === 1 ? "seat" : "seats"} left`);
  }
  return parts.join(" · ").toUpperCase();
}

/** Empty-state copy per filter. */
export function emptyCopy(filter: EventFilter) {
  switch (filter) {
    case "upcoming":
      return {
        title: "No upcoming events",
        description:
          "You're not invited to anything coming up yet. When an invite lands it'll show here.",
      };
    case "past":
      return {
        title: "No past events",
        description:
          "Events you were invited to will appear here once they end.",
      };
    default:
      return {
        title: "No events yet",
        description:
          "You haven't been invited to any events. Ask the organiser to send an invite to this email.",
      };
  }
}

export { DEFAULT_EVENT_IMAGE, eventImageSrc } from "../utils/eventImage";

/**
 * The viewer's RSVP from the user events list (`myResponse`, computed by the
 * API in the same query). `undefined` when the API didn't send it.
 */
export function myRsvpOf(event: { myResponse?: string | null }): MyRsvp {
  const r = event.myResponse;
  if (r === null) return null;
  return r === RSVP.yes || r === RSVP.maybe || r === RSVP.no ? r : undefined;
}
