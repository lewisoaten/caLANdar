import type { Decorator, Meta, StoryObj } from "@storybook/react-vite";
import Box from "@mui/material/Box";
import { sectionGap } from "../components/hl";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { delay, http, HttpResponse } from "msw";
import GamersAdmin from "../components/GamersAdmin";
import { mockApi, withUser, type MockRequest } from "./mockApi";

const HOUR = 3_600_000;
const NOW = Date.now();
const ago = (hours: number | null) =>
  hours == null ? null : new Date(NOW - hours * HOUR).toISOString();

// The API returns ISO strings; the component parses them into moments.
interface MockGamer {
  email: string;
  avatarUrl: string | null;
  handles: string[];
  callsign: string | null;
  steamId: string | null;
  steamLinked: boolean;
  eventsInvitedCount: number;
  eventsAcceptedCount: number;
  eventsTentativeCount: number;
  eventsDeclinedCount: number;
  eventsLastResponse: string | null;
  gamesOwnedCount: number;
  gamesOwnedLastModified: string | null;
}

const CORE: Array<[string, string | null, string | null]> = [
  ["lewis@example.com", "ProGamer123", "yes"],
  ["nia@example.com", "NoScope_Nia", "yes"],
  ["lag@example.com", "LagWizard", "yes"],
  ["casual@example.com", "CasualGamer", "maybe"],
  ["sam@example.com", "SamTheSniper", "yes"],
  ["dan@example.com", "Dan_the_Man", "yes"],
  ["tom@example.com", "TiltedTom", "no"],
  ["zoe@example.com", null, null],
];
const EXTRA = [
  "PixelPaladin",
  "FragQueen",
  "RespawnRay",
  "CritHitKat",
  "ByteKnight",
  "NullPointer",
  "TurboTess",
  "GankLord",
  "MidOrFeed",
  "AFK_Alex",
  "HeadshotHana",
  "ClutchMaster",
  "NoobSlayer",
  "QuickScopeQ",
  "LootGoblin",
  "SpawnCamper",
  "RageQuitRob",
  "GGEZ_Ella",
  "TankTheo",
  "HealsPlz",
  "StealthySteph",
  "OneTapTaz",
  "CampfireCal",
];
const NO_STEAM = ["AFK_Alex", "HealsPlz"];
const RESPONSES = ["yes", "maybe", "no", null];

const gamers: MockGamer[] = [
  ...CORE,
  ...EXTRA.map(
    (h, i) =>
      [
        h.toLowerCase().replace(/_/g, ".") + "@example.com",
        h,
        RESPONSES[i % 4],
      ] as [string, string, string | null],
  ),
].map(([email, handle, r], i) => {
  const steam = !!handle && !NO_STEAM.includes(handle);
  const gamesHours = steam
    ? [2, 5, 26, 70, 190, 400, 900, 1300][(i * 5) % 8] + i
    : null;
  return {
    email,
    avatarUrl: null,
    handles: handle ? (i === 2 ? [handle, "Lagz"] : [handle]) : [],
    callsign: handle,
    steamId: steam ? `765611980123456${String(i).padStart(2, "0")}` : null,
    steamLinked: steam,
    eventsInvitedCount: 3 + (i % 4),
    eventsAcceptedCount: r === "yes" ? 2 + (i % 3) : i % 2,
    eventsTentativeCount: r === "maybe" ? 1 + (i % 2) : 0,
    eventsDeclinedCount: r === "no" ? 1 : 0,
    eventsLastResponse: ago(r ? 20 + ((i * 37) % 60) * 24 : null),
    gamesOwnedCount: steam ? 30 + ((i * 53) % 400) : 0,
    gamesOwnedLastModified: ago(gamesHours),
  };
});

const isStale = (g: MockGamer) =>
  g.steamLinked &&
  (!g.gamesOwnedLastModified ||
    NOW - Date.parse(g.gamesOwnedLastModified) > 30 * 24 * HOUR);

const time = (v: string | null) => (v ? Date.parse(v) : -Infinity);

