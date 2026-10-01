import { act, renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import {
  AUDIT_GROUPS,
  auditTone,
  buildAuditChips,
  formatAgo,
  formatAuditTime,
  formatCount,
  isLibraryStale,
  isValidSteamInput,
  rangeToFromTimestamp,
  useDebouncedValue,
} from "../components/adminListUtils";

const NOW = Date.UTC(2026, 8, 30, 12, 0);
const minutes = (n: number) => new Date(NOW - n * 60_000).toISOString();
const days = (n: number) => minutes(n * 24 * 60);

describe("formatAgo", () => {
  test.each([
    [minutes(0), "just now"],
    [new Date(NOW + 5000).toISOString(), "just now"],
    [minutes(5), "5m ago"],
    [minutes(20 * 60), "20h ago"],
    [days(1), "1 day ago"],
    [days(3), "3 days ago"],
    [days(59), "59 days ago"],
    [days(90), "3 months ago"],
    [days(400), "1 year ago"],
    [days(800), "2 years ago"],
  ])("%s -> %s", (input, expected) => {
    expect(formatAgo(input, NOW)).toBe(expected);
  });

  test("empty for null and invalid input", () => {
    expect(formatAgo(null, NOW)).toBe("");
    expect(formatAgo("not a date", NOW)).toBe("");
  });
});

describe("isLibraryStale", () => {
  test("stale when never synced or older than 30 days", () => {
    expect(isLibraryStale(null, NOW)).toBe(true);
    expect(isLibraryStale(days(31), NOW)).toBe(true);
    expect(isLibraryStale(days(29), NOW)).toBe(false);
    expect(isLibraryStale(minutes(1), NOW)).toBe(false);
  });
});

test("formatCount groups thousands", () => {
  expect(formatCount(48297)).toBe("48,297");
  expect(formatCount(1234567)).toBe("1,234,567");
  expect(formatCount(84)).toBe("84");
});

describe("isValidSteamInput", () => {
  test.each([
    "76561197960287930",
    " 76561197960287930 ",
    "https://steamcommunity.com/profiles/76561197960287930/",
    "steamcommunity.com/profiles/76561197960287930",
    "http://www.steamcommunity.com/id/gabelogannewell",
    "https://steamcommunity.com/id/some_vanity-1/",
  ])("accepts %s", (v) => expect(isValidSteamInput(v)).toBe(true));

  test.each([
    "",
    "1234",
    "7656119796028793012",
    "https://example.com/id/foo",
    "https://steamcommunity.com/profiles/123",
    "https://steamcommunity.com/id/",
  ])("rejects %s", (v) => expect(isValidSteamInput(v)).toBe(false));
});

test("rangeToFromTimestamp", () => {
  expect(rangeToFromTimestamp("all", NOW)).toBeNull();
  expect(rangeToFromTimestamp("1", NOW)).toBe("2026-09-29T12:00:00.000Z");
  expect(rangeToFromTimestamp("7", NOW)).toBe("2026-09-23T12:00:00.000Z");
  expect(rangeToFromTimestamp("30", NOW)).toBe("2026-08-31T12:00:00.000Z");
});

describe("buildAuditChips", () => {
  test("shows every group when the type list is unknown", () => {
    const chips = buildAuditChips(null);
    expect(chips.map((c) => c.id)).toEqual([
      "all",
      ...AUDIT_GROUPS.map((g) => g.id),
    ]);
    expect(chips[0].types).toEqual([]);
    expect(chips.find((c) => c.id === "rsvp")?.types).toEqual([
      "rsvp",
      "invitation",
    ]);
  });

  test("hides groups with no entries and collects unknown types", () => {
    const chips = buildAuditChips(["auth", "rsvp", "widget", "gizmo"]);
    expect(chips.map((c) => c.id)).toEqual(["all", "rsvp", "system", "other"]);
    expect(chips.at(-1)?.types).toEqual(["widget", "gizmo"]);
  });
});

test("auditTone maps entity types to design colours", () => {
  expect(auditTone("event")).toBe("cyan");
  expect(auditTone("seat_reservation")).toBe("violet");
  expect(auditTone("email")).toBe("amber");
  expect(auditTone("rsvp")).toBe("lime");
  expect(auditTone("game_vote")).toBe("pink");
  expect(auditTone("steam_games")).toBe("neutral");
  expect(auditTone("something_new")).toBe("neutral");
});

test("formatAuditTime adds the year only for other years", () => {
  const sameYear = new Date(2026, 8, 30, 9, 5).toISOString();
  const lastYear = new Date(2025, 11, 1, 22, 38).toISOString();
  expect(formatAuditTime(sameYear, NOW)).toBe("30 SEP 09:05");
  expect(formatAuditTime(lastYear, NOW)).toBe("01 DEC 2025 22:38");
});

describe("useDebouncedValue", () => {
  test("settles after the delay and only calls onSettle on real changes", () => {
    vi.useFakeTimers();
    try {
      const onSettle = vi.fn();
      const { result, rerender } = renderHook(
        ({ v }) => useDebouncedValue(v, 300, onSettle),
        { initialProps: { v: "" } },
      );
      // Mount never settles (would clobber a URL-restored page).
      act(() => vi.advanceTimersByTime(1000));
      expect(onSettle).not.toHaveBeenCalled();

      rerender({ v: "ni" });
      act(() => vi.advanceTimersByTime(299));
      expect(result.current).toBe("");
      rerender({ v: "nia" });
      act(() => vi.advanceTimersByTime(300));
      expect(result.current).toBe("nia");
      expect(onSettle).toHaveBeenCalledTimes(1);
      expect(onSettle).toHaveBeenLastCalledWith("nia");

      // Typing and undoing within the delay is not a change.
      rerender({ v: "niab" });
      rerender({ v: "nia" });
      act(() => vi.advanceTimersByTime(1000));
      expect(onSettle).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
