/**
 * Fixtures and a fake `GET /api/events?as_admin=true` for the Manage events
 * stories: search, status filter with counts and server-side pagination, like
 * the real endpoint.
 */
import type { MockRequest } from "./mockApi";
import { mockResponse } from "./mockApi";

type Status = "live" | "draft" | "ended";

// [title, begin, end, invited, yes, maybe, no, status] - from the design.
const ROWS: Array<
  [string, string, string, number, number, number, number, Status]
> = [
  [
    "Autumn LAN 2026",
    "2026-10-16T18:00:00Z",
    "2026-10-18T16:00:00Z",
    8,
    5,
    1,
    1,
    "live",
  ],
  [
    "Winter Frag Fest",
    "2026-12-04T18:00:00Z",
    "2026-12-05T22:00:00Z",
    6,
    2,
    1,
    0,
    "live",
  ],
  [
    "New Year LAN",
    "2027-01-01T12:00:00Z",
    "2027-01-03T16:00:00Z",
    5,
    0,
    1,
    0,
    "draft",
  ],
  [
    "Spring Clean Sweep",
    "2027-03-12T18:00:00Z",
    "2027-03-14T16:00:00Z",
    0,
    0,
    0,
    0,
    "draft",
  ],
  [
    "Summer LAN 2026",
    "2026-07-17T18:00:00Z",
    "2026-07-19T16:00:00Z",
    7,
    6,
    0,
    1,
    "ended",
  ],
  [
    "Retro Night",
    "2026-06-06T18:00:00Z",
    "2026-06-06T23:30:00Z",
    9,
    7,
    1,
    1,
    "ended",
  ],
  [
    "Spring LAN 2026",
    "2026-04-10T18:00:00Z",
    "2026-04-12T16:00:00Z",
    8,
    6,
    1,
    1,
    "ended",
  ],
  [
    "Factorio Mega Base",
    "2026-03-14T10:00:00Z",
    "2026-03-14T23:00:00Z",
    5,
    4,
    0,
    1,
    "ended",
  ],
  [
    "Valentine’s Fragfest",
    "2026-02-14T18:00:00Z",
    "2026-02-14T23:59:00Z",
    6,
    3,
    2,
    1,
    "ended",
  ],
  [
    "New Year LAN 2026",
    "2026-01-02T12:00:00Z",
    "2026-01-04T16:00:00Z",
    10,
    8,
    1,
    1,
    "ended",
  ],
  [
    "Winter LAN 2025",
    "2025-12-05T18:00:00Z",
    "2025-12-07T16:00:00Z",
    9,
    7,
    2,
    0,
    "ended",
  ],
  [
    "Halloween Horror Night",
    "2025-10-31T19:00:00Z",
    "2025-10-31T23:59:00Z",
    7,
    5,
    1,
    1,
    "ended",
  ],
  [
    "Autumn LAN 2025",
    "2025-10-17T18:00:00Z",
    "2025-10-19T16:00:00Z",
    8,
    7,
    0,
    1,
    "ended",
  ],
  [
    "Summer LAN 2025",
    "2025-07-18T18:00:00Z",
    "2025-07-20T16:00:00Z",
    6,
    5,
    1,
    0,
    "ended",
  ],
  [
    "First LAN",
    "2025-06-14T12:00:00Z",
    "2025-06-14T23:00:00Z",
    4,
    4,
    0,
    0,
    "ended",
  ],
];

export interface MockAdminEvent {
  id: number;
  title: string;
  description: string;
  image: null;
  timeBegin: string;
  timeEnd: string;
  createdAt: string;
  lastModified: string;
  status: Status;
  rsvp: {
    invited: number;
    yes: number;
    maybe: number;
    no: number;
    pending: number;
  };
}

export const adminEvents: MockAdminEvent[] = ROWS.map(
  ([title, timeBegin, timeEnd, invited, yes, maybe, no, status], i) => ({
    id: 501 + i,
    title,
    description: `${title}: bring your rig, a long ethernet cable and a power strip.`,
    image: null,
    timeBegin,
    timeEnd,
    createdAt: "2025-05-01T10:00:00Z",
    lastModified: "2026-09-01T10:00:00Z",
    status,
    rsvp: { invited, yes, maybe, no, pending: invited - yes - maybe - no },
  }),
);

/** Which data set the events handler serves (set by a story decorator). */
export const eventsScenario: { mode: "data" | "empty" | "error" | "slow" } = {
  mode: "data",
};

/** Paginated, filtered admin events list. */
export function adminEventsHandler({ query }: MockRequest) {
  if (eventsScenario.mode === "error")
    return mockResponse(500, {
      error: {
        code: 500,
        reason: "Internal Server Error",
        description: "boom",
      },
    });
  const source = eventsScenario.mode === "empty" ? [] : adminEvents;
  const page = Math.max(1, Number(query.get("page") ?? 1));
  const limit = Math.max(1, Number(query.get("limit") ?? 20));
  const search = (query.get("search") ?? "").toLowerCase();
  const status = query.get("status") ?? "all";
  const searched = source.filter((e) => e.title.toLowerCase().includes(search));
  const list =
    status === "all" ? searched : searched.filter((e) => e.status === status);
  const count = (s: Status) => searched.filter((e) => e.status === s).length;
  const body = {
    events: list.slice((page - 1) * limit, page * limit),
    total: list.length,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(list.length / limit)),
    counts: {
      all: searched.length,
      live: count("live"),
      draft: count("draft"),
      ended: count("ended"),
    },
  };
  if (eventsScenario.mode === "slow")
    return new Promise((resolve) => setTimeout(() => resolve(body), 60_000));
  return body;
}
