import type { Meta, StoryObj } from "@storybook/react-vite";
import { Route, Routes } from "react-router-dom";
import EventGames from "../components/EventGames";
import Dashboard from "../components/Dashboard";
import {
  mockApi,
  mockResponse,
  stubImages,
  withRoute,
  withUser,
  type MockRequest,
} from "./mockApi";
import { SHELL_EVENT_ID, atPath, mockShellApi, shellEvent } from "./shellMocks";

const HANDLES = [
  "ProGamer123",
  "NoScope_Nia",
  "LagWizard",
  "CasualGamer",
  "SamTheSniper",
  "Dan_the_Man",
];
const gamer = (i: number) => ({ handle: HANDLES[i], avatarUrl: null });

const LIBRARY: Array<[number, string, number[], number]> = [
  [730, "Counter-Strike 2", [0, 1, 2, 4, 5], 98430],
  [548430, "Deep Rock Galactic", [0, 1, 2, 5], 12960],
  [427520, "Factorio", [0, 2, 4, 5], 41250],
  [892970, "Valheim", [1, 2, 3, 4], 4300],
  [813780, "Age of Empires II: Definitive Edition", [0, 2, 5], 2210],
  [105600, "Terraria", [1, 3, 4], 745],
  [550, "Left 4 Dead 2", [0, 4], 3400],
  [252950, "Rocket League", [1, 4], 1800],
  [570, "Dota 2", [2, 5], 9020],
  [440, "Team Fortress 2", [0, 3], 7310],
  [620, "Portal 2", [1], 1260],
  [1086940, "Baldur's Gate 3", [5], 0],
  [413150, "Stardew Valley", [3], 2400],
  [294100, "RimWorld", [2], 5300],
];

const eventGames = LIBRARY.map(([appid, name, owners, mins]) => ({
  appid,
  name,
  gamerOwned: owners.map(gamer),
  playtimeForever: mins,
  lastModified: "2026-09-01T12:00:00Z",
})).sort((a, b) => b.gamerOwned.length - a.gamerOwned.length);

const suggestion = (appid: number, votes: number) => {
  const g = eventGames.find((x) => x.appid === appid)!;
  return {
    appid,
    name: g.name,
    userEmail: "lewis@example.com",
    comment: null,
    lastModified: "2026-09-01T12:00:00Z",
    requestedAt: "2026-09-01T12:00:00Z",
    suggestionLastModified: "2026-09-01T12:00:00Z",
    selfVote: "noVote",
    votes,
    voters: [],
    suggester: gamer(0),
    gamerOwned: g.gamerOwned,
    gamerUnowned: [],
    gamerUnknown: [],
  };
};

const invitations = HANDLES.map((handle, i) => ({
  eventId: SHELL_EVENT_ID,
  avatarUrl: null,
  handle,
  response: i === 5 ? "maybe" : "yes",
  attendance: null,
  seatId: null,
  lastModified: "2026-09-01T12:00:00Z",
}));

/** Register the Games endpoints for one event id. */
function mockGamesApi(eventId: number, opts: { ended?: boolean } = {}) {
  const votes: Record<number, number> = {
    730: 5,
    548430: 3,
    427520: 2,
    813780: 1,
    252950: 1,
  };
  mockApi({
    [`GET /api/events/${eventId}/games`]: ({ query }: MockRequest) => {
      const page = Number(query.get("page") ?? 0);
      const count = Number(query.get("count") ?? 10);
      return {
        eventGames: eventGames.slice(page * count, (page + 1) * count),
        totalCount: Math.ceil(eventGames.length / count),
      };
    },
    [`GET /api/events/${eventId}/suggested_games`]: () =>
      Object.entries(votes).map(([id, v]) => suggestion(Number(id), v)),
    [`POST /api/events/${eventId}/suggested_games`]: ({
      body,
    }: MockRequest) => {
      const { appid } = body as { appid: number };
      if (votes[appid]) return mockResponse(500, { error: { code: 500 } });
      votes[appid] = 1;
      return mockResponse(201, suggestion(appid, 1));
    },
    [`GET /api/events/${eventId}/invitations`]: invitations,
    [`GET /api/events/${eventId}/invitations/:email`]: {
      ...invitations[0],
      email: "lewis@example.com",
      invitedAt: "2026-09-01T12:00:00Z",
      respondedAt: "2026-09-02T12:00:00Z",
    },
    [`GET /api/events/${eventId}`]: {
      ...shellEvent,
      id: eventId,
      ...(opts.ended
        ? { timeBegin: "2025-01-01T10:00:00Z", timeEnd: "2025-01-03T10:00:00Z" }
        : {}),
    },
  });
}

stubImages();
mockGamesApi(701);
mockGamesApi(702, { ended: true });
mockApi({
  "GET /api/events/703/games": () =>
    new Promise(() => {
      /* never resolves: loading state */
    }),
  "GET /api/events/704/games": mockResponse(500, {
    error: { code: 500, reason: "Internal Server Error", description: "db" },
  }),
  "GET /api/events/705/games": { eventGames: [], totalCount: 0 },
});

const meta = {
  title: "Pages/EventGames",
  component: EventGames,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  decorators: [withUser({ email: "lewis@example.com" })],
} satisfies Meta<typeof EventGames>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  decorators: [withRoute("/events/:id/games", "/events/701/games")],
};

export const EventEnded: Story = {
  decorators: [withRoute("/events/:id/games", "/events/702/games")],
};

export const Loading: Story = {
  decorators: [withRoute("/events/:id/games", "/events/703/games")],
};

export const LoadError: Story = {
  decorators: [withRoute("/events/:id/games", "/events/704/games")],
};

export const NoGames: Story = {
  decorators: [withRoute("/events/:id/games", "/events/705/games")],
};

/** The page inside the app shell (sidebar, breadcrumb, ticker). */
export const InShell: Story = {
  parameters: { layout: "fullscreen", router: false },
  render: () => (
    <Dashboard>
      <Routes>
        <Route path="/events/:id/games" element={<EventGames />} />
      </Routes>
    </Dashboard>
  ),
  decorators: [
    (Story) => {
      mockGamesApi(SHELL_EVENT_ID);
      mockShellApi("yes");
      return <Story />;
    },
    atPath(`/events/${SHELL_EVENT_ID}/games`),
  ],
};
