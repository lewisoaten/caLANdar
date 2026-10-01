import { describe, it, expect } from "vitest";
import moment from "moment";
import {
  buildGridLines,
  buildLanDays,
  buildTicks,
  dayIndexOf,
  dragPlacement,
  findClash,
  firstFreeStart,
  fmtClock,
  fmtDur,
  hoursInDay,
  instantAt,
  outsideEventMessage,
  outsideEventReason,
  placementLabel,
  sessionKey,
  snap,
  toSessions,
  visibleRange,
  whoIsAround,
  autoScheduleWindows,
  clockDay,
  spanLong,
  spanShort,
  whenLong,
  whenShort,
  SCHEDULER_WINDOW_END,
  SCHEDULER_WINDOW_HINT,
  SCHEDULER_WINDOW_START,
  browserTimeZone,
  dedupeSchedule,
  withTimeZone,
} from "../components/schedule/scheduleModel";
import { GameScheduleEntry } from "../types/game_schedule";
import { InvitationLiteData, RSVP } from "../types/invitations";

// Local wall-clock times, so the tests hold in any timezone.
const BEGIN = moment("2026-11-13T18:00:00");
const END = moment("2026-11-15T12:00:00");
const stamp = moment("2026-10-01T00:00:00");

const entry = (
  id: number,
  gameId: number,
  start: string,
  minutes: number,
  pinned: boolean,
): GameScheduleEntry => ({
  id,
  eventId: 1,
  gameId,
  gameName: `Game ${gameId}`,
  startTime: moment(start),
  durationMinutes: minutes,
  isPinned: pinned,
  isSuggested: !pinned,
  createdAt: stamp,
  lastModified: stamp,
});

describe("LAN days", () => {
  const days = buildLanDays(BEGIN, END);

  it("makes one row per day from the first to the last day", () => {
    expect(days.map((d) => d.short)).toEqual(["FRI", "SAT", "SUN"]);
    expect(days[0].name).toBe("Friday");
    expect(days[0].dateLabel).toBe("13 NOV");
  });

  it("assigns after-midnight times to the previous LAN day", () => {
    const late = moment("2026-11-14T00:30:00");
    expect(dayIndexOf(late, days)).toBe(0);
    expect(hoursInDay(late, days[0])).toBe(24.5);
    expect(dayIndexOf(moment("2026-11-14T06:00:00"), days)).toBe(1);
  });

  it("round-trips hours to instants", () => {
    expect(instantAt(days[1], 19.5).format("YYYY-MM-DD HH:mm")).toBe(
      "2026-11-14 19:30",
    );
    expect(instantAt(days[0], 25).format("YYYY-MM-DD HH:mm")).toBe(
      "2026-11-14 01:00",
    );
  });

  it("builds the scheduler's window: 10:00-01:00 local inside the event", () => {
    const windows = autoScheduleWindows(BEGIN, END);
    const local = windows.map(([s, e]) => [
      moment(s).format("DD HH:mm"),
      moment(e).format("DD HH:mm"),
    ]);
    expect(local).toEqual([
      ["13 18:00", "14 01:00"],
      ["14 10:00", "15 01:00"],
      ["15 10:00", "15 12:00"],
    ]);
  });

  it("projects windows onto rows in local hours", () => {
    // Friday row starts at the event start (18:00 local).
    expect(days[0].windows).toEqual([[18, 25]]);
    expect(days[1].windows).toEqual([[10, 25]]);
    // Sunday ends with the event at 12:00.
    expect(days[2].windows).toEqual([[10, 12]]);
  });
});

