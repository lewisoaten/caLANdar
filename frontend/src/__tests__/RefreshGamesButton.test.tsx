import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import RefreshGamesButton, {
  SteamGameCacheCard,
  safeDescription,
} from "../components/RefreshGamesButton";
import { renderAsAdmin } from "./adminTestUtils";

const THREE_DAYS_AGO = new Date(Date.now() - 3 * 86_400_000).toISOString();

const server = setupServer(
  http.get("/api/steam-game-update-v2/stats", ({ request }) => {
    if (new URL(request.url).searchParams.get("as_admin") !== "true") {
      return HttpResponse.json({}, { status: 307 });
    }
    return HttpResponse.json({
      gamesCached: 48213,
      lastRefreshed: THREE_DAYS_AGO,
    });
  }),
);

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const IDLE = { running: false, startedAt: null, gamesAdded: null, error: null };

/**
 * Stats that report `first` (the card's initial load) once, then `then` for
 * every poll after it.
 */
const statsSequence = (
  first: Record<string, unknown>,
  then: Record<string, unknown>,
) => {
  let calls = 0;
  return http.get("/api/steam-game-update-v2/stats", () =>
    HttpResponse.json(calls++ === 0 ? first : then),
  );
};

const refreshWith = (
  body: Record<string, unknown>,
  status = 200,
  wait = 0,
  seen?: { url?: string; auth?: string | null },
) =>
  http.post("/api/steam-game-update-v2", async ({ request }) => {
    if (seen) {
      seen.url = request.url;
      seen.auth = request.headers.get("Authorization");
    }
    if (wait) await delay(wait);
    return HttpResponse.json(body, { status });
  });

describe("RefreshGamesButton", () => {
  test("renders the Refresh cache action", () => {
    renderAsAdmin(<RefreshGamesButton />);
    expect(
      screen.getByRole("button", { name: /refresh cache/i }),
    ).toBeEnabled();
  });

  test("posts to the admin endpoint and is disabled while it runs", async () => {
    const seen: { url?: string; auth?: string | null } = {};
    server.use(
      refreshWith({ ...IDLE, running: true }, 202, 50, seen),
      http.get("/api/steam-game-update-v2/stats", () =>
        HttpResponse.json({
          gamesCached: 1,
          lastRefreshed: null,
          refresh: IDLE,
        }),
      ),
    );
    renderAsAdmin(<RefreshGamesButton />);
    await userEvent.click(screen.getByRole("button", { name: /refresh/i }));
    const busy = screen.getByRole("button", { name: /refreshing/i });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute("aria-busy", "true");
    await waitFor(
      () =>
        expect(
          screen.getByRole("button", { name: /refresh cache/i }),
        ).toBeEnabled(),
      { timeout: 5000 },
    );
    expect(new URL(seen.url!).pathname).toBe("/api/steam-game-update-v2");
    expect(new URL(seen.url!).searchParams.get("as_admin")).toBe("true");
    expect(seen.auth).toBe("Bearer admin-token");
  });

  test("signs out on 401", async () => {
    server.use(refreshWith({}, 401));
    const { dispatch } = renderAsAdmin(<RefreshGamesButton />);
    await userEvent.click(screen.getByRole("button", { name: /refresh/i }));
    await waitFor(() => expect(dispatch.signOut).toHaveBeenCalled());
  });
});

