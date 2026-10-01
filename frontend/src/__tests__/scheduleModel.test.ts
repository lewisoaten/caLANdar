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
  isOutsideWindow,
  outsideEventMessage,
  outsideEventReason,
  placementLabel,
  rankSuggestions,
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
  SCHEDULER_WINDOW_END_UTC,
  SCHEDULER_WINDOW_START_UTC,
} from "../components/schedule/scheduleModel";
import { GameScheduleEntry } from "../types/game_schedule";
import { GameSuggestion, GameVote } from "../types/game_suggestions";
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

  it("builds the scheduler's window: 10:00-01:00 UTC inside the event", () => {
    const windows = autoScheduleWindows(BEGIN, END);
    const utc = windows.map(([s, e]) => [
      moment.utc(s).format("DD HH:mm"),
      moment.utc(e).format("DD HH:mm"),
    ]);
    // Every window starts at 10:00Z (or the event start) and ends at 01:00Z
    // (or the event end).
    utc.forEach(([s, e], i) => {
      if (i > 0) expect(s.endsWith("10:00")).toBe(true);
      if (i < utc.length - 1) expect(e.endsWith("01:00")).toBe(true);
    });
    expect(windows[0][0]).toBe(BEGIN.valueOf());
    expect(windows[windows.length - 1][1]).toBe(END.valueOf());
  });

  it("projects windows onto rows in local hours", () => {
    const off = BEGIN.utcOffset() / 60;
    // Friday row starts at the event start (18:00 local).
    expect(days[0].windows[0][0]).toBe(18);
    // Saturday's window starts at 10:00 UTC.
    expect(days[1].windows[0][0]).toBe(10 + off);
    // Sunday ends with the event at 12:00.
    const sun = days[2].windows;
    expect(sun[sun.length - 1][1]).toBe(12);
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

  it("flags off-window placements", () => {
    expect(isOutsideWindow(days[2], 7, 1)).toBe(true);
    expect(isOutsideWindow(days[0], 19, 2)).toBe(false);
    expect(isOutsideWindow(days[0], 17, 2)).toBe(true);
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

  it("draws the window the backend scheduler uses (10:00Z to 01:00Z)", () => {
    // Mirrors DAY_START_HOUR_UTC / NIGHT_START_HOUR_UTC in api/src/scheduler.rs.
    expect(SCHEDULER_WINDOW_START_UTC).toBe(10);
    expect(SCHEDULER_WINDOW_END_UTC).toBe(25);
    const windows = autoScheduleWindows(
      "2026-11-13T00:00:00Z",
      "2026-11-14T23:00:00Z",
    );
    expect(
      windows.map(([s, e]) => [
        new Date(s).toISOString(),
        new Date(e).toISOString(),
      ]),
    ).toEqual([
      // The tail of the previous night's window, clipped to the event start.
      ["2026-11-13T00:00:00.000Z", "2026-11-13T01:00:00.000Z"],
      ["2026-11-13T10:00:00.000Z", "2026-11-14T01:00:00.000Z"],
      ["2026-11-14T10:00:00.000Z", "2026-11-14T23:00:00.000Z"],
    ]);
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

describe("votes and attendance", () => {
  const suggestion = (
    appid: number,
    votes: number,
    requestedAt: string,
  ): GameSuggestion => ({
    appid,
    name: `G${appid}`,
    userEmail: "",
    comment: null,
    lastModified: stamp,
    requestedAt: moment(requestedAt),
    suggestionLastModified: stamp,
    selfVote: GameVote.noVote,
    votes,
    voters: [],
    suggester: null,
    gamerOwned: [],
    gamerUnowned: [],
    gamerUnknown: [],
  });

  it("ranks by votes, then earliest suggestion", () => {
    const order = rankSuggestions([
      suggestion(1, 2, "2026-10-03T00:00:00Z"),
      suggestion(2, 5, "2026-10-04T00:00:00Z"),
      suggestion(3, 2, "2026-10-01T00:00:00Z"),
    ]).map((g) => g.appid);
    expect(order).toEqual([2, 3, 1]);
  });

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
