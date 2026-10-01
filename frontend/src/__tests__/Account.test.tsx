import { describe, test, expect, beforeAll, afterEach, afterAll } from "vitest";
import { render, screen, waitFor, within } from "../test/test-utils";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import Account, {
  resyncError,
  steamIdSaveError,
  syncSummary,
} from "../components/Account";
import { ApiError } from "../utils/apiError";
import {
  formatLibraryHours,
  playtimePercent,
} from "../components/AccountLibrary";

const mockProfile = {
  email: "u@example.com",
  steamId: "76561198000000000",
  games: [
    { appid: 730, name: "Counter-Strike 2", playtimeForever: 6000 },
    { appid: 620, name: "Portal 2", playtimeForever: 0 },
  ],
  gameCount: 1,
  totalGames: 2,
  libraryGames: 2,
  maxPlaytimeForever: 6000,
  lastSynced: null,
  avatarUrl: null,
};

const mockMe = {
  email: "u@example.com",
  avatarUrl: null,
  isAdmin: false,
  callsigns: [
    {
      handle: "ProGamer123",
      eventCount: 3,
      lastEventId: 1,
      lastEventTitle: "Autumn LAN 2026",
      lastUsed: "2026-10-16T17:00:00Z",
    },
  ],
};

let lastProfileQuery: URLSearchParams | null = null;

const server = setupServer(
  http.get("/api/me", () => HttpResponse.json(mockMe)),
  http.get("/api/profile", ({ request }) => {
    lastProfileQuery = new URL(request.url).searchParams;
    return HttpResponse.json(mockProfile, { status: 200 });
  }),
);

beforeAll(() => {
  server.listen({ onUnhandledRequest: "bypass" });
});

afterEach(() => {
  server.resetHandlers();
  lastProfileQuery = null;
});

afterAll(() => {
  server.close();
});

describe("Account helpers", () => {
  test("formatLibraryHours", () => {
    expect(formatLibraryHours(0)).toBe("Unplayed");
    expect(formatLibraryHours(10)).toBe("1 h");
    expect(formatLibraryHours(98430)).toBe("1,641 h");
  });

  test("playtimePercent", () => {
    expect(playtimePercent(0, 100)).toBe(0);
    expect(playtimePercent(50, 100)).toBe(50);
    expect(playtimePercent(1, 100000)).toBe(1);
    expect(playtimePercent(10, 0)).toBe(0);
  });

  test("syncSummary", () => {
    expect(syncSummary(70, 68, false)).toBe(
      "Library synced just now. 70 games, 2 new.",
    );
    expect(syncSummary(1, null, true)).toBe(
      "Library synced just now from your new Steam ID. 1 game.",
    );
  });
});

