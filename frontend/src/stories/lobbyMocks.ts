/**
 * Fake API data for the event lobby stories (Event, RSVPSummary, RSVPWizard,
 * EventAttendeeList, EventGameSuggestions). Register with `mockLobbyApi(id)`;
 * each story family uses its own event id so routes never clash.
 */
import { mockApi, mockResponse, type MockRequest } from "./mockApi";

const HOUR = 3600000;
const DAY = 24 * HOUR;
const iso = (ms: number) => new Date(ms).toISOString();
// Rounded so the countdown reads the same on every render of a session.
const base = Math.floor(Date.now() / 60000) * 60000;

/** A Friday 18:00 -> Sunday 16:00 (UTC) event two weeks out. */
export const lobbyTimes = (() => {
  const d = new Date(base + 14 * DAY);
  d.setUTCHours(18, 0, 0, 0);
  // Move to the next Friday (5).
  d.setUTCDate(d.getUTCDate() + ((5 - d.getUTCDay() + 7) % 7));
  const begin = d.getTime();
  return { begin, end: begin + 2 * DAY - 2 * HOUR };
})();

export const lobbyEvent = (id: number, title = "Autumn LAN 2026") => ({
  id,
  createdAt: iso(base - 30 * DAY),
  lastModified: iso(base - DAY),
  title,
  description:
    "A weekend of games, pizza and questionable sleep schedules. Doors open Friday at 6pm, lights out (optional) Sunday afternoon. Bring your rig, a long ethernet cable and a power strip.",
  image: null,
  timeBegin: iso(lobbyTimes.begin),
  timeEnd: iso(lobbyTimes.end),
});

// Buckets for a Fri 18:00 -> Sun 16:00 UTC event: FRI Evening, Overnight,
// SAT Morning..Overnight, SUN Morning, Afternoon = 8.
const ALL = [1, 1, 1, 1, 1, 1, 1, 1];

export const squad = (eventId: number) => [
  lite(eventId, "NoScope_Nia", "yes", ALL, 101),
  lite(eventId, "LagWizard", "yes", [0, 0, 1, 1, 1, 1, 1, 0], 106),
  lite(eventId, "SamTheSniper", "yes", [0, 0, 0, 1, 1, 1, 1, 1], 109),
  lite(eventId, "Dan_the_Man", "yes", ALL, null),
  lite(eventId, "ProGamer123", "yes", [1, 1, 1, 1, 1, 1, 0, 0], 104),
  lite(eventId, "CasualGamer", "maybe", [1, 0, 1, 0, 0, 0, 0, 0], 105),
  lite(eventId, "TiltedTom", "no", null, null),
  lite(eventId, null, null, null, null),
];

function lite(
  eventId: number,
  handle: string | null,
  response: string | null,
  attendance: number[] | null,
  seatId: number | null,
) {
  return {
    eventId,
    avatarUrl: null,
    handle,
    response,
    attendance,
    seatId,
    // The viewer in every lobby story is ProGamer123.
    isSelf: handle === "ProGamer123",
    // Dan_the_Man is floating (reservation without a seat).
    hasSeatReservation: seatId !== null || handle === "Dan_the_Man",
    lastModified: iso(base - DAY),
  };
}

/** What the user squad list returns: only yes/maybe guests, as the API does. */
const squadList = (
  eventId: number,
  response: LobbyMockOptions["response"],
  seatId: LobbyMockOptions["seatId"],
) =>
  squad(eventId)
    .map((a) =>
      a.isSelf
        ? {
            ...a,
            response: response ?? null,
            seatId: seatId ?? null,
            hasSeatReservation: seatId !== undefined,
          }
        : a,
    )
    .filter((a) => a.response === "yes" || a.response === "maybe");

const rsvpCounts = (
  eventId: number,
  response: LobbyMockOptions["response"],
) => {
  const all = squad(eventId).map((a) =>
    a.isSelf ? { ...a, response: response ?? null } : a,
  );
  const n = (r: string | null) => all.filter((a) => a.response === r).length;
  return { yes: n("yes"), maybe: n("maybe"), no: n("no"), pending: n(null) };
};