describe("sessions and range", () => {
  const days = buildLanDays(BEGIN, END);
  const sessions = toSessions(
    [
      entry(1, 730, "2026-11-13T19:00:00", 120, true),
      entry(0, 550, "2026-11-14T21:00:00", 90, false),
      entry(2, 440, "2026-11-15T07:00:00", 60, true),
    ],
    days,
  );

  it("keys pinned by id and suggested by game + start", () => {
    expect(sessions[0].key).toBe("p1");
    expect(sessions[1].key).toMatch(/^s550@\d+$/);
    expect(sessionKey(entry(0, 1, "2026-11-13T19:00:00", 60, false))).toMatch(
      /^s1@/,
    );
  });

  it("places sessions on their day in hours", () => {
    expect(sessions.map((s) => [s.day, s.st, s.dur])).toEqual([
      [0, 19, 2],
      [1, 21, 1.5],
      [2, 7, 1],
    ]);
  });

  it("widens the visible range to whole hours around off-window sessions", () => {
    const r = visibleRange(days, sessions);
    expect(r.h0).toBe(7);
    expect(r.span).toBe(r.h1 - r.h0);
    expect(r.h1).toBeGreaterThanOrEqual(24);
  });

  it("falls back to 08-24 with no windows or sessions", () => {
    expect(visibleRange([], [])).toEqual({ h0: 8, h1: 24, span: 16 });
  });

  it("detects clashes with pinned sessions only", () => {
    expect(findClash(sessions, days, 0, 20, 1)?.key).toBe("p1");
    expect(findClash(sessions, days, 0, 20, 1, "p1")).toBeUndefined();
    expect(findClash(sessions, days, 0, 21, 1)).toBeUndefined();
    // Overlapping the suggested Saturday slot is allowed.
    expect(findClash(sessions, days, 1, 21, 1)).toBeUndefined();
  });

  it("rejects placements outside the event", () => {
    expect(outsideEventReason(days, 0, 17, 1, BEGIN, END)).toBe("before");
    expect(outsideEventReason(days, 2, 11, 2, BEGIN, END)).toBe("after");
    expect(outsideEventReason(days, 1, 11, 2, BEGIN, END)).toBeNull();
  });

  it("explains an out-of-event placement in local time, like a clash", () => {
    const end = moment("2026-11-15T13:00:00");
    const msg = outsideEventMessage(
      "after",
      "Factorio",
      "move",
      { start: moment("2026-11-15T11:00:00"), end },
      BEGIN,
      END,
    );
    expect(msg).toBe(
      "Factorio would end at Sun 13:00, after the event ends (Sun 12:00). Not moved.",
    );
    expect(msg).not.toMatch(/Cannot|\d{2}\/\d{2}\/\d{4}/);
    expect(
      outsideEventMessage(
        "before",
        "Factorio",
        "resize",
        { start: moment("2026-11-13T17:00:00"), end: BEGIN },
        BEGIN,
        END,
      ),
    ).toBe(
      "Factorio would start at Fri 17:00, before the event begins (Fri 18:00). Not resized.",
    );
  });

  it("finds the first free start in the day's window", () => {
    expect(firstFreeStart(sessions, days, 0, 2, BEGIN, END)).toBe(21);
    expect(firstFreeStart(sessions, days, 0, 1, BEGIN, END)).toBe(18);
  });
});

describe("drag maths", () => {
  const r = { h0: 8, h1: 24, span: 16 };

  it("moves inside the visible range", () => {
    expect(dragPlacement("move", { st: 10, dur: 2 }, 1.5, r)).toEqual({
      st: 11.5,
      dur: 2,
    });
    expect(dragPlacement("move", { st: 10, dur: 2 }, -5, r)).toEqual({
      st: 8,
      dur: 2,
    });
    expect(dragPlacement("move", { st: 20, dur: 3 }, 5, r)).toEqual({
      st: 21,
      dur: 3,
    });
  });

  it("resizes from either edge with a 30 min minimum", () => {
    expect(dragPlacement("start", { st: 10, dur: 2 }, 3, r)).toEqual({
      st: 11.5,
      dur: 0.5,
    });
    expect(dragPlacement("start", { st: 10, dur: 2 }, -1, r)).toEqual({
      st: 9,
      dur: 3,
    });
    expect(dragPlacement("end", { st: 10, dur: 2 }, -4, r)).toEqual({
      st: 10,
      dur: 0.5,
    });
    expect(dragPlacement("end", { st: 22, dur: 1 }, 4, r)).toEqual({
      st: 22,
      dur: 2,
    });
  });

  it("snaps to 30 minutes", () => {
    expect(snap(10.2)).toBe(10);
    expect(snap(10.3)).toBe(10.5);
  });
});

