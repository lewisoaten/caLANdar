import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { delay, http, HttpResponse } from "msw";
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

const stats = http.get("/api/steam-game-update-v2/stats", () =>
  HttpResponse.json({
    gamesCached: 48213,
    lastRefreshed: new Date(Date.now() - 3 * 86_400_000).toISOString(),
  }),
);

const refreshOk = http.post("/api/steam-game-update-v2", async () => {
  await delay(1200);
  return HttpResponse.json({
    gamesCached: 48297,
    gamesAdded: 84,
    lastRefreshed: new Date().toISOString(),
  });
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