const gamer = (handle: string) => ({ handle, avatarUrl: null });
const G = [
  "NoScope_Nia",
  "LagWizard",
  "SamTheSniper",
  "Dan_the_Man",
  "ProGamer123",
  "CasualGamer",
].map(gamer);

const suggestion = (
  appid: number,
  name: string,
  votes: number,
  selfVote: "yes" | "noVote",
  by: string,
  owned: number,
  comment: string | null = null,
  userEmail = "someone@example.com",
) => ({
  appid,
  name,
  userEmail,
  comment,
  lastModified: iso(base - DAY),
  requestedAt: iso(base - 3 * DAY),
  suggestionLastModified: iso(base - DAY),
  selfVote,
  votes,
  voters: G.slice(0, votes),
  suggester: gamer(by),
  gamerOwned: G.slice(0, owned),
  gamerUnowned: G.slice(owned, 5),
  gamerUnknown: G.slice(5),
});

export const suggestions = () => [
  suggestion(730, "Counter-Strike 2", 4, "yes", "NoScope_Nia", 4),
  suggestion(
    548430,
    "Deep Rock Galactic",
    2,
    "yes",
    "ProGamer123",
    2,
    "Four-player co-op, perfect for the Saturday night slot. Rock and stone!",
    "sam@example.com",
  ),
  suggestion(427520, "Factorio", 1, "yes", "LagWizard", 3),
  suggestion(813780, "Age of Empires II: DE", 1, "noVote", "LagWizard", 1),
  suggestion(252950, "Rocket League", 0, "noVote", "SamTheSniper", 2),
];

export const steamSearch = [
  { appid: 1172470, name: "Apex Legends", last_modified: iso(base), rank: 1 },
  { appid: 892970, name: "Valheim", last_modified: iso(base), rank: 2 },
  { appid: 730, name: "Counter-Strike 2", last_modified: iso(base), rank: 3 },
];

export const rooms = (eventId: number) => [
  {
    id: 1,
    eventId,
    name: "Main Hall",
    description: null,
    image: null,
    sortOrder: 0,
    createdAt: iso(base),
    lastModified: iso(base),
    gridRows: 6,
    features: [
      { col: 4, row: 0, kind: "screen" },
      { col: 5, row: 0, kind: "screen" },
      { col: 6, row: 0, kind: "screen" },
      { col: 7, row: 0, kind: "screen" },
      { col: 6, row: 5, kind: "entrance" },
    ],
    backgroundUrl: null,
    backgroundStyle: "retro",
    backgroundOpacity: 0.6,
  },
];

export const seats = (eventId: number) =>
  ["A", "B", "C"].flatMap((row, r) =>
    [0, 1, 2, 3].map((i) => {
      const gridCol = 2 + i * 2;
      const gridRow = [1, 2, 4][r];
      return {
        id: 101 + r * 4 + i,
        eventId,
        roomId: 1,
        label: `${row}${i + 1}`,
        description: null,
        x: (gridCol + 0.5) / 12,
        y: (gridRow + 0.5) / 6,
        gridCol,
        gridRow,
        createdAt: iso(base),
        lastModified: iso(base),
      };
    }),
  );

export interface LobbyMockOptions {
  /** The viewer's RSVP (null = invited, not responded). */
  response?: "yes" | "maybe" | "no" | null;
  hasSeating?: boolean;
  /** Viewer's reserved seat id, `null` = unspecified (BYO), undefined = none. */
  seatId?: number | null;
  /** Make the invitation list / suggestions fail. */
  failLists?: boolean;
  /** Make seat reservation fail with a 409 reason. */
  seatConflict?: boolean;
  /** Override the event body (or a status code for errors). */
  event?: unknown;
}