describe("formatting", () => {
  it("formats clock times, wrapping past midnight", () => {
    expect(fmtClock(18.5)).toBe("18:30");
    expect(fmtClock(24)).toBe("00:00");
    expect(fmtClock(25.5)).toBe("01:30");
  });

  it("formats durations", () => {
    expect(fmtDur(2)).toBe("2h");
    expect(fmtDur(2.5)).toBe("2h 30m");
    expect(fmtDur(0.5)).toBe("30m");
  });

  it("labels drags", () => {
    const [fri] = buildLanDays(BEGIN, END);
    expect(placementLabel(fri, 19, 3)).toBe("FRI 19:00 → 22:00 · 3h");
    expect(placementLabel(fri, 24, 2)).toBe(
      "SAT 00:00 → 02:00 (FRI NIGHT) · 2h",
    );
  });

  it("names the real calendar day after midnight on a LAN day row", () => {
    const [fri] = buildLanDays(BEGIN, END);
    expect(clockDay(fri, 23.5)).toMatchObject({
      short: "FRI",
      name: "Friday",
      dateLabel: "13 NOV",
      nextDay: false,
    });
    expect(clockDay(fri, 24.5)).toMatchObject({
      short: "SAT",
      name: "Saturday",
      dateLabel: "14 NOV",
      nextDay: true,
    });
    expect(whenShort(fri, 19)).toBe("FRI 19:00");
    expect(whenShort(fri, 24.5)).toBe("SAT 00:30 (FRI NIGHT)");
    expect(whenLong(fri, 24.5)).toBe("Saturday 00:30 (Friday night)");
    expect(spanShort(fri, 23, 2)).toBe("FRI 23:00 → 01:00");
    expect(spanLong(fri, 24, 2)).toBe("Saturday 00:00 to 02:00 (Friday night)");
  });

  it("draws the window the backend scheduler uses (10:00 to 01:00 local)", () => {
    // Mirrors DAY_START_HOUR / NIGHT_START_HOUR in api/src/scheduler.rs.
    expect(SCHEDULER_WINDOW_START).toBe(10);
    expect(SCHEDULER_WINDOW_END).toBe(25);
    expect(SCHEDULER_WINDOW_HINT).toBe(
      "Auto-schedule window: 10:00 – 01:00 each day (your local time). Suggested sessions are planned inside it; pinned sessions can go any time.",
    );
  });

  it("ticks every 2h over 12h spans and hourly otherwise", () => {
    const wide = buildTicks({ h0: 8, h1: 24, span: 16 });
    expect(wide.map((t) => t.label)).toEqual([
      "08:00",
      "10:00",
      "12:00",
      "14:00",
      "16:00",
      "18:00",
      "20:00",
      "22:00",
      "24:00",
    ]);
    expect(wide[0].align).toBe("start");
    expect(wide[wide.length - 1].align).toBe("end");
    expect(buildTicks({ h0: 10, h1: 14, span: 4 })).toHaveLength(5);
    const lines = buildGridLines({ h0: 8, h1: 12, span: 4 });
    expect(lines.map((l) => l.h)).toEqual([8.5, 9, 9.5, 10, 10.5, 11, 11.5]);
    expect(lines.filter((l) => l.major).map((l) => l.h)).toEqual([9, 10, 11]);
  });
});

describe("attendance", () => {
  it("splits the squad into around / not there from attendance buckets", () => {
    // UTC event so the bucket grid is easy to reason about:
    // buckets = Fri 18Z, Sat 00Z, 06Z, 12Z, 18Z, Sun 00Z, 06Z.
    const begin = moment.utc("2026-11-13T18:00:00Z");
    const end = moment.utc("2026-11-15T12:00:00Z");
    const inv = (
      handle: string,
      response: RSVP | null,
      attendance: number[] | null,
    ): InvitationLiteData => ({
      eventId: 1,
      avatarUrl: null,
      handle,
      response,
      attendance,
      seatId: null,
      lastModified: stamp,
    });
    const invitations = [
      inv("A", RSVP.yes, [1, 1, 1, 1, 1, 1, 1]),
      inv("B", RSVP.maybe, [0, 0, 0, 1, 0, 0, 0]),
      inv("C", RSVP.yes, null),
      inv("D", RSVP.no, [1, 1, 1, 1, 1, 1, 1]),
    ];
    const sat14 = moment.utc("2026-11-14T14:00:00Z");
    const res = whoIsAround(invitations, begin, end, sat14);
    expect(res.known).toBe(true);
    expect(res.here.map((g) => g.handle)).toEqual(["A", "B"]);
    expect(res.away.map((g) => g.handle)).toEqual(["C"]);
    const before = whoIsAround(
      invitations,
      begin,
      end,
      moment.utc("2026-11-13T10:00:00Z"),
    );
    expect(before.known).toBe(false);
  });
});

