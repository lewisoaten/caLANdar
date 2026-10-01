/**
 * Pure helpers shared by the admin list screens (Gamers, Audit log) and the
 * Steam game cache card. Kept free of React so they are easy to unit test.
 */
import { useEffect, useRef, useState } from "react";
import moment from "moment";
import type { HlTone } from "./hl";

type TimeLike = moment.MomentInput | null | undefined;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Days after which a gamer's synced Steam library counts as stale. */
export const STALE_LIBRARY_DAYS = 30;

const plural = (n: number, unit: string) =>
  `${n} ${unit}${n === 1 ? "" : "s"} ago`;

/**
 * Compact relative time for list meta: `just now`, `5m ago`, `20h ago`,
 * `3 days ago`, `2 months ago`, `1 year ago`. Future times read `just now`.
 */
export function formatAgo(value: TimeLike, now: number = Date.now()): string {
  if (value == null) return "";
  const t = moment(value);
  if (!t.isValid()) return "";
  const diff = now - t.valueOf();
  if (diff < MINUTE) return "just now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  const days = Math.floor(diff / DAY);
  if (days < 60) return plural(days, "day");
  if (days < 365) return plural(Math.round(days / 30), "month");
  return plural(Math.floor(days / 365), "year");
}

/** True when a library sync is missing or older than {@link STALE_LIBRARY_DAYS}. */
export function isLibraryStale(
  lastModified: TimeLike,
  now: number = Date.now(),
): boolean {
  if (lastModified == null) return true;
  const t = moment(lastModified);
  if (!t.isValid()) return true;
  return now - t.valueOf() > STALE_LIBRARY_DAYS * DAY;
}

/** `48,297` style grouping, independent of the browser locale. */
export const formatCount = (n: number) =>
  Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/**
 * Accepts what the API's Steam ID parser accepts: a 17-digit SteamID64 or a
 * steamcommunity.com `/profiles/<id>` or `/id/<vanity>` URL.
 */
export function isValidSteamInput(input: string): boolean {
  const v = input.trim();
  if (/^\d{17}$/.test(v)) return true;
  return /^(https?:\/\/)?(www\.)?steamcommunity\.com\/(profiles\/\d{17}|id\/[A-Za-z0-9_-]{2,64})\/?$/i.test(
    v,
  );
}

/** Returns `value` once it has stopped changing for `delay` ms. */
export function useDebouncedValue<T>(
  value: T,
  delay: number,
  onSettle?: (value: T) => void,
): T {
  const [debounced, setDebounced] = useState(value);
  const settle = useRef(onSettle);
  useEffect(() => {
    settle.current = onSettle;
  });
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value);
      settle.current?.(value);
    }, delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

export type AuditRange = "1" | "7" | "30" | "all";

export const AUDIT_RANGES: ReadonlyArray<{ id: AuditRange; label: string }> = [
  { id: "1", label: "Last 24 hours" },
  { id: "7", label: "Last 7 days" },
  { id: "30", label: "Last 30 days" },
  { id: "all", label: "All time" },
];

/** RFC 3339 (UTC, `Z`) lower bound for a range, or null for "all". */
export function rangeToFromTimestamp(
  range: AuditRange,
  now: number = Date.now(),
): string | null {
  if (range === "all") return null;
  return new Date(now - Number(range) * DAY).toISOString();
}

/** Entity-type chip groups (design chips → API `entity_types`). */
export const AUDIT_GROUPS = [
  { id: "event", label: "Events", types: ["event", "event_seating_config"] },
  { id: "rsvp", label: "RSVPs", types: ["rsvp", "invitation"] },
  {
    id: "seat",
    label: "Seating",
    types: ["seat", "room", "seat_reservation"],
  },
  {
    id: "game",
    label: "Games",
    types: ["game_suggestion", "game_vote", "steam_games", "profile"],
  },
  { id: "system", label: "System", types: ["auth", "email"] },
] as const;

export interface AuditChip {
  id: string;
  label: string;
  /** Entity types sent as `entity_types`; empty for "All". */
  types: string[];
}

/**
 * Chips to show for the entity types present in the log. Groups with no
 * present type are hidden; types no group covers go under "Other". With no
 * list (still loading, or the request failed) every group is shown.
 */
export function buildAuditChips(present: string[] | null): AuditChip[] {
  const all: AuditChip = { id: "all", label: "All", types: [] };
  if (!present) {
    return [all, ...AUDIT_GROUPS.map((g) => ({ ...g, types: [...g.types] }))];
  }
  const known = new Set<string>(AUDIT_GROUPS.flatMap((g) => g.types));
  const chips: AuditChip[] = [all];
  for (const g of AUDIT_GROUPS) {
    if (g.types.some((t) => present.includes(t))) {
      chips.push({ ...g, types: [...g.types] });
    }
  }
  const other = present.filter((t) => !known.has(t));
  if (other.length) chips.push({ id: "other", label: "Other", types: other });
  return chips;
}

/** Colour of an action label, by entity type (the text says the same). */
export function auditTone(entityType: string): HlTone {
  switch (entityType) {
    case "event":
      return "cyan";
    case "event_seating_config":
    case "room":
    case "seat":
    case "seat_reservation":
      return "violet";
    case "invitation":
    case "email":
      return "amber";
    case "auth":
    case "rsvp":
    case "profile":
      return "lime";
    case "game_suggestion":
    case "game_vote":
      return "pink";
    default:
      return "neutral";
  }
}

/** `30 SEP 09:00` (local time); the year is added when it is not this year. */
export function formatAuditTime(
  value: moment.MomentInput,
  now: number = Date.now(),
): string {
  const t = moment(value);
  if (!t.isValid()) return "";
  const sameYear = t.year() === moment(now).year();
  return t
    .format(sameYear ? "DD MMM HH:mm" : "DD MMM YYYY HH:mm")
    .toUpperCase();
}
