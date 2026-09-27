import moment from "moment";

/**
 * Canonical attendance-bucket grid.
 *
 * !! This MUST stay in lockstep with the Rust implementation in
 * !! `api/src/controllers/event_invitation.rs::get_day_quarter_buckets`.
 *
 * The API validates that a submitted attendance array has exactly as many
 * entries as its own grid produces, and rejects the RSVP outright if it does
 * not. Any divergence between the two implementations therefore reaches users
 * as "Failed to save RSVP".
 *
 * The grid is anchored to the **UTC** calendar, because that is what the API
 * uses and how it interprets stored attendance arrays. Deriving it from the
 * browser's local calendar (as this code used to) makes the bucket count
 * depend on the viewer's timezone: for a viewer on a non-UTC offset the two
 * grids sit an offset apart, and for many event windows they disagree on how
 * many buckets the event spans. Events crossing a DST transition are the most
 * visible case, but any non-UTC viewer can trigger it.
 *
 * Compatibility with arrays stored before this was fixed
 * -----------------------------------------------------
 * The API only ever validated an array's *length*, never which instants its
 * entries referred to, so a browser on a non-UTC offset could submit an
 * accepted array whose entries were anchored an offset away from the API's
 * grid. Such arrays cannot be reindexed: the submitter's timezone was never
 * recorded, and two users in different zones could store arrays meaning
 * different things for the same event. The API has always read them on the UTC
 * grid, so aligning this module to the API is the only self-consistent
 * resolution rather than a new inconsistency. For the large majority of
 * previously-accepted events index `i` denotes the same named period under
 * both grids and nothing visibly changes; for a small minority a stored
 * selection can appear shifted by one period.
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Slot labels, indexed by slot number. Must match the API's TIME_PERIODS. */
export const TIME_PERIODS = [
  "Morning",
  "Afternoon",
  "Evening",
  "Overnight",
] as const;

/** Offsets (hours past midnight UTC) of each slot within a LAN day. */
const SLOT_OFFSETS = [6, 12, 18, 24];

export interface AttendanceSlot {
  /** 0 = morning, 1 = afternoon, 2 = evening, 3 = overnight. */
  slot: number;
  /** Start of this slot, as a UTC instant. */
  start: moment.Moment;
  /** False when the slot falls outside the event window. */
  inRange: boolean;
  /**
   * Index of this slot within the flat attendance array, or null when the slot
   * is out of range (out-of-range slots are not represented in the array).
   */
  attendanceIndex: number | null;
}

export interface AttendanceDay {
  /** 06:00 UTC anchor of this LAN day (a LAN day runs 06:00 -> 06:00). */
  dayStart: moment.Moment;
  /** Always length 4. */
  slots: AttendanceSlot[];
}

const startOfUtcDay = (ms: number): number => Math.floor(ms / DAY_MS) * DAY_MS;

/**
 * Build the full day/slot grid for an event, flagging which slots fall within
 * the event window and what their index is in the flat attendance array.
 *
 * Faithful port of the API's `get_day_quarter_buckets`, including its exact
 * boundary conditions:
 *   - days are walked from 06:00 UTC on the event's start date, while
 *     `dayAnchor < timeEnd`;
 *   - a slot is in range when `slotStart <= timeEnd && slotEnd > timeBegin`.
 */
export const getAttendanceGrid = (
  timeBegin: moment.Moment,
  timeEnd: moment.Moment,
): AttendanceDay[] => {
  const begin = timeBegin.valueOf();
  const end = timeEnd.valueOf();

  const days: AttendanceDay[] = [];
  let attendanceIndex = 0;

  for (
    let dayAnchor = startOfUtcDay(begin) + 6 * HOUR_MS;
    dayAnchor < end;
    dayAnchor += DAY_MS
  ) {
    const dayStart = startOfUtcDay(dayAnchor);

    const slots = SLOT_OFFSETS.map((offset, slot) => {
      const slotStart = dayStart + offset * HOUR_MS;
      const slotEnd = slotStart + 6 * HOUR_MS;
      const inRange = slotStart <= end && slotEnd > begin;

      return {
        slot,
        start: moment.utc(slotStart),
        inRange,
        attendanceIndex: inRange ? attendanceIndex++ : null,
      };
    });

    days.push({ dayStart: moment.utc(dayAnchor), slots });
  }

  return days;
};

/** Flat, in-order list of the slots that fall within the event window. */
export const getAttendanceBuckets = (
  timeBegin: moment.Moment,
  timeEnd: moment.Moment,
): AttendanceSlot[] =>
  getAttendanceGrid(timeBegin, timeEnd)
    .flatMap((day) => day.slots)
    .filter((slot) => slot.inRange);

/**
 * Number of entries the API expects in an attendance array for this event.
 */
export const getAttendanceBucketCount = (
  timeBegin: moment.Moment,
  timeEnd: moment.Moment,
): number => getAttendanceBuckets(timeBegin, timeEnd).length;
