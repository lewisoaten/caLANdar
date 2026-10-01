import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import GamersAdmin, { buildGamersQuery } from "../components/GamersAdmin";
import { renderAsAdmin } from "./adminTestUtils";

const DAY = 86_400_000;
const ago = (d: number) => new Date(Date.now() - d * DAY).toISOString();

const gamer = (over: Record<string, unknown>) => ({
  email: "x@example.com",
  avatarUrl: null,
  handles: [],
  callsign: null,
  steamId: null,
  steamLinked: false,
  eventsInvitedCount: 5,
  eventsAcceptedCount: 3,
  eventsTentativeCount: 1,
  eventsDeclinedCount: 1,
  eventsLastResponse: null,
  gamesOwnedCount: 0,
  gamesOwnedLastModified: null,
  ...over,
});

const GAMERS = [
  gamer({
    email: "nia@example.com",
    handles: ["NoScope_Nia", "Nia"],
    callsign: "NoScope_Nia",
    steamId: "76561197960287930",
    steamLinked: true,
    eventsLastResponse: ago(2),
    gamesOwnedCount: 120,
    gamesOwnedLastModified: ago(1),
  }),
  gamer({
    email: "old@example.com",
    handles: ["OldTimer"],
    callsign: "OldTimer",
    steamId: "76561197960287931",
    steamLinked: true,
    gamesOwnedCount: 40,
    gamesOwnedLastModified: ago(45),
  }),
  gamer({ email: "zoe@example.com" }),
];

let requests: URLSearchParams[] = [];

const server = setupServer(
  http.get("/api/gamers", ({ request }) => {
    const params = new URL(request.url).searchParams;
    requests.push(params);
    const page = Number(params.get("page"));
    return HttpResponse.json({
      gamers: page === 1 ? GAMERS : [GAMERS[2]],
      total: 30,
      page,
      limit: 9,
      totalPages: 4,
      counts: { all: 30, steam: 22, noSteam: 8, staleLibrary: 5 },
    });
  }),
  http.get("/api/steam-game-update-v2/stats", () =>
    HttpResponse.json({ gamesCached: 10, lastRefreshed: null }),
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  requests = [];
});
afterAll(() => server.close());

const last = () => requests[requests.length - 1];

test("buildGamersQuery sends the server-side filter/sort/page params", () => {
  const q = new URLSearchParams(
    buildGamersQuery({
      page: 2,
      search: "  nia ",
      filter: "stale_library",
      sort: "games_updated",
    }),
  );
  expect(Object.fromEntries(q)).toEqual({
    as_admin: "true",
    page: "2",
    limit: "9",
    filter: "stale_library",
    sort: "games_updated",
    search: "nia",
  });
  expect(
    new URLSearchParams(
      buildGamersQuery({
        page: 1,
        search: " ",
        filter: "all",
        sort: "last_rsvp",
      }),
    ).has("search"),
  ).toBe(false);
});