describe("SteamGameCacheCard", () => {
  test("shows the cache size and last refresh from the stats endpoint", async () => {
    renderAsAdmin(<SteamGameCacheCard />);
    const card = screen.getByRole("region", { name: "Steam game cache" });
    expect(
      await within(card).findByText(
        "48,213 games cached · refreshed 3 days ago",
      ),
    ).toBeInTheDocument();
  });

  test("shows an indeterminate bar while refreshing, then the result", async () => {
    const now = new Date().toISOString();
    server.use(
      refreshWith({ ...IDLE, running: true }, 202),
      statsSequence(
        { gamesCached: 48213, lastRefreshed: THREE_DAYS_AGO, refresh: IDLE },
        {
          gamesCached: 48297,
          lastRefreshed: now,
          refresh: { ...IDLE, startedAt: now, gamesAdded: 84 },
        },
      ),
    );
    renderAsAdmin(<SteamGameCacheCard />);
    await screen.findByText(/48,213 games cached/);
    await userEvent.click(
      screen.getByRole("button", { name: /refresh cache/i }),
    );

    expect(
      screen.getByText("Pulling the Steam games list…"),
    ).toBeInTheDocument();
    const bar = screen.getByRole("progressbar", {
      name: "Refreshing the Steam game cache",
    });
    expect(bar).not.toHaveAttribute("aria-valuenow");

    expect(
      await screen.findByText(
        "48,297 games cached · refreshed just now",
        {},
        { timeout: 5000 },
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/84 new games added/)).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  test("reports a refresh that fails in the background", async () => {
    server.use(
      refreshWith({ ...IDLE, running: true }, 202),
      statsSequence(
        { gamesCached: 48213, lastRefreshed: THREE_DAYS_AGO, refresh: IDLE },
        {
          gamesCached: 48213,
          lastRefreshed: THREE_DAYS_AGO,
          refresh: {
            ...IDLE,
            error: "Couldn't fetch the game list from Steam.",
          },
        },
      ),
    );
    renderAsAdmin(<SteamGameCacheCard />);
    await screen.findByText(/48,213 games cached/);
    await userEvent.click(
      screen.getByRole("button", { name: /refresh cache/i }),
    );
    expect(
      await screen.findByText(
        "Refresh failed: Couldn't fetch the game list from Steam.",
        {},
        { timeout: 5000 },
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /refresh cache/i }),
    ).toBeEnabled();
  });

  test("follows a refresh that was already running when the page loaded", async () => {
    server.use(
      statsSequence(
        {
          gamesCached: 48213,
          lastRefreshed: THREE_DAYS_AGO,
          refresh: { ...IDLE, running: true },
        },
        {
          gamesCached: 48300,
          lastRefreshed: new Date().toISOString(),
          refresh: { ...IDLE, gamesAdded: 87 },
        },
      ),
    );
    renderAsAdmin(<SteamGameCacheCard />);
    expect(
      await screen.findByRole("progressbar", {
        name: "Refreshing the Steam game cache",
      }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(/87 new games added/, {}, { timeout: 5000 }),
    ).toBeInTheDocument();
  });

  test("reports a failed refresh inline and keeps the old stats", async () => {
    server.use(refreshWith({ error: "boom" }, 500));
    renderAsAdmin(<SteamGameCacheCard />);
    await screen.findByText(/48,213 games cached/);
    await userEvent.click(
      screen.getByRole("button", { name: /refresh cache/i }),
    );
    expect(
      await screen.findByText(/Refresh failed \(error 500\)/),
    ).toBeInTheDocument();
    // Reported once, inline in the card's live region: no duplicate toast.
    expect(screen.getAllByText(/refresh failed/i)).toHaveLength(1);
    expect(screen.queryByText(/Couldn't refresh/)).toBeNull();
    expect(screen.getByText(/48,213 games cached/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /refresh cache/i }),
    ).toBeEnabled();
  });

  test("shows the server's explanation when it gives one", async () => {
    server.use(
      refreshWith(
        {
          error: {
            code: 500,
            reason: "Internal Server Error",
            description: "Couldn't fetch the game list from Steam.",
          },
        },
        500,
      ),
    );
    renderAsAdmin(<SteamGameCacheCard />);
    await screen.findByText(/48,213 games cached/);
    await userEvent.click(
      screen.getByRole("button", { name: /refresh cache/i }),
    );
    expect(
      await screen.findByText(
        "Refresh failed: Couldn't fetch the game list from Steam.",
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Couldn't fetch/)).toHaveLength(1);
  });

  test("still offers the refresh when stats are unavailable", async () => {
    server.use(
      http.get("/api/steam-game-update-v2/stats", () =>
        HttpResponse.json({}, { status: 500 }),
      ),
    );
    renderAsAdmin(<SteamGameCacheCard />);
    expect(
      await screen.findByText("Cache stats unavailable"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /refresh cache/i }),
    ).toBeEnabled();
  });
});

describe("safeDescription", () => {
  test("keeps short plain explanations, drops markup and walls of text", () => {
    expect(safeDescription(" Steam is down. ")).toBe("Steam is down.");
    expect(safeDescription(undefined)).toBeUndefined();
    expect(
      safeDescription("Error: status 403: <html><body>Forbidden</body></html>"),
    ).toBeUndefined();
    expect(safeDescription("x".repeat(201))).toBeUndefined();
  });
});