// The suite runs in Europe/London (vite.config.ts), where clocks go back at
// 02:00 BST on Sunday 25 Oct 2026: the product owner's Fri 23 – Sun 25 event.
describe("auto-schedule window across the UK clock change", () => {
  const begin = "2026-10-23T08:00:00Z"; // Fri 09:00 BST
  const end = "2026-10-25T23:30:00Z"; // Sun 23:30 GMT
  const days = buildLanDays(begin, end);

  it("is the same wall-clock 10:00 → 01:00 every day", () => {
    expect(days.map((d) => d.short)).toEqual(["FRI", "SAT", "SUN"]);
    expect(days.map((d) => d.windows)).toEqual([
      [[10, 25]],
      [[10, 25]],
      [[10, 23.5]],
    ]);
  });

  it("follows the offset change in absolute time", () => {
    const iso = autoScheduleWindows(begin, end).map(([s, e]) => [
      new Date(s).toISOString(),
      new Date(e).toISOString(),
    ]);
    expect(iso).toEqual([
      // Fri 10:00 BST → Sat 01:00 BST
      ["2026-10-23T09:00:00.000Z", "2026-10-24T00:00:00.000Z"],
      // Sat 10:00 BST → Sun 01:00 (the first, BST, one): 15h
      ["2026-10-24T09:00:00.000Z", "2026-10-25T00:00:00.000Z"],
      // Sun 10:00 GMT → event end
      ["2026-10-25T10:00:00.000Z", "2026-10-25T23:30:00.000Z"],
    ]);
  });

  it("ends at the jump when clocks go forward (29 Mar 2026)", () => {
    // 01:00 doesn't exist that night (00:59 GMT is followed by 02:00 BST), so
    // Saturday's window ends at the jump itself, like the API's
    // `local_instant`: 01:00Z, read as 02:00 BST on the wall clock.
    const begin = "2026-03-27T08:00:00Z";
    const end = "2026-03-29T22:00:00Z";
    const spring = buildLanDays(begin, end);
    expect(spring.map((d) => d.windows)).toEqual([
      [[10, 25]],
      [[10, 26]],
      [[10, 23]], // 22:00Z = 23:00 BST
    ]);
    expect(new Date(autoScheduleWindows(begin, end)[1][1]).toISOString()).toBe(
      "2026-03-29T01:00:00.000Z",
    );
  });
});

describe("one entry per game", () => {
  it("drops suggestions for pinned games and repeat suggestions", () => {
    const pinned = entry(1, 730, "2026-11-13T19:00:00", 120, true);
    const dupOfPinned = entry(0, 730, "2026-11-14T12:00:00", 120, false);
    const later = entry(0, 550, "2026-11-14T21:00:00", 120, false);
    const earlier = entry(0, 550, "2026-11-14T12:00:00", 120, false);
    const other = entry(0, 440, "2026-11-14T15:00:00", 120, false);
    const kept = dedupeSchedule([pinned, dupOfPinned, later, earlier, other]);
    expect(kept).toEqual([pinned, earlier, other]);
    const days = buildLanDays(BEGIN, END);
    expect(
      toSessions([pinned, dupOfPinned, later, earlier, other], days).map(
        (s) => s.entry,
      ),
    ).toEqual([pinned, earlier, other]);
  });

  it("keeps every pinned session, even of the same game", () => {
    const a = entry(1, 730, "2026-11-13T19:00:00", 120, true);
    const b = entry(2, 730, "2026-11-14T19:00:00", 120, true);
    expect(dedupeSchedule([a, b])).toEqual([a, b]);
  });
});

describe("time zone param", () => {
  it("adds the browser zone to scheduler requests", () => {
    expect(browserTimeZone()).toBe("Europe/London");
    expect(withTimeZone("/api/events/1/game_schedule")).toBe(
      "/api/events/1/game_schedule?tz=Europe%2FLondon",
    );
    expect(withTimeZone("/x/recalculate?as_admin=true", "Asia/Tokyo")).toBe(
      "/x/recalculate?as_admin=true&tz=Asia%2FTokyo",
    );
    expect(withTimeZone("/x", "")).toBe("/x");
  });
});
