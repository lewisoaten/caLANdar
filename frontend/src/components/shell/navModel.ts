/**
 * Pure navigation model for the app shell: which section a URL belongs to,
 * the breadcrumb kicker and the nav item lists. Kept free of React so it can
 * be unit tested (see src/__tests__/navModel.test.ts).
 */

export type ShellSection =
  | "signin"
  | "verify"
  | "events"
  | "lobby"
  | "games"
  | "seatmap"
  | "schedule"
  | "account"
  | "adminEvents"
  | "adminEvent"
  | "gamers"
  | "audit"
  | "unknown";

export interface ShellRoute {
  section: ShellSection;
  /** Event id from `/events/:id/...` or `/admin/events/:id`. */
  eventId?: string;
}

/** The four per-event pages (they get the event sub-nav and live ticker). */
export const EVENT_SECTIONS = [
  "lobby",
  "games",
  "seatmap",
  "schedule",
] as const;
export type EventSection = (typeof EVENT_SECTIONS)[number];

export const isEventSection = (s: ShellSection): s is EventSection =>
  (EVENT_SECTIONS as readonly string[]).includes(s);

/** Map a pathname to a shell section (mirrors the routes in Views.tsx). */
export function parseRoute(pathname: string): ShellRoute {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/") return { section: "signin" };
  if (path === "/verify_email" || path.startsWith("/verify_email/"))
    return { section: "verify" };
  if (path === "/events") return { section: "events" };
  const ev = /^\/events\/([^/]+)(?:\/(games|seat-map|schedule))?$/.exec(path);
  if (ev) {
    const sub = ev[2];
    const section: EventSection =
      sub === "games"
        ? "games"
        : sub === "seat-map"
          ? "seatmap"
          : sub === "schedule"
            ? "schedule"
            : "lobby";
    return { section, eventId: ev[1] };
  }
  if (path === "/account") return { section: "account" };
  if (path === "/admin/events") return { section: "adminEvents" };
  const admin = /^\/admin\/events\/([^/]+)$/.exec(path);
  if (admin) return { section: "adminEvent", eventId: admin[1] };
  if (path === "/admin/gamers") return { section: "gamers" };
  if (path === "/admin/audit") return { section: "audit" };
  return { section: "unknown" };
}

/** Sections rendered without the app chrome (full-screen auth pages). */
export const isBareSection = (s: ShellSection) =>
  s === "signin" || s === "verify";

const LABELS: Record<ShellSection, string> = {
  signin: "Sign in",
  verify: "Verify",
  events: "Events",
  lobby: "Lobby",
  games: "Games",
  seatmap: "Seat map",
  schedule: "Schedule",
  account: "Account",
  adminEvents: "Manage events",
  adminEvent: "Manage events",
  gamers: "Gamers",
  audit: "Audit log",
  unknown: "",
};

export interface Crumb {
  /** Upper-cased label. */
  label: string;
  /** Link target; absent for the current page. */
  to?: string;
}

/**
 * Breadcrumb for the top bar, e.g. EVENTS / AUTUMN LAN 2026 / LOBBY.
 * `eventTitle` fills the event segment when it is known.
 */
export function buildBreadcrumb(
  route: ShellRoute,
  eventTitle?: string | null,
): Crumb[] {
  const title = (eventTitle || (route.eventId ? `EVENT ${route.eventId}` : ""))
    .toUpperCase()
    .trim();
  const s = route.section;
  if (isEventSection(s))
    return [
      { label: "EVENTS", to: "/events" },
      { label: title, to: `/events/${route.eventId}` },
      { label: LABELS[s].toUpperCase() },
    ];
  if (s === "adminEvent")
    return [
      { label: "ADMIN" },
      { label: "EVENTS", to: "/admin/events" },
      { label: title },
    ];
  if (s === "adminEvents" || s === "gamers" || s === "audit")
    return [{ label: "ADMIN" }, { label: LABELS[s].toUpperCase() }];
  if (s === "unknown") return [];
  return [{ label: LABELS[s].toUpperCase() }];
}

