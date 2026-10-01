import { describe, expect, test } from "vitest";
import moment from "moment";
import {
  attendanceCells,
  eventPhase,
  formatEventId,
  formatEventRange,
  rsvpState,
  splitTitleAccent,
  squadSeatText,
  summariseSquad,
} from "../components/lobbyModel";
import { RSVP } from "../types/invitations";

describe("formatEventId", () => {
  test("pads to three digits", () => {
    expect(formatEventId(1)).toBe("EVT-001");
    expect(formatEventId(42)).toBe("EVT-042");
    expect(formatEventId(1234)).toBe("EVT-1234");
  });
});

describe("formatEventRange", () => {
  test("formats both ends in upper-case local time", () => {
    const begin = moment("2026-10-16T18:00:00");
    const end = moment("2026-10-18T16:00:00");
    expect(formatEventRange(begin, end)).toBe(
      "FRI 16 OCT 18:00 → SUN 18 OCT 16:00",
    );
  });
});

describe("splitTitleAccent", () => {
  test("accents a trailing token with a digit", () => {
    expect(splitTitleAccent("Autumn LAN 2026")).toEqual({
      head: "Autumn LAN",
      accent: "2026",
    });
    expect(splitTitleAccent("LAN v2")).toEqual({ head: "LAN", accent: "v2" });
  });

  test("leaves other titles alone", () => {
    expect(splitTitleAccent("Summer LAN")).toEqual({
      head: "Summer LAN",
      accent: null,
    });
    expect(splitTitleAccent("2026")).toEqual({ head: "2026", accent: null });
  });
});

describe("rsvpState", () => {
  test("maps responses", () => {
    expect(rsvpState(RSVP.yes)).toBe("yes");
    expect(rsvpState(RSVP.maybe)).toBe("maybe");
    expect(rsvpState(RSVP.no)).toBe("no");
    expect(rsvpState(null)).toBe("none");
  });
});

describe("summariseSquad", () => {
  test("sorts IN, MAYBE, OUT, pending then by handle and counts", () => {
    const people = [
      { handle: "zed", response: RSVP.no },
      { handle: "amy", response: null },
      { handle: "Bob", response: RSVP.yes },
      { handle: "cat", response: RSVP.maybe },
      { handle: "abe", response: RSVP.yes },
    ];
    const { sorted, counts } = summariseSquad(people);
    expect(sorted.map((p) => p.handle)).toEqual([
      "abe",
      "Bob",
      "cat",
      "zed",
      "amy",
    ]);
    expect(counts).toEqual({ yes: 2, maybe: 1, no: 1, none: 1 });
    expect(people[0].handle).toBe("zed"); // input untouched
  });
});

describe("attendanceCells", () => {
  const begin = moment.utc("2026-10-16T18:00:00Z");
  const end = moment.utc("2026-10-18T16:00:00Z");

  test("one cell per in-range bucket with day spans", () => {
    const { cells, days } = attendanceCells(
      [1, 1, 0, 1, 1, 1, 1, 0],
      begin,
      end,
    );
    expect(cells.length).toBe(days.reduce((n, d) => n + d.span, 0));
    expect(days.map((d) => d.label)).toEqual(["FRI", "SAT", "SUN"]);
    expect(cells[0]).toEqual({ label: "FRI Evening", on: true });
    expect(cells.filter((c) => c.on).length).toBe(6);
  });

  test("null attendance is all off", () => {
    const { cells } = attendanceCells(null, begin, end);
    expect(cells.every((c) => !c.on)).toBe(true);
  });
});

describe("eventPhase", () => {
  const begin = moment("2026-10-16T18:00:00");
  const end = moment("2026-10-18T16:00:00");
  test("upcoming, live and ended", () => {
    expect(eventPhase(begin, end, begin.valueOf() - 1)).toBe("upcoming");
    expect(eventPhase(begin, end, begin.valueOf())).toBe("live");
    expect(eventPhase(begin, end, end.valueOf())).toBe("ended");
  });
});

describe("squadSeatText", () => {
  const seating = {
    hasSeating: true,
    allowUnspecifiedSeat: true,
    unspecifiedSeatLabel: "Floating / no desk",
    labels: new Map([[3, "A3"]]),
  };
  const guest = (
    seatId: number | null,
    hasSeatReservation?: boolean,
    response: RSVP | null = RSVP.yes,
  ) => ({ response, seatId, hasSeatReservation });

  test("is null without seating", () => {
    expect(
      squadSeatText(guest(3, true), { ...seating, hasSeating: false }),
    ).toBeNull();
  });

  test("shows the desk label", () => {
    expect(squadSeatText(guest(3, true), seating)).toEqual({
      kind: "desk",
      text: "A3",
    });
  });

  test("uses the event's label for a floating reservation", () => {
    expect(squadSeatText(guest(null, true), seating)).toEqual({
      kind: "floating",
      text: "Floating / no desk",
    });
  });

  test("tells a guest without any reservation apart from a floating one", () => {
    expect(squadSeatText(guest(null, false), seating)).toEqual({
      kind: "unseated",
      text: "No seat yet",
    });
  });

  test("falls back to the floating label on older APIs when allowed", () => {
    expect(squadSeatText(guest(null), seating)?.kind).toBe("floating");
    expect(
      squadSeatText(guest(null), { ...seating, allowUnspecifiedSeat: false })
        ?.kind,
    ).toBe("unseated");
  });

  test("shows nothing for guests who aren't going", () => {
    expect(squadSeatText(guest(3, true, RSVP.no), seating)?.kind).toBe("none");
  });
});
