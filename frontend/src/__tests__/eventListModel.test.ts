import { describe, test, expect } from "vitest";
import moment from "moment";
import { RSVP } from "../types/invitations";
import {
  cardStatus,
  emptyCopy,
  eventImageSrc,
  featuredStatus,
  formatCardRange,
  formatDayBlock,
  formatFeaturedRange,
  formatSquadSummary,
  myRsvpOf,
  summariseSquad,
} from "../components/eventListModel";
import { looksLikeEmail } from "../components/AuthLayout";

// Local-time constructors so the assertions don't depend on the TZ.
const at = (y: number, mo: number, d: number, h = 0, mi = 0) =>
  moment(new Date(y, mo - 1, d, h, mi));

describe("date readouts", () => {
  test("day block", () => {
    expect(formatDayBlock(at(2026, 12, 4, 18))).toEqual({
      day: "04",
      mon: "DEC",
    });
  });

  test("card range uses weekdays for short events", () => {
    expect(formatCardRange(at(2026, 12, 4, 18), at(2026, 12, 5, 23))).toBe(
      "FRI 18:00 → SAT 23:00",
    );
    expect(formatCardRange(at(2026, 12, 5, 18), at(2026, 12, 5, 23))).toBe(
      "SAT 18:00 → 23:00",
    );
  });

  test("card range uses dates for week-long events", () => {
    expect(formatCardRange(at(2026, 12, 4, 18), at(2026, 12, 12, 10))).toBe(
      "04 DEC 18:00 → 12 DEC 10:00",
    );
  });

  test("featured range", () => {
    expect(
      formatFeaturedRange(at(2026, 10, 16, 18), at(2026, 10, 18, 16)),
    ).toBe("FRI 16 → SUN 18 OCT 2026");
    expect(formatFeaturedRange(at(2026, 10, 30, 18), at(2026, 11, 1, 16))).toBe(
      "FRI 30 OCT → SUN 01 NOV 2026",
    );
    expect(formatFeaturedRange(at(2026, 12, 31, 18), at(2027, 1, 1, 16))).toBe(
      "THU 31 DEC 2026 → FRI 01 JAN 2027",
    );
    expect(
      formatFeaturedRange(at(2026, 10, 17, 10), at(2026, 10, 17, 22)),
    ).toBe("SAT 17 OCT 2026 · 10:00 → 22:00");
  });

  test("ignores the global moment locale", () => {
    const prev = moment.locale();
    moment.locale("fr");
    try {
      expect(formatDayBlock(at(2026, 12, 4)).mon).toBe("DEC");
    } finally {
      moment.locale(prev);
    }
  });
});

describe("status tags", () => {
  test("upcoming events show the RSVP", () => {
    expect(cardStatus("upcoming", RSVP.yes)).toEqual({
      label: "You're in",
      tone: "lime",
    });
    expect(cardStatus("upcoming", RSVP.maybe)?.tone).toBe("amber");
    expect(cardStatus("live", RSVP.no)?.tone).toBe("pink");
    expect(cardStatus("upcoming", null)).toEqual({
      label: "RSVP needed",
      tone: "cyan",
    });
    expect(cardStatus("upcoming", undefined)).toBeNull();
  });

  test("ended events are neutral", () => {
    expect(cardStatus("ended", RSVP.yes)).toEqual({
      label: "Ended · Attended",
      tone: "neutral",
    });
    expect(cardStatus("ended", undefined)?.label).toBe("Ended");
  });

  test("featured CTA follows the RSVP", () => {
    expect(featuredStatus(RSVP.yes).cta).toBe("Enter lobby");
    expect(featuredStatus(RSVP.maybe).cta).toBe("Enter lobby");
    expect(featuredStatus(RSVP.no).cta).toBe("View event");
    expect(featuredStatus(null)).toMatchObject({
      label: "RSVP needed",
      cta: "RSVP now",
    });
    expect(featuredStatus(undefined).label).toBe("");
  });
});

describe("squad summary", () => {
  const attendees = [
    { response: RSVP.yes, seatId: 1 },
    { response: RSVP.yes, seatId: 2 },
    { response: RSVP.maybe, seatId: 3 },
    { response: RSVP.yes, seatId: null },
    { response: null, seatId: 99 }, // unknown seat id is ignored
  ];

  test("counts going and free seats", () => {
    const s = summariseSquad(attendees, [
      { id: 1 },
      { id: 2 },
      { id: 3 },
      { id: 4 },
    ]);
    expect(s).toEqual({ going: 3, seatsLeft: 1 });
    expect(formatSquadSummary(s)).toBe("3 GOING · 1 SEAT LEFT");
  });

  test("omits seats when the event has none", () => {
    const s = summariseSquad(attendees, []);
    expect(s.seatsLeft).toBeNull();
    expect(formatSquadSummary(s)).toBe("3 GOING");
  });
});

describe("misc", () => {
  test("empty copy per filter", () => {
    expect(emptyCopy("upcoming").title).toBe("No upcoming events");
    expect(emptyCopy("past").title).toBe("No past events");
    expect(emptyCopy("all").title).toBe("No events yet");
  });

  test("image source", () => {
    expect(eventImageSrc(undefined)).toBe("/static/lan_party_image.jpg");
    expect(eventImageSrc("abc")).toBe("data:image/jpeg;base64,abc");
    expect(eventImageSrc("iVBORw0KGgoAAA")).toBe(
      "data:image/png;base64,iVBORw0KGgoAAA",
    );
    expect(eventImageSrc("/9j/4AAQ")).toBe("data:image/jpeg;base64,/9j/4AAQ");
  });

  test("email check", () => {
    expect(looksLikeEmail(" sam@example.com ")).toBe(true);
    expect(looksLikeEmail("sam@example")).toBe(false);
    expect(looksLikeEmail("")).toBe(false);
  });
});

describe("myRsvpOf", () => {
  test("reads the list's myResponse", () => {
    expect(myRsvpOf({ myResponse: "yes" })).toBe(RSVP.yes);
    expect(myRsvpOf({ myResponse: "no" })).toBe(RSVP.no);
    expect(myRsvpOf({ myResponse: null })).toBeNull();
    // Older API without the field: unknown, so no status tag is guessed.
    expect(myRsvpOf({})).toBeUndefined();
    expect(myRsvpOf({ myResponse: "bogus" })).toBeUndefined();
  });
});