/** Register every lobby route for `eventId`. */
export function mockLobbyApi(eventId: number, opts: LobbyMockOptions = {}) {
  const {
    response = "yes",
    hasSeating = true,
    seatId = 104,
    failLists = false,
    seatConflict = false,
  } = opts;
  const p = `/api/events/${eventId}`;
  const takenSeatIds = squad(eventId)
    .map((a) => a.seatId)
    .filter((s): s is number => s !== null && s !== seatId);
  mockApi({
    [`GET ${p}`]: opts.event ?? lobbyEvent(eventId),
    [`GET ${p}/invitations/:email`]: {
      eventId,
      email: "sam@example.com",
      avatarUrl: null,
      handle: response ? "ProGamer123" : "",
      invitedAt: iso(base - 20 * DAY),
      respondedAt: response ? iso(base - 2 * DAY) : null,
      response,
      attendance:
        response && response !== "no" ? [1, 1, 1, 1, 1, 1, 0, 0] : null,
      lastModified: iso(base - 2 * DAY),
    },
    [`PATCH ${p}/invitations/:email`]: () => mockResponse(204, undefined),
    [`GET ${p}/invitations`]: failLists
      ? () => mockResponse(500, { error: { code: 500 } })
      : squadList(eventId, response, seatId),
    [`GET ${p}/rsvp_counts`]: rsvpCounts(eventId, response),
    [`GET ${p}/suggested_games`]: failLists
      ? () => mockResponse(500, { error: { code: 500 } })
      : suggestions(),
    [`PATCH ${p}/suggested_games/:appid`]: ({ params, body }: MockRequest) => {
      const s = suggestions().find((g) => g.appid === Number(params.appid));
      if (!s) return mockResponse(404, undefined);
      const vote = (body as { vote: string }).vote;
      const had = s.selfVote === "yes";
      const now = vote === "yes";
      return {
        ...s,
        selfVote: vote,
        votes: s.votes + (now === had ? 0 : now ? 1 : -1),
      };
    },
    [`PUT ${p}/suggested_games/:appid/comment`]: ({
      params,
      body,
    }: MockRequest) => ({
      ...suggestions().find((g) => g.appid === Number(params.appid)),
      comment: (body as { comment: string | null }).comment,
    }),
    [`POST ${p}/suggested_games`]: ({ body }: MockRequest) => {
      const { appid, comment } = body as { appid: number; comment: string };
      const game = steamSearch.find((g) => g.appid === appid);
      return suggestion(
        appid,
        game?.name ?? `App ${appid}`,
        1,
        "yes",
        "ProGamer123",
        0,
        comment,
        "sam@example.com",
      );
    },
    "GET /api/steam-game": steamSearch,
    [`GET ${p}/seating-config`]: {
      eventId,
      hasSeating,
      allowUnspecifiedSeat: true,
      unspecifiedSeatLabel: "Bring my own seat",
      createdAt: iso(base),
      lastModified: iso(base),
    },
    [`GET ${p}/rooms`]: rooms(eventId),
    [`GET ${p}/rooms/:roomId`]: rooms(eventId)[0],
    [`GET ${p}/seats`]: seats(eventId),
    [`GET ${p}/seats/:seatId`]: ({ params }: MockRequest) =>
      seats(eventId).find((s) => s.id === Number(params.seatId)) ??
      mockResponse(404, undefined),
    [`GET ${p}/seat-reservations/me`]:
      seatId === undefined || !response || response === "no"
        ? () => mockResponse(204, undefined)
        : {
            id: 1,
            eventId,
            invitationEmail: "sam@example.com",
            seatId,
            attendanceBuckets: [1, 1, 1, 1, 1, 1, 0, 0],
            createdAt: iso(base),
            lastModified: iso(base),
          },
    [`POST ${p}/seat-reservations/check-availability`]: {
      availableSeatIds: seats(eventId)
        .map((s) => s.id)
        .filter((id) => !takenSeatIds.includes(id)),
    },
    [`DELETE ${p}/seat-reservations/me`]: () => mockResponse(204, undefined),
    [`POST ${p}/seat-reservations/me`]: seatConflict
      ? () =>
          mockResponse(409, {
            error: {
              code: 409,
              reason: "Conflict",
              description:
                "This seat is already reserved for one or more of the selected time buckets",
            },
          })
      : { id: 1 },
    [`GET ${p}/activity-ticker`]: { events: [] },
  });
}
