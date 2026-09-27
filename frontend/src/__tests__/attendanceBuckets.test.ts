import { describe, it, expect } from "vitest";
import moment from "moment";
import {
  getAttendanceGrid,
  getAttendanceBuckets,
  getAttendanceBucketCount,
} from "../utils/attendanceBuckets";
import { calculateDefaultAttendance } from "../utils/attendance";

/**
 * Independent reference port of the API's
 * `event_invitation::get_day_quarter_buckets`, written from the Rust rather
 * than from our TypeScript, so that drift between the two is caught rather
 * than duplicated.
 */
const apiBucketCount = (begin: number, end: number): number => {
  const HOUR = 3600_000;
  const DAY = 24 * HOUR;
  const startOfUtcDay = (t: number) => Math.floor(t / DAY) * DAY;

  let count = 0;
  for (let day = startOfUtcDay(begin) + 6 * HOUR; day < end; day += DAY) {
    const dayStart = startOfUtcDay(day);
    for (const hour of [6, 12, 18, 24]) {
      const bucketStart = dayStart + hour * HOUR;
      if (bucketStart <= end && bucketStart + 6 * HOUR > begin) count += 1;
    }
  }
  return count;
};

/** The matrix test builds ~41k grids; generous headroom for a loaded CI box. */
const MATRIX_TIMEOUT_MS = 30_000;

// A Friday-evening-to-Sunday event that crosses a DST transition (the UK's
// BST -> GMT switch). A grid built on the viewer's local calendar yields 8
// buckets here while the API's UTC grid yields 9, so the API rejected every
// RSVP for such an event. This window was taken from a real report.
const DST_EVENT_BEGIN = "2026-10-23T17:00:00Z";
const DST_EVENT_END = "2026-10-25T16:00:00Z";

describe("attendance buckets", () => {
  it("runs under a non-UTC timezone so local-calendar regressions are caught", () => {
    expect(new Date().getTimezoneOffset()).not.toBeUndefined();
    expect(process.env.TZ).toBe("Europe/London");
  });

  it("matches the API bucket count for an event crossing a DST transition", () => {
    const begin = moment(DST_EVENT_BEGIN);
    const end = moment(DST_EVENT_END);

    expect(
      apiBucketCount(Date.parse(DST_EVENT_BEGIN), Date.parse(DST_EVENT_END)),
    ).toBe(9);
    expect(getAttendanceBucketCount(begin, end)).toBe(9);
    expect(calculateDefaultAttendance(begin, end)).toEqual([
      1, 1, 1, 1, 1, 1, 1, 1, 1,
    ]);
  });

  it("anchors DST-crossing event buckets to the expected UTC instants", () => {
    const buckets = getAttendanceBuckets(
      moment(DST_EVENT_BEGIN),
      moment(DST_EVENT_END),
    );

    expect(buckets.map((b) => b.start.toISOString())).toEqual([
      "2026-10-23T12:00:00.000Z",
      "2026-10-23T18:00:00.000Z",
      "2026-10-24T00:00:00.000Z",
      "2026-10-24T06:00:00.000Z",
      "2026-10-24T12:00:00.000Z",
      "2026-10-24T18:00:00.000Z",
      "2026-10-25T00:00:00.000Z",
      "2026-10-25T06:00:00.000Z",
      "2026-10-25T12:00:00.000Z",
    ]);
  });

  it("gives out-of-range slots no attendance index", () => {
    const grid = getAttendanceGrid(
      moment(DST_EVENT_BEGIN),
      moment(DST_EVENT_END),
    );

    // Three LAN days, each with four slots.
    expect(grid).toHaveLength(3);
    grid.forEach((day) => expect(day.slots).toHaveLength(4));

    // The event starts at 17:00Z, so the first day's 06:00 slot is excluded.
    expect(grid[0].slots[0].inRange).toBe(false);
    expect(grid[0].slots[0].attendanceIndex).toBeNull();

    // Indices are contiguous and in order across the in-range slots.
    const indices = grid
      .flatMap((day) => day.slots)
      .filter((slot) => slot.inRange)
      .map((slot) => slot.attendanceIndex);
    expect(indices).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("does not depend on how the input moment was constructed", () => {
    const utc = getAttendanceBucketCount(
      moment.utc(DST_EVENT_BEGIN),
      moment.utc(DST_EVENT_END),
    );
    const local = getAttendanceBucketCount(
      moment(DST_EVENT_BEGIN).local(),
      moment(DST_EVENT_END).local(),
    );
    expect(utc).toBe(local);
  });

  it(
    "agrees with the API across a matrix of event windows",
    () => {
      // Walk every half-hour start across a fortnight that contains the BST ->
      // GMT switch, with durations from 12h to 72h. `moment(number)` yields a
      // local-mode moment, so this exercises the realistic input under the
      // Europe/London timezone pinned in vite.config.ts.
      const HOUR = 3600_000;
      const base = Date.parse("2026-10-18T00:00:00Z");

      const mismatches: string[] = [];
      for (let startHalfHour = 0; startHalfHour < 14 * 48; startHalfHour += 1) {
        const begin = base + startHalfHour * 30 * 60_000;
        for (let durationHours = 12; durationHours <= 72; durationHours += 1) {
          const end = begin + durationHours * HOUR;

          const ours = getAttendanceBucketCount(moment(begin), moment(end));
          const theirs = apiBucketCount(begin, end);
          if (ours !== theirs) {
            mismatches.push(
              `${new Date(begin).toISOString()} -> ${new Date(
                end,
              ).toISOString()}: ${ours} != ${theirs}`,
            );
          }
        }
      }

      expect(mismatches.slice(0, 5)).toEqual([]);
    },
    MATRIX_TIMEOUT_MS,
  );

  it("keeps the API's boundary behaviour when the event ends at 06:00 UTC", () => {
    // The API's day loop stops once its 06:00 anchor reaches time_end, which
    // drops the bucket starting exactly at that 06:00. The frontend must
    // reproduce this rather than "correct" it, or the two disagree again.
    const begin = "2026-10-09T18:00:00Z";
    const end = "2026-10-11T06:00:00Z";

    expect(getAttendanceBucketCount(moment(begin), moment(end))).toBe(
      apiBucketCount(Date.parse(begin), Date.parse(end)),
    );
  });
});
