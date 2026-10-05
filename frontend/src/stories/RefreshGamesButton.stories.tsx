import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { http, HttpResponse } from "msw";
import { expect, userEvent, within } from "storybook/test";
import RefreshGamesButton, {
  SteamGameCacheCard,
} from "../components/RefreshGamesButton";
import { withUser } from "./mockApi";

// Renders the button with its state pre-set. Hooks cannot be called from a
// story's render function directly, since that is not a component.
const RefreshGamesButtonInState = ({
  loading,
  done,
}: {
  loading: boolean;
  done: boolean;
}) => {
  const loadingState = useState(loading);
  const doneState = useState(done);
  return (
    <RefreshGamesButton loadingState={loadingState} doneState={doneState} />
  );
};

/**
 * Fake of the background refresh: the POST starts it (202), the stats report
 * it running until `ms` have passed, then the new numbers. Results expire
 * after a minute so later stories start from the original cache again.
 */
let refreshStarted = 0;
let refreshLasts = 0;
const refreshState = () => {
  const age = Date.now() - refreshStarted;
  const running = refreshStarted > 0 && age < refreshLasts;
  const done = refreshStarted > 0 && !running && age < 60_000;
  return {
    gamesCached: done ? 48297 : 48213,
    lastRefreshed: done
      ? new Date().toISOString()
      : new Date(Date.now() - 3 * 86_400_000).toISOString(),
    refresh: {
      running,
      startedAt:
        running || done ? new Date(refreshStarted).toISOString() : null,
      gamesAdded: done ? 84 : null,
      error: null,
    },
  };
};

const stats = http.get("/api/steam-game-update-v2/stats", () =>
  HttpResponse.json(refreshState()),
);

const refreshOk = http.post("/api/steam-game-update-v2", () => {
  refreshStarted = Date.now();
  refreshLasts = 1200;
  return HttpResponse.json(
    {
      running: true,
      startedAt: new Date().toISOString(),
      gamesAdded: null,
      error: null,
    },
    { status: 202 },
  );
});

const meta = {
  title: "Components/RefreshGamesButton",
  component: RefreshGamesButton,
  parameters: {
    layout: "padded",
    msw: { handlers: { stats: [stats], refresh: [refreshOk] } },
  },
  decorators: [withUser({ isAdmin: true })],
  tags: ["autodocs"],
} satisfies Meta<typeof RefreshGamesButton>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The bare button (it shows "Refreshing…" while the POST runs). */
export const Default: Story = {};

export const Loading: Story = {
  render: () => <RefreshGamesButtonInState loading={true} done={false} />,
};

export const Done: Story = {
  render: () => <RefreshGamesButtonInState loading={false} done={true} />,
};

/** The Gamers page card: stats, button, progress bar and result text. */
export const CacheCard: Story = {
  render: () => <SteamGameCacheCard />,
};

/** Card after a successful refresh. */
export const CacheCardRefreshed: Story = {
  render: () => <SteamGameCacheCard />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: /refresh cache/i }),
    );
    await expect(
      await canvas.findByText(/84 new games added/, undefined, {
        timeout: 4000,
      }),
    ).toBeInTheDocument();
  },
};

/** Card whose refresh fails with a 500. */
export const CacheCardError: Story = {
  render: () => <SteamGameCacheCard />,
  parameters: {
    msw: {
      handlers: {
        refresh: [
          http.post("/api/steam-game-update-v2", () =>
            HttpResponse.json({ error: "Server error" }, { status: 500 }),
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

/** Stats endpoint unavailable: the card still offers the refresh. */
export const CacheCardStatsUnavailable: Story = {
  render: () => <SteamGameCacheCard />,
  parameters: {
    msw: {
      handlers: {
        stats: [
          http.get("/api/steam-game-update-v2/stats", () =>
            HttpResponse.json({}, { status: 500 }),
          ),
        ],
      },
    },
  },
};
