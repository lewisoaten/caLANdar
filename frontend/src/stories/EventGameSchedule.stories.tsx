import type { Meta, StoryObj } from "@storybook/react";
import EventGameSchedule from "../components/EventGameSchedule";
import { mockApi, withRoute, withUser } from "./mockApi";

// Fixed weekend: Friday 13 Nov 2026 18:00 to Sunday 15 Nov 2026 12:00.
// Timestamps carry no timezone so they render identically everywhere.
const event = (id: number, title: string) => ({
  id,
  title,
  description: "Three days of co-op, RTS and late-night shooters.",
  image: null,
  timeBegin: "2026-11-13T18:00:00",
  timeEnd: "2026-11-15T12:00:00",
  createdAt: "2026-09-01T10:00:00",
  lastModified: "2026-10-20T09:30:00",
});

const gamer = (handle: string) => ({ handle, avatarUrl: null });
const nightOwl = gamer("NightOwl");
const fragQueen = gamer("FragQueen");
const bigMike = gamer("BigMike_NI");
const pixelPete = gamer("PixelPete");
const lagLord = gamer("LagLord");
const tankJoe = gamer("TankJoe");

const suggestion = (
  appid: number,
  name: string,
  votes: number,
  requestedAt: string,
  suggester: ReturnType<typeof gamer>,
  voters: ReturnType<typeof gamer>[],
  owned: ReturnType<typeof gamer>[],
  comment: string | null,
) => ({
  appid,
  name,
  userEmail: "",
  comment,
  lastModified: "2026-10-18T12:00:00",
  requestedAt,
  suggestionLastModified: "2026-10-18T12:00:00",
  selfVote: "noVote",
  votes,
  voters,
  suggester,
  gamerOwned: owned,
  gamerUnowned: voters.filter((v) => !owned.includes(v)),
  gamerUnknown: [],
});

const suggestions = [
  suggestion(
    550,
    "Left 4 Dead 2",
    5,
    "2026-10-01T09:00:00",
    nightOwl,
    [nightOwl, fragQueen, bigMike, pixelPete, lagLord],
    [nightOwl, fragQueen, bigMike, pixelPete],
    "Friday night tradition. Bring snacks.",
  ),
  suggestion(
    548430,
    "Deep Rock Galactic",
    4,
    "2026-10-02T09:00:00",
    fragQueen,
    [fragQueen, bigMike, tankJoe, nightOwl],
    [fragQueen, bigMike, tankJoe],
    "Rock and Stone!",
  ),
  suggestion(
    730,
    "Counter-Strike 2",
    3,
    "2026-10-03T09:00:00",
    bigMike,
    [bigMike, lagLord, tankJoe],
    [bigMike, lagLord, tankJoe],
    null,
  ),
  suggestion(
    813780,
    "Age of Empires II: Definitive Edition",
    2,
    "2026-10-04T09:00:00",
    pixelPete,
    [pixelPete, nightOwl],
    [pixelPete],
    "Team games, 2v2v2.",
  ),
  suggestion(
    553850,
    "Helldivers 2",
    2,
    "2026-10-05T09:00:00",
    tankJoe,
    [tankJoe, fragQueen],
    [tankJoe, fragQueen],
    null,
  ),
  suggestion(
    252950,
    "Rocket League",
    1,
    "2026-10-06T09:00:00",
    lagLord,
    [lagLord],
    [lagLord],
    null,
  ),
  suggestion(
    976730,
    "Halo: The Master Chief Collection",
    1,
    "2026-10-07T09:00:00",
    bigMike,
    [bigMike],
    [bigMike],
    "Sunday morning wind-down.",
  ),
];

const entry = (
  id: number,
  eventId: number,
  gameId: number,
  gameName: string,
  startTime: string,
  durationMinutes: number,
  isPinned: boolean,
  isSuggested: boolean,
) => ({
  id,
  eventId,
  gameId,
  gameName,
  startTime,
  durationMinutes,
  isPinned,
  isSuggested,
  createdAt: "2026-10-10T10:00:00",
  lastModified: "2026-10-10T10:00:00",
});

