import type { ComponentType } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Route, Routes } from "react-router-dom";
import Account from "../components/Account";
import Dashboard from "../components/Dashboard";
import {
  mockApi,
  mockResponse,
  stubImages,
  withUser,
  type MockRequest,
} from "./mockApi";
import { atPath, mockShellApi } from "./shellMocks";

const NAMES = [
  "Counter-Strike 2",
  "Factorio",
  "Deep Rock Galactic",
  "Dota 2",
  "Team Fortress 2",
  "Left 4 Dead 2",
  "Age of Empires II: DE",
  "Rocket League",
  "Portal 2",
  "Terraria",
  "Valheim",
  "Baldur's Gate 3",
  "Stardew Valley",
  "RimWorld",
  "Cities: Skylines",
  "Elden Ring",
  "The Witcher 3",
  "Cyberpunk 2077: Phantom Liberty Ultimate Edition",
  "Grand Theft Auto V",
  "PUBG: Battlegrounds",
  "Rainbow Six Siege",
  "Rust",
  "Don't Starve Together",
  "Dead by Daylight",
  "Phasmophobia",
  "Among Us",
  "Apex Legends",
  "PAYDAY 2",
  "Garry's Mod",
  "Civilization VI",
  "Warframe",
  "Hollow Knight",
  "Slay the Spire",
  "Hades",
  "Subnautica",
  "Satisfactory",
];
const APPIDS = [
  730, 427520, 548430, 570, 440, 550, 813780, 252950, 620, 105600, 892970,
  1086940, 413150, 294100, 255710, 1245620, 292030, 1091500, 271590, 578080,
  359550, 252490, 322330, 381210, 739630, 945360, 1172470, 218620, 4000, 289070,
  230410, 367520, 646570, 1145360, 264710, 526870,
];
const PLAY = [98430, 41250, 12960, 9020, 7310, 3400, 2210, 1800, 1260, 745, 26];

const library = NAMES.map((name, i) => ({
  appid: APPIDS[i],
  name,
  playtimeForever: PLAY[i] ?? (i % 4 === 0 ? 0 : (APPIDS[i] * 7919) % 1700),
  lastModified: "2026-09-30T08:00:00Z",
}));

type Scenario = "linked" | "unlinked" | "empty" | "error";
let scenario: Scenario = "linked";
let steamId = "76561197960287930";

const me = {
  email: "lewis@example.com",
  avatarUrl: null,
  isAdmin: false,
  callsigns: [
    {
      handle: "ProGamer123",
      eventCount: 3,
      lastEventId: 901,
      lastEventTitle: "Autumn LAN 2026",
      lastUsed: "2026-10-16T17:00:00Z",
    },
    {
      handle: "PG",
      eventCount: 1,
      lastEventId: 900,
      lastEventTitle: "Summer LAN 2026",
      lastUsed: "2026-06-12T17:00:00Z",
    },
  ],
};

const profile = ({ query }: MockRequest) => {
  if (scenario === "unlinked")
    return query.get("optional") === "true"
      ? mockResponse(204, undefined)
      : mockResponse(404, { error: { code: 404 } });
  if (scenario === "error") return mockResponse(500, { error: { code: 500 } });
  const games = scenario === "empty" ? [] : library;
  const page = Number(query.get("page") ?? 0);
  const count = Number(query.get("count") ?? 10);
  const search = (query.get("search") ?? "").toLowerCase();
  const sorted = games
    .filter((g) => g.name.toLowerCase().includes(search))
    .sort((a, b) =>
      query.get("sort") === "name"
        ? a.name.localeCompare(b.name)
        : b.playtimeForever - a.playtimeForever || a.name.localeCompare(b.name),
    );
  return {
    email: "lewis@example.com",
    steamId,
    games: sorted.slice(page * count, (page + 1) * count),
    gameCount: Math.ceil(sorted.length / count),
    totalGames: sorted.length,
    libraryGames: games.length,
    maxPlaytimeForever: Math.max(0, ...games.map((g) => g.playtimeForever)),
    lastSynced: new Date(Date.now() - 2 * 3600000).toISOString(),
    avatarUrl: null,
  };
};

mockApi({
  "GET /api/me": me,
  "GET /api/profile": profile,
  "PUT /api/profile": ({ body }: MockRequest) => {
    const input = String((body as { steamId: string }).steamId);
    if (input.includes("/id/nobody"))
      return mockResponse(400, {
        error: {
          code: 400,
          reason: "Bad Request",
          description: 'No Steam profile found for custom URL "nobody"',
        },
      });
    steamId = /\d{17}/.exec(input)?.[0] ?? "76561198000000042";
    if (scenario === "unlinked") scenario = "linked";
    return { email: "lewis@example.com", steamId, games: [], gameCount: 0 };
  },
  "POST /api/profile/games/update": () =>
    new Promise((resolve) =>
      setTimeout(() => resolve({ email: "lewis@example.com", steamId }), 1400),
    ),
});

stubImages();

const withScenario = (s: Scenario) =>
  function ScenarioDecorator(Story: ComponentType) {
    scenario = s;
    return <Story />;
  };

const meta = {
  title: "Pages/Account",
  component: Account,
  parameters: { layout: "padded" },
  decorators: [withUser({ email: "lewis@example.com" })],
} satisfies Meta<typeof Account>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithSteamLibrary: Story = { decorators: [withScenario("linked")] };

/** No Steam ID saved yet: GET /profile?optional=true is 204, the form is open. */
export const NoSteamProfile: Story = { decorators: [withScenario("unlinked")] };

export const EmptyLibrary: Story = { decorators: [withScenario("empty")] };

export const LoadError: Story = { decorators: [withScenario("error")] };

/** The page inside the app shell. */
export const InShell: Story = {
  parameters: { layout: "fullscreen", router: false },
  render: () => (
    <Dashboard>
      <Routes>
        <Route path="/account" element={<Account />} />
      </Routes>
    </Dashboard>
  ),
  decorators: [
    withScenario("linked"),
    (Story) => {
      mockShellApi("yes");
      return <Story />;
    },
    atPath("/account"),
  ],
};
