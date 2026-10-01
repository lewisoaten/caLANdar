import { describe, it, expect } from "vitest";
import moment from "moment";
import {
  buildEventsQuery,
  eventStatusOf,
  formatEventDates,
  rsvpSegments,
  rsvpSummary,
  type AdminEventData,
} from "../components/EventTable";
import {
  fromLocalInput,
  newEventDefaults,
  timeRangeError,
  toLocalInput,
} from "../components/EventsAdminDialog";
import { recipientCounts } from "../components/SendEmailDialog";
import {
  parseEmailList,
  rsvpStatus,
} from "../components/InvitationSeatManagementTable";
import { roomEditorPath, tabFromParam } from "../components/EventManagement";
import { RSVP } from "../types/invitations";

describe("formatEventDates", () => {
  it("collapses a range within one month", () => {
    expect(formatEventDates("2026-10-16T18:00", "2026-10-18T16:00")).toBe(
      "16 → 18 OCT 2026",
    );
  });
  it("shows one date for a single-day event", () => {
    expect(formatEventDates("2026-06-06T18:00", "2026-06-06T23:30")).toBe(
      "06 JUN 2026",
    );
  });
  it("includes both months across a month boundary", () => {
    expect(formatEventDates("2026-10-30T18:00", "2026-11-01T12:00")).toBe(
      "30 OCT → 01 NOV 2026",
    );
  });
  it("includes both years across a year boundary", () => {
    expect(formatEventDates("2026-12-30T18:00", "2027-01-02T12:00")).toBe(
      "30 DEC 2026 → 02 JAN 2027",
    );
  });
});

describe("RSVP bar", () => {
  const r = { invited: 8, yes: 5, maybe: 1, no: 1, pending: 1 };
  it("sizes segments as a share of invited", () => {
    expect(rsvpSegments(r)).toEqual({ yes: 62.5, maybe: 12.5, no: 12.5 });
  });
  it("is empty with nobody invited", () => {
    expect(rsvpSegments({ ...r, invited: 0 })).toEqual({
      yes: 0,
      maybe: 0,
      no: 0,
    });
    expect(
      rsvpSummary({ invited: 0, yes: 0, maybe: 0, no: 0, pending: 0 }),
    ).toBe("NO INVITES SENT");
  });
  it("has a text alternative", () => {
    expect(rsvpSummary(r)).toBe("5 IN · 1 MAYBE · 1 OUT · 1 PENDING");
  });
});

describe("eventStatusOf", () => {
  const base = {
    id: 1,
    title: "x",
    description: "",
    image: undefined,
    createdAt: moment(),
    lastModified: moment(),
  };
  const now = moment("2026-10-01T12:00:00Z");
  it("prefers the API status", () => {
    const e = {
      ...base,
      timeBegin: moment("2020-01-01"),
      timeEnd: moment("2020-01-02"),
      status: "live",
    } as AdminEventData;
    expect(eventStatusOf(e, now)).toBe("live");
  });
  it("derives ended/draft/live without one", () => {
    const past = {
      ...base,
      timeBegin: moment("2026-01-01"),
      timeEnd: moment("2026-01-02"),
    };
    const future = {
      ...base,
      timeBegin: moment("2026-12-01"),
      timeEnd: moment("2026-12-02"),
    };
    expect(eventStatusOf(past, now)).toBe("ended");
    expect(
      eventStatusOf(
        {
          ...future,
          rsvp: { invited: 0, yes: 0, maybe: 0, no: 0, pending: 0 },
        },
        now,
      ),
    ).toBe("draft");
    expect(eventStatusOf(future, now)).toBe("live");
  });
});

describe("buildEventsQuery", () => {
  it("omits empty search and the all status", () => {
    const q = new URLSearchParams(
      buildEventsQuery({
        asAdmin: true,
        page: 2,
        limit: 6,
        filter: "all",
        search: "  ",
        status: "all",
      }),
    );
    expect(Object.fromEntries(q)).toEqual({
      as_admin: "true",
      page: "2",
      limit: "6",
      filter: "all",
    });
  });
  it("passes a trimmed search and a status", () => {
    const q = new URLSearchParams(
      buildEventsQuery({
        asAdmin: true,
        page: 1,
        limit: 6,
        filter: "all",
        search: " lan ",
        status: "draft",
      }),
    );
    expect(q.get("search")).toBe("lan");
    expect(q.get("status")).toBe("draft");
  });
});

describe("event form helpers", () => {
  it("round-trips datetime-local values, rounding to the hour", () => {
    const m = fromLocalInput("2026-10-16T18:30");
    expect(m && toLocalInput(m)).toBe("2026-10-16T18:00");
    expect(fromLocalInput("")).toBeNull();
  });
  it("defaults a new event to the next hour for a day", () => {
    const d = newEventDefaults(moment("2026-10-01T10:15:00"));
    expect(toLocalInput(d.timeBegin)).toBe("2026-10-01T11:00");
    expect(toLocalInput(d.timeEnd)).toBe("2026-10-02T11:00");
  });
  it("flags an end before the start", () => {
    expect(timeRangeError("2026-10-16T18:00", "2026-10-15T18:00")).toMatch(
      /end after/,
    );
    expect(timeRangeError("2026-10-16T18:00", "2026-10-16T18:00")).toBeNull();
    expect(timeRangeError(moment.invalid(), "2026-10-16T18:00")).toMatch(
      /start/,
    );
  });
});

describe("recipientCounts", () => {
  it("counts each audience", () => {
    expect(
      recipientCounts([
        { response: RSVP.yes },
        { response: RSVP.yes },
        { response: RSVP.maybe },
        { response: RSVP.no },
        { response: null },
      ]),
    ).toEqual({ all: 5, rsvpYes: 2, rsvpYesMaybe: 3, notResponded: 1 });
  });
});

describe("roster helpers", () => {
  it("splits, trims and de-duplicates emails", () => {
    expect(parseEmailList(" a@x.com, b@x.com;A@x.com\nc@x.com ,, ")).toEqual([
      "a@x.com",
      "b@x.com",
      "c@x.com",
    ]);
  });
  it("maps RSVPs to the design's labels and tones", () => {
    expect(rsvpStatus(RSVP.yes)).toEqual({ label: "IN", tone: "lime" });
    expect(rsvpStatus(RSVP.maybe)).toEqual({ label: "MAYBE", tone: "amber" });
    expect(rsvpStatus(RSVP.no)).toEqual({ label: "OUT", tone: "pink" });
    expect(rsvpStatus(null)).toEqual({ label: "PENDING", tone: "cyan" });
  });
});

describe("event management tabs", () => {
  it("reads the tab from the query string", () => {
    expect(tabFromParam("seating")).toBe("seating");
    expect(tabFromParam("nope")).toBe("details");
    expect(tabFromParam(null)).toBe("details");
  });
  it("links to the room editor", () => {
    expect(roomEditorPath(12)).toBe("/admin/events/12/rooms");
  });
});