const scheduleFor = (eventId: number) => [
  entry(
    1,
    eventId,
    550,
    "Left 4 Dead 2",
    "2026-11-13T19:00:00",
    120,
    true,
    false,
  ),
  entry(
    2,
    eventId,
    548430,
    "Deep Rock Galactic",
    "2026-11-13T21:30:00",
    150,
    true,
    false,
  ),
  entry(
    3,
    eventId,
    813780,
    "Age of Empires II: Definitive Edition",
    "2026-11-14T10:00:00",
    180,
    false,
    true,
  ),
  entry(
    4,
    eventId,
    730,
    "Counter-Strike 2",
    "2026-11-14T14:00:00",
    180,
    true,
    false,
  ),
  entry(
    5,
    eventId,
    553850,
    "Helldivers 2",
    "2026-11-14T18:30:00",
    120,
    false,
    true,
  ),
  entry(
    6,
    eventId,
    252950,
    "Rocket League",
    "2026-11-14T21:00:00",
    90,
    false,
    true,
  ),
  entry(
    7,
    eventId,
    976730,
    "Halo: The Master Chief Collection",
    "2026-11-15T10:00:00",
    120,
    false,
    true,
  ),
];

// Attendance buckets: Fri eve, Sat night/morning/afternoon/eve, Sun night/morning/afternoon.
const invite = (
  eventId: number,
  handle: string,
  response: string,
  attendance: number[] | null,
) => ({
  eventId,
  avatarUrl: null,
  handle,
  response,
  attendance,
  seatId: null,
  lastModified: "2026-10-15T18:00:00",
});

const invitationsFor = (eventId: number) => [
  invite(eventId, "NightOwl", "yes", [1, 1, 1, 1, 1, 1, 1, 0]),
  invite(eventId, "FragQueen", "yes", [1, 0, 1, 1, 1, 0, 1, 0]),
  invite(eventId, "BigMike_NI", "yes", [1, 1, 1, 1, 1, 1, 0, 0]),
  invite(eventId, "PixelPete", "yes", [0, 0, 1, 1, 1, 0, 0, 0]),
  invite(eventId, "LagLord", "maybe", [0, 0, 0, 1, 1, 0, 0, 0]),
  invite(eventId, "TankJoe", "yes", [1, 0, 0, 1, 1, 1, 1, 0]),
];

// Each story owns an event id so the page-global fetch mocks never clash.
mockApi({
  // 301: populated schedule, member view
  "GET /api/events/301": event(301, "Autumn LAN: Rock and Stone"),
  "GET /api/events/301/game_schedule": scheduleFor(301),
  "GET /api/events/301/suggested_games": suggestions,
  "GET /api/events/301/invitations": invitationsFor(301),
  // 302: populated schedule, admin view
  "GET /api/events/302": event(302, "Autumn LAN: Rock and Stone"),
  "GET /api/events/302/game_schedule": scheduleFor(302),
  "GET /api/events/302/suggested_games": suggestions,
  "GET /api/events/302/invitations": invitationsFor(302),
  // 303: empty schedule, admin view
  "GET /api/events/303": event(303, "Autumn LAN: Rock and Stone"),
  "GET /api/events/303/game_schedule": [],
  "GET /api/events/303/suggested_games": suggestions,
  "GET /api/events/303/invitations": invitationsFor(303),
  // 304: empty schedule, member view
  "GET /api/events/304": event(304, "Autumn LAN: Rock and Stone"),
  "GET /api/events/304/game_schedule": [],
  "GET /api/events/304/suggested_games": [],
  "GET /api/events/304/invitations": [],
});

const meta = {
  title: "Components/EventGameSchedule",
  component: EventGameSchedule,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof EventGameSchedule>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Member view of a weekend with pinned games and suggested (grey) games. */
export const PopulatedMember: Story = {
  decorators: [
    withRoute("/events/:id", "/events/301"),
    withUser({ isAdmin: false }),
  ],
};

/** Admin view: drag handles, recalculate button and the add-game FAB. */
export const PopulatedAdmin: Story = {
  decorators: [
    withRoute("/events/:id", "/events/302"),
    withUser({ isAdmin: true }),
  ],
};

/** Admin with nothing scheduled yet: prompts to add games from the menu. */
export const EmptyAdmin: Story = {
  decorators: [
    withRoute("/events/:id", "/events/303"),
    withUser({ isAdmin: true }),
  ],
};

/** Member view before any games have been scheduled. */
export const EmptyMember: Story = {
  decorators: [
    withRoute("/events/:id", "/events/304"),
    withUser({ isAdmin: false }),
  ],
};
