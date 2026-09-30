/**
 * Shared fake API + router for the app-shell stories (Dashboard, MenuItems,
 * ActivityTicker). Event 901 is the "active" upcoming event.
 */
import { MemoryRouter } from "react-router-dom";
import type { Decorator } from "@storybook/react-vite";
import { mockApi } from "./mockApi";
import type { ActivityTickerEvent } from "../components/ActivityTicker";

const DAY = 86400000;
const iso = (ms: number) => new Date(ms).toISOString();
// Rounded so the countdown reads the same on every render of a session.
const base = Math.floor(Date.now() / 60000) * 60000;

export const SHELL_EVENT_ID = 901;

export const shellEvent = {
  id: SHELL_EVENT_ID,
  createdAt: iso(base - 30 * DAY),
  lastModified: iso(base - DAY),
  title: "Autumn LAN 2026",
  description:
    "A weekend of games, pizza and questionable sleep schedules. Bring your rig, a long ethernet cable and a power strip.",
  image: null,
  timeBegin: iso(base + 15 * DAY + 18 * 3600000 + 43 * 60000),
  timeEnd: iso(base + 17 * DAY + 16 * 3600000),
};

export const tickerItems: ActivityTickerEvent[] = [
  {
    id: 1,
    timestamp: iso(base - 60000),
    message: "NoScope_Nia voted for Counter-Strike 2",
    icon: "👍",
    eventType: "game_vote",
    userHandle: "NoScope_Nia",
  },
  {
    id: 2,
    timestamp: iso(base - 120000),
    message: "LagWizard claimed B2 · Main Hall",
    icon: "🪑",
    eventType: "seat_reservation",
    userHandle: "LagWizard",
  },
  {
    id: 3,
    timestamp: iso(base - 180000),
    message: "CasualGamer might join us 🙋",
    icon: "🙋",
    eventType: "rsvp",
    userHandle: "CasualGamer",
  },
  {
    id: 4,
    timestamp: iso(base - 240000),
    message: "SamTheSniper is coming to the party! 🎉",
    icon: "🎉",
    eventType: "rsvp",
    userHandle: "SamTheSniper",
  },
  {
    id: 5,
    timestamp: iso(base - 300000),
    message: "ProGamer123 suggested Age of Empires II",
    icon: "🎮",
    eventType: "game_suggestion",
    userHandle: "ProGamer123",
  },
  {
    id: 6,
    timestamp: iso(base - 360000),
    message: "Autumn LAN 2026 was created",
    icon: "🎊",
    eventType: "event_create",
  },
];

/** Register the shell's API routes. `response` is the viewer's RSVP. */
export function mockShellApi(response: "yes" | "maybe" | "no" | null = "yes") {
  mockApi({
    "GET /api/events": {
      events: [shellEvent],
      total: 1,
      page: 1,
      limit: 50,
      totalPages: 1,
    },
    [`GET /api/events/${SHELL_EVENT_ID}`]: shellEvent,
    [`GET /api/events/${SHELL_EVENT_ID}/invitations/:email`]: {
      eventId: SHELL_EVENT_ID,
      email: "lewis@example.com",
      avatarUrl: null,
      handle: "ProGamer123",
      invitedAt: iso(base - 20 * DAY),
      respondedAt: response ? iso(base - 2 * DAY) : null,
      response,
      attendance: [1, 1, 1, 1, 1, 1, 1, 1],
      lastModified: iso(base - 2 * DAY),
    },
    [`GET /api/events/${SHELL_EVENT_ID}/activity-ticker`]: {
      events: tickerItems,
    },
  });
}

/** Mount the story under its own router at `path` (set `router: false`). */
export const atPath = (path: string): Decorator =>
  function AtPath(Story) {
    return (
      <MemoryRouter initialEntries={[path]}>
        <Story />
      </MemoryRouter>
    );
  };

/** Placeholder page body so the shell has something to lay out. */
export function DemoPage({ title = "Lobby" }: { title?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <div
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11,
            letterSpacing: "0.18em",
            color: "#7c87a6",
          }}
        >
          {"// PAGE CONTENT"}
        </div>
        <h1
          style={{
            margin: "6px 0 0",
            fontSize: "clamp(34px,4.4vw,52px)",
            fontWeight: 700,
            textTransform: "uppercase",
            lineHeight: 1,
          }}
        >
          {title}
        </h1>
      </div>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            height: 220,
            border: "1px solid rgba(54,230,255,0.16)",
            background: "rgba(12,15,24,0.85)",
          }}
        />
      ))}
    </div>
  );
}