describe("GamersAdmin", () => {
  test("renders a card per gamer with Steam status and dates", async () => {
    renderAsAdmin(<GamersAdmin />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Gamers" }),
    ).toBeInTheDocument();

    const nia = await screen.findByRole("article", { name: "NoScope_Nia" });
    expect(within(nia).getByText("nia@example.com")).toBeInTheDocument();
    expect(within(nia).getByText("Steam")).toBeInTheDocument();
    expect(within(nia).getByText("AKA Nia")).toBeInTheDocument();
    expect(within(nia).getByText("2 days ago")).toBeInTheDocument();
    expect(within(nia).getByText("120")).toBeInTheDocument();

    const old = screen.getByRole("article", { name: "OldTimer" });
    expect(within(old).getByText("(over 30 days old)")).toBeInTheDocument();
    expect(within(old).getByText("Never")).toBeInTheDocument();

    const zoe = screen.getByRole("article", { name: "zoe@example.com" });
    expect(within(zoe).getByText("No callsign yet")).toBeInTheDocument();
    expect(within(zoe).getByText("No Steam")).toBeInTheDocument();
    expect(within(zoe).getByText("Not linked")).toBeInTheDocument();

    expect(last().get("sort")).toBe("last_rsvp");
    expect(last().get("limit")).toBe("9");
    expect(screen.getByText("1–9 OF 30")).toBeInTheDocument();
  });

  test("filter chips show counts and reset to page 1", async () => {
    renderAsAdmin(<GamersAdmin />);
    await screen.findByRole("article", { name: "NoScope_Nia" });

    await userEvent.click(screen.getByRole("button", { name: "Page 2" }));
    await waitFor(() => expect(last().get("page")).toBe("2"));

    const stale = screen.getByRole("button", {
      name: /library 30d\+ old\s*5/i,
    });
    await userEvent.click(stale);
    await waitFor(() => expect(last().get("filter")).toBe("stale_library"));
    expect(last().get("page")).toBe("1");
    expect(stale).toHaveAttribute("aria-pressed", "true");
  });

  test("sort select uses the themed menu and resets the page", async () => {
    renderAsAdmin(<GamersAdmin />);
    await screen.findByRole("article", { name: "NoScope_Nia" });
    await userEvent.click(screen.getByRole("button", { name: "Page 2" }));
    await waitFor(() => expect(last().get("page")).toBe("2"));

    await userEvent.click(
      screen.getByRole("combobox", { name: "Sort gamers by" }),
    );
    await userEvent.click(
      await screen.findByRole("option", { name: "Games updated" }),
    );
    await waitFor(() => expect(last().get("sort")).toBe("games_updated"));
    expect(last().get("page")).toBe("1");
  });

  test("search is debounced and sent server-side", async () => {
    renderAsAdmin(<GamersAdmin />);
    await screen.findByRole("article", { name: "NoScope_Nia" });
    const before = requests.length;
    await userEvent.type(
      screen.getByRole("searchbox", { name: "Search email or callsign" }),
      "nia",
    );
    await waitFor(() => expect(last().get("search")).toBe("nia"));
    // One request for the settled value, not one per keystroke.
    expect(requests.length - before).toBe(1);
  });

  test("edit Steam ID validates and PUTs to the admin profile route", async () => {
    let body: unknown = null;
    server.use(
      http.put("/api/profile/:email", async ({ request, params }) => {
        body = { email: params.email, ...((await request.json()) as object) };
        return HttpResponse.json({});
      }),
    );
    renderAsAdmin(<GamersAdmin />);
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Edit Steam ID for zoe@example.com",
      }),
    );
    const dialog = screen.getByRole("dialog", { name: "Edit Steam ID" });
    const field = within(dialog).getByLabelText("Steam ID or profile URL");
    await userEvent.type(field, "123");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(body).toBeNull();

    await userEvent.clear(field);
    await userEvent.type(field, "76561197960287999");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(body).toEqual({
        email: "zoe@example.com",
        steamId: "76561197960287999",
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  test("refresh games POSTs to the admin route and disables while in flight", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    let email: unknown = null;
    let asAdmin: string | null = null;
    server.use(
      http.post(
        "/api/profile/:email/games/update",
        async ({ params, request }) => {
          email = params.email;
          asAdmin = new URL(request.url).searchParams.get("as_admin");
          await gate;
          return HttpResponse.json({});
        },
      ),
    );
    renderAsAdmin(<GamersAdmin />);
    const button = await screen.findByRole("button", {
      name: "Refresh games for nia@example.com",
    });
    await userEvent.click(button);
    await waitFor(() => expect(button).toBeDisabled());
    expect(button).toHaveAttribute("aria-busy", "true");
    release();
    await waitFor(() => expect(button).toBeEnabled());
    expect(email).toBe("nia@example.com");
    expect(asAdmin).toBe("true");
    expect(button).not.toHaveAttribute("aria-busy");
    expect(
      await screen.findByText("Games refreshed for nia@example.com"),
    ).toBeInTheDocument();
  });

  test("shows an error state with retry", async () => {
    server.use(
      http.get("/api/gamers", () =>
        HttpResponse.json(
          { error: { code: 500, description: "db down" } },
          { status: 500 },
        ),
      ),
    );
    renderAsAdmin(<GamersAdmin />);
    expect(await screen.findByText("Couldn't load gamers")).toBeInTheDocument();
    // 500 descriptions are internals: show a plain message instead.
    expect(screen.queryByText("db down")).toBeNull();
    expect(
      screen.getByText(
        "The server had a problem. Please try again in a minute.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
  });

  test("non-admins see a permission error and no request is made", () => {
    renderAsAdmin(<GamersAdmin />, false);
    expect(screen.getByText(/Admin access required/)).toBeInTheDocument();
    expect(requests).toHaveLength(0);
  });
});