mockApi({
  // Same response as the MSW `statsHandler` below, so static previews (no MSW)
  // show the cache banner too.
  "GET /api/steam-game-update-v2/stats": () => ({
    gamesCached: 48213,
    lastRefreshed: ago(72),
  }),
  "GET /api/gamers": (req: MockRequest) => {
    const page = Number(req.query.get("page") ?? "1");
    const limit = Number(req.query.get("limit") ?? "20");
    const search = (req.query.get("search") ?? "").toLowerCase();
    const filter = req.query.get("filter") ?? "all";
    const sort = req.query.get("sort") ?? "email";

    const base = search
      ? gamers.filter(
          (g) =>
            g.email.toLowerCase().includes(search) ||
            g.handles.some((h) => h.toLowerCase().includes(search)),
        )
      : gamers;
    const tests: Record<string, (g: MockGamer) => boolean> = {
      all: () => true,
      steam: (g) => g.steamLinked,
      no_steam: (g) => !g.steamLinked,
      stale_library: isStale,
    };
    const matching = base.filter(tests[filter] ?? tests.all);
    const sorters: Record<string, (a: MockGamer, b: MockGamer) => number> = {
      email: (a, b) => a.email.localeCompare(b.email),
      last_rsvp: (a, b) =>
        time(b.eventsLastResponse) - time(a.eventsLastResponse),
      games_updated: (a, b) =>
        time(b.gamesOwnedLastModified) - time(a.gamesOwnedLastModified),
      callsign: (a, b) => (a.callsign ?? "~").localeCompare(b.callsign ?? "~"),
    };
    matching.sort(sorters[sort] ?? sorters.email);

    return {
      gamers: matching.slice((page - 1) * limit, page * limit),
      total: matching.length,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(matching.length / limit)),
      counts: {
        all: base.length,
        steam: base.filter(tests.steam).length,
        noSteam: base.filter(tests.no_steam).length,
        staleLibrary: base.filter(tests.stale_library).length,
      },
    };
  },
  "PUT /api/profile/:email": (req: MockRequest) => {
    const g = gamers.find((x) => x.email === req.params.email);
    const steamId = (req.body as { steamId?: string })?.steamId ?? "";
    if (g) {
      g.steamId = steamId;
      g.steamLinked = true;
    }
    return { email: req.params.email, steamId, games: [], gameCount: 0 };
  },
});

const statsHandler = http.get("/api/steam-game-update-v2/stats", () =>
  HttpResponse.json({
    gamesCached: 48213,
    lastRefreshed: ago(72),
  }),
);

const refreshOk = (ms: number) =>
  http.post("/api/steam-game-update-v2", async () => {
    await delay(ms);
    return HttpResponse.json({
      gamesCached: 48297,
      gamesAdded: 84,
      lastRefreshed: new Date().toISOString(),
    });
  });

/** Mimics the shell's <main>: a flex column with the section gap. */
const withPageFrame: Decorator = (Story) => (
  <Box sx={{ display: "flex", flexDirection: "column", gap: sectionGap }}>
    <Story />
  </Box>
);

const meta = {
  title: "Components/GamersAdmin",
  component: GamersAdmin,
  parameters: {
    layout: "padded",
    msw: { handlers: { stats: [statsHandler], refresh: [refreshOk(1500)] } },
  },
  decorators: [withPageFrame, withUser({ isAdmin: true })],
  tags: ["autodocs"],
} satisfies Meta<typeof GamersAdmin>;

export default meta;
type Story = StoryObj<typeof meta>;

/** First page of 9 of 31 gamers, sorted by last RSVP, with the cache card. */
export const Default: Story = {};

/** Admin searches by callsign; the cards and filter counts narrow. */
export const SearchByCallsign: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      await canvas.findByLabelText("Search email or callsign"),
      "scope",
    );
    await waitFor(
      () => expect(canvas.queryByText("lewis@example.com")).toBeNull(),
      { timeout: 3000 },
    );
    await canvas.findByText("NoScope_Nia");
  },
};

/** "Library 30d+ old" filter: every card shows the amber stale warning. */
export const StaleLibraries: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: /library 30d\+ old/i }),
    );
    await waitFor(() =>
      expect(
        canvas.getByRole("button", { name: /library 30d\+ old/i }),
      ).toHaveAttribute("aria-pressed", "true"),
    );
  },
};

/** Search with no matches shows the empty state with "Clear filters". */
export const NoResults: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      await canvas.findByLabelText("Search email or callsign"),
      "zzzz-no-such-gamer",
    );
    await canvas.findByText("No gamers match those filters.", undefined, {
      timeout: 3000,
    });
  },
};

/** Clicking "Refresh cache": indeterminate bar, then the new totals. */
export const RefreshCache: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: /refresh cache/i }),
    );
    await canvas.findByText("Pulling the Steam games list…");
    await canvas.findByText(
      /48,297 games cached · refreshed just now/,
      undefined,
      {
        timeout: 4000,
      },
    );
  },
};

/** Refresh in flight (the POST never resolves in this story). */
export const Refreshing: Story = {
  parameters: {
    msw: { handlers: { refresh: [refreshOk(10 * 60_000)] } },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: /refresh cache/i }),
    );
    await canvas.findByRole("button", { name: /refreshing/i });
  },
};

/** The refresh fails: inline error in the card plus an error toast. */
export const RefreshFails: Story = {
  parameters: {
    msw: {
      handlers: {
        refresh: [
          http.post("/api/steam-game-update-v2", () =>
            HttpResponse.json(
              { error: { code: 500, description: "Steam is down" } },
              { status: 500 },
            ),
          ),
        ],
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: /refresh cache/i }),
    );
    await canvas.findByText(/Refresh failed/);
  },
};

/** Editing a gamer's Steam ID from their card. */
export const EditSteamId: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", {
        name: "Edit Steam ID for lewis@example.com",
      }),
    );
    const dialog = within(document.body).getByRole("dialog");
    await expect(dialog).toBeInTheDocument();
  },
};

/** Signed-in non-admin sees the permission error. */
export const NotAdmin: Story = {
  decorators: [withUser({ isAdmin: false })],
};