describe("Account error messages", () => {
  test("steamIdSaveError prefers the server's client-error reason", () => {
    const err = new ApiError("Save", 400, "No Steam profile found");
    expect(steamIdSaveError(err, "x")).toBe("No Steam profile found");
  });

  test("steamIdSaveError explains Steam lookups failing without a status", () => {
    const err = new ApiError("Save", 500, "Error updating profile, due to: db");
    const vanity = steamIdSaveError(err, "steamcommunity.com/id/someone");
    expect(vanity).toMatch(/couldn't look up that custom url/i);
    expect(vanity).not.toMatch(/500|db/);
    expect(steamIdSaveError(err, "76561197960287930")).toMatch(
      /couldn't save your steam id/i,
    );
  });

  test("resyncError hides server internals", () => {
    expect(resyncError(new ApiError("Refresh", 500, "panic"))).toMatch(
      /couldn't refresh your games/i,
    );
    expect(resyncError(new ApiError("Refresh", 400, "Link Steam first"))).toBe(
      "Link Steam first",
    );
  });
});

describe("Account", { timeout: 15000 }, () => {
  test("shows callsigns and the library", async () => {
    render(<Account />);
    expect(
      await screen.findByRole("heading", { level: 1, name: "ProGamer123" }),
    ).toBeInTheDocument();
    const callsigns = screen.getByRole("list", { name: "Callsigns" });
    expect(within(callsigns).getByText("3 EVENTS")).toBeInTheDocument();
    const library = await screen.findByRole("list", { name: "Your games" });
    expect(within(library).getByText("Counter-Strike 2")).toBeInTheDocument();
    expect(within(library).getByText("Unplayed")).toBeInTheDocument();
    expect(lastProfileQuery?.get("count")).toBe("10");
    expect(lastProfileQuery?.get("sort")).toBe("playtime");
  });

  test("searching sends the search param and resets to page 0", async () => {
    render(<Account />);
    await screen.findByRole("list", { name: "Your games" });
    await userEvent.type(
      screen.getByRole("searchbox", { name: "Search library" }),
      "portal",
    );
    await waitFor(() => expect(lastProfileQuery?.get("search")).toBe("portal"));
    expect(lastProfileQuery?.get("page")).toBe("0");
  });

  test("asks for the profile optionally; 204 means not linked", async () => {
    server.use(
      http.get("/api/profile", ({ request }) => {
        lastProfileQuery = new URL(request.url).searchParams;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    render(<Account />);
    expect(await screen.findByText("NOT LINKED")).toBeInTheDocument();
    expect(lastProfileQuery?.get("optional")).toBe("true");
  });

  test("no Steam profile (404) shows the link form", async () => {
    server.use(
      http.get("/api/profile", () =>
        HttpResponse.json({ error: { code: 404 } }, { status: 404 }),
      ),
    );
    render(<Account />);
    expect(await screen.findByText("NOT LINKED")).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: /steam id or profile url/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/link your steam account to see your library/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /resync library/i }),
    ).not.toBeInTheDocument();
  });

  test("rejects an invalid Steam ID without calling the API", async () => {
    let putCalled = false;
    server.use(
      http.put("/api/profile", () => {
        putCalled = true;
        return HttpResponse.json({});
      }),
    );
    render(<Account />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Change Steam ID" }),
    );
    const input = screen.getByRole("textbox", {
      name: /steam id or profile url/i,
    });
    await userEvent.clear(input);
    await userEvent.type(input, "12345");
    await userEvent.click(
      screen.getByRole("button", { name: "Save Steam ID" }),
    );
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(/17-digit steamid64/i);
    expect(putCalled).toBe(false);
  });

  test("shows the server's reason when the Steam ID is rejected", async () => {
    server.use(
      http.put("/api/profile", () =>
        HttpResponse.json(
          {
            error: {
              code: 400,
              reason: "Bad Request",
              description: 'No Steam profile found for custom URL "nobody"',
            },
          },
          { status: 400 },
        ),
      ),
    );
    render(<Account />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Change Steam ID" }),
    );
    const input = screen.getByRole("textbox", {
      name: /steam id or profile url/i,
    });
    await userEvent.clear(input);
    await userEvent.click(input);
    await userEvent.paste("https://steamcommunity.com/id/nobody");
    await userEvent.click(
      screen.getByRole("button", { name: "Save Steam ID" }),
    );
    expect(
      await screen.findByText(/no steam profile found for custom url/i),
    ).toBeInTheDocument();
  });

  test("a failed custom-URL lookup (500) explains itself without a status code", async () => {
    server.use(
      http.put("/api/profile", () =>
        HttpResponse.json(
          { error: { code: 500, description: "Error updating profile" } },
          { status: 500 },
        ),
      ),
    );
    render(<Account />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Change Steam ID" }),
    );
    const input = screen.getByRole("textbox", {
      name: /steam id or profile url/i,
    });
    await userEvent.clear(input);
    await userEvent.click(input);
    await userEvent.paste("https://steamcommunity.com/id/nobody");
    await userEvent.click(
      screen.getByRole("button", { name: "Save Steam ID" }),
    );
    await waitFor(() =>
      expect(input).toHaveAccessibleDescription(
        /couldn't look up that custom url/i,
      ),
    );
    expect(screen.queryByText(/status 500/i)).not.toBeInTheDocument();
  });

  test("the Steam account page link is underlined in its sentence", async () => {
    server.use(
      http.get("/api/profile", () =>
        HttpResponse.json({ error: { code: 404 } }, { status: 404 }),
      ),
    );
    render(<Account />);
    const link = await screen.findByRole("link", {
      name: "Steam account page",
    });
    expect(link.className).toMatch(/underlineAlways/);
  });

  test("saving a new Steam ID triggers a resync", async () => {
    let putBody: unknown = null;
    let synced = false;
    server.use(
      http.put("/api/profile", async ({ request }) => {
        putBody = await request.json();
        return HttpResponse.json({
          ...mockProfile,
          steamId: "76561197960287930",
          games: [],
        });
      }),
      http.post("/api/profile/games/update", () => {
        synced = true;
        return HttpResponse.json({});
      }),
    );
    render(<Account />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Change Steam ID" }),
    );
    const input = screen.getByRole("textbox", {
      name: /steam id or profile url/i,
    });
    await userEvent.clear(input);
    await userEvent.click(input);
    await userEvent.paste(
      "https://steamcommunity.com/profiles/76561197960287930",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Save Steam ID" }),
    );
    await waitFor(() => expect(synced).toBe(true));
    expect(putBody).toEqual({
      steamId: "https://steamcommunity.com/profiles/76561197960287930",
    });
    expect(
      await screen.findByText(/synced just now from your new steam id/i),
    ).toBeInTheDocument();
  });
});

describe("Account - Resync library button", { timeout: 15000 }, () => {
  test("button is enabled by default", async () => {
    render(<Account />);
    const button = await screen.findByRole("button", {
      name: /resync library/i,
    });
    expect(button).toBeEnabled();
  });

  test("shows a busy state while syncing", async () => {
    server.use(
      http.post("/api/profile/games/update", () => {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve(HttpResponse.json({}, { status: 200 }));
          }, 100);
        });
      }),
    );

    render(<Account />);

    const button = await screen.findByRole("button", {
      name: /resync library/i,
    });
    await userEvent.click(button);

    expect(button).toBeDisabled();
    expect(screen.getByText("Syncing your Steam library…")).toBeInTheDocument();
  });

  test("shows the result after a successful sync", async () => {
    server.use(
      http.post("/api/profile/games/update", () => {
        return HttpResponse.json({}, { status: 200 });
      }),
    );

    render(<Account />);

    const button = await screen.findByRole("button", {
      name: /resync library/i,
    });
    await userEvent.click(button);

    expect(
      await screen.findByText("Library synced just now. 2 games, 0 new."),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(button).toBeEnabled();
    });
  });

  test("shows an error on failure", async () => {
    server.use(
      http.post("/api/profile/games/update", () => {
        return HttpResponse.json({ error: "Server error" }, { status: 500 });
      }),
    );

    render(<Account />);

    const button = await screen.findByRole("button", {
      name: /resync library/i,
    });
    await userEvent.click(button);

    expect(
      await screen.findByText(/couldn't refresh your games from steam/i),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(button).toBeEnabled();
    });
  });

  test("handles network errors gracefully", async () => {
    server.use(
      http.post("/api/profile/games/update", () => {
        return HttpResponse.error();
      }),
    );

    render(<Account />);

    const button = await screen.findByRole("button", {
      name: /resync library/i,
    });
    await userEvent.click(button);

    expect(
      await screen.findByText(/error refreshing games/i),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(button).toBeEnabled();
    });
  });
});
