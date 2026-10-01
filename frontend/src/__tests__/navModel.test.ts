import { describe, expect, test } from "vitest";
import {
  buildBreadcrumb,
  eventNavItems,
  eventPhase,
  formatBreadcrumb,
  isActiveItem,
  parseRoute,
  pickActiveEvent,
  ADMIN_ITEMS,
  EVENTS_ITEM,
} from "../components/shell/navModel";

describe("parseRoute", () => {
  test.each([
    ["/", "signin", undefined],
    ["/verify_email/abc", "verify", undefined],
    ["/events", "events", undefined],
    ["/events/", "events", undefined],
    ["/events/7", "lobby", "7"],
    ["/events/7/games", "games", "7"],
    ["/events/7/seat-map", "seatmap", "7"],
    ["/events/7/schedule", "schedule", "7"],
    ["/account", "account", undefined],
    ["/admin/events", "adminEvents", undefined],
    ["/admin/events/7", "adminEvent", "7"],
    ["/admin/gamers", "gamers", undefined],
    ["/admin/audit", "audit", undefined],
    ["/nope", "unknown", undefined],
  ])("%s -> %s", (path, section, eventId) => {
    expect(parseRoute(path)).toEqual(
      eventId ? { section, eventId } : { section },
    );
  });
});

describe("room editor route", () => {
  it("is the admin event page with the rooms flag", () => {
    expect(parseRoute("/admin/events/7/rooms")).toEqual({
      section: "adminEvent",
      eventId: "7",
      rooms: true,
    });
  });
});

describe("breadcrumb", () => {
  test("event pages", () => {
    const crumbs = buildBreadcrumb(parseRoute("/events/7"), "Autumn LAN 2026");
    expect(formatBreadcrumb(crumbs)).toBe(
      "// EVENTS / AUTUMN LAN 2026 / LOBBY",
    );
    expect(crumbs[0].to).toBe("/events");
    expect(crumbs[1].to).toBe("/events/7");
    expect(crumbs[2].to).toBeUndefined();
    expect(
      formatBreadcrumb(buildBreadcrumb(parseRoute("/events/7/seat-map"), "X")),
    ).toBe("// EVENTS / X / SEAT MAP");
  });

  test("falls back to the id while the title loads", () => {
    expect(
      formatBreadcrumb(buildBreadcrumb(parseRoute("/events/7/games"))),
    ).toBe("// EVENTS / EVENT 7 / GAMES");
  });

  test("admin and plain pages", () => {
    expect(
      formatBreadcrumb(buildBreadcrumb(parseRoute("/admin/events/7"), "Fest")),
    ).toBe("// ADMIN / EVENTS / FEST");
    expect(formatBreadcrumb(buildBreadcrumb(parseRoute("/admin/audit")))).toBe(
      "// ADMIN / AUDIT LOG",
    );
    expect(formatBreadcrumb(buildBreadcrumb(parseRoute("/account")))).toBe(
      "// ACCOUNT",
    );
    expect(buildBreadcrumb(parseRoute("/nope"))).toEqual([]);
  });
});

describe("nav items", () => {
  test("event items only match the event being shown", () => {
    const [lobby, games] = eventNavItems(7);
    expect(isActiveItem(lobby, parseRoute("/events/7"), 7)).toBe(true);
    expect(isActiveItem(lobby, parseRoute("/events/8"), 7)).toBe(false);
    expect(isActiveItem(games, parseRoute("/events/7/games"), 7)).toBe(true);
    expect(games.requiresRsvp).toBe(true);
    expect(lobby.requiresRsvp).toBeFalsy();
  });

  test("Manage events covers the single-event admin page", () => {
    expect(isActiveItem(ADMIN_ITEMS[0], parseRoute("/admin/events/3"))).toBe(
      true,
    );
    expect(isActiveItem(EVENTS_ITEM, parseRoute("/events"))).toBe(true);
    expect(isActiveItem(EVENTS_ITEM, parseRoute("/events/3"))).toBe(false);
  });
});

describe("active event", () => {
  const e = (id: number, begin: number, end: number) => ({
    id,
    timeBegin: begin,
    timeEnd: end,
  });
  const now = 1000;

  test("phase", () => {
    expect(eventPhase(2000, 3000, now)).toBe("upcoming");
    expect(eventPhase(500, 3000, now)).toBe("live");
    expect(eventPhase(100, 500, now)).toBe("ended");
  });

  test("prefers a live event, else the soonest upcoming, never ended", () => {
    expect(
      pickActiveEvent(
        [e(1, 5000, 6000), e(2, 900, 2000), e(3, 2000, 3000)],
        now,
      )?.id,
    ).toBe(2);
    expect(pickActiveEvent([e(1, 5000, 6000), e(3, 2000, 3000)], now)?.id).toBe(
      3,
    );
    expect(pickActiveEvent([e(1, 10, 20)], now)).toBeNull();
  });
});