/** Breadcrumb as one kicker string: `// EVENTS / AUTUMN LAN / GAMES`. */
export const formatBreadcrumb = (crumbs: Crumb[]) =>
  `// ${crumbs
    .map((c) => c.label)
    .filter(Boolean)
    .join(" / ")}`;

export type NavKey =
  "events" | EventSection | "account" | "adminEvents" | "gamers" | "audit";

export interface NavItem {
  key: NavKey;
  label: string;
  /** Short label for the mobile tab bar. */
  short: string;
  to: string;
  /** Games/Seat map/Schedule need a Yes/Maybe RSVP. */
  requiresRsvp?: boolean;
}

export const eventNavItems = (eventId: string | number): NavItem[] => [
  { key: "lobby", label: "Lobby", short: "Lobby", to: `/events/${eventId}` },
  {
    key: "games",
    label: "Games",
    short: "Games",
    to: `/events/${eventId}/games`,
    requiresRsvp: true,
  },
  {
    key: "seatmap",
    label: "Seat map",
    short: "Seats",
    to: `/events/${eventId}/seat-map`,
    requiresRsvp: true,
  },
  {
    key: "schedule",
    label: "Schedule",
    short: "Sched",
    to: `/events/${eventId}/schedule`,
    requiresRsvp: true,
  },
];

export const EVENTS_ITEM: NavItem = {
  key: "events",
  label: "Events",
  short: "Events",
  to: "/events",
};

export const ACCOUNT_ITEM: NavItem = {
  key: "account",
  label: "Account",
  short: "Account",
  to: "/account",
};

export const ADMIN_ITEMS: NavItem[] = [
  {
    key: "adminEvents",
    label: "Manage events",
    short: "Manage",
    to: "/admin/events",
  },
  { key: "gamers", label: "Gamers", short: "Gamers", to: "/admin/gamers" },
  { key: "audit", label: "Audit log", short: "Audit", to: "/admin/audit" },
];

/**
 * Whether `item` is the current page. Event items only match the event being
 * shown, and "Manage events" also covers a single event's admin page.
 */
export function isActiveItem(
  item: NavItem,
  route: ShellRoute,
  navEventId?: string | number | null,
): boolean {
  if (isEventSection(item.key)) {
    return (
      route.section === item.key &&
      navEventId != null &&
      route.eventId === String(navEventId)
    );
  }
  if (item.key === "adminEvents")
    return route.section === "adminEvents" || route.section === "adminEvent";
  return route.section === item.key;
}

type Millis = { valueOf(): number };

export type EventPhase = "upcoming" | "live" | "ended";

/** Where `now` falls relative to an event's start/end. */
export function eventPhase(
  timeBegin: Millis,
  timeEnd: Millis,
  now: Millis,
): EventPhase {
  const n = now.valueOf();
  if (n < timeBegin.valueOf()) return "upcoming";
  if (n < timeEnd.valueOf()) return "live";
  return "ended";
}

/**
 * The event the sidebar card should feature: a live event first (the one that
 * started most recently), otherwise the next one to start. Ended events are
 * never picked.
 */
export function pickActiveEvent<
  T extends { timeBegin: Millis; timeEnd: Millis },
>(events: readonly T[], now: Millis): T | null {
  const live = events
    .filter((e) => eventPhase(e.timeBegin, e.timeEnd, now) === "live")
    .sort((a, b) => b.timeBegin.valueOf() - a.timeBegin.valueOf());
  if (live.length) return live[0];
  const upcoming = events
    .filter((e) => eventPhase(e.timeBegin, e.timeEnd, now) === "upcoming")
    .sort((a, b) => a.timeBegin.valueOf() - b.timeBegin.valueOf());
  return upcoming[0] ?? null;
}
