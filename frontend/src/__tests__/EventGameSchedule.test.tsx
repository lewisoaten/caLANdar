import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  render,
  screen,
  waitFor,
  within,
  fireEvent,
  act,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { SnackbarProvider } from "notistack";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import moment from "moment";
import theme from "../theme";
import EventGameSchedule from "../components/EventGameSchedule";
import { UserContext } from "../UserProvider";

// Local wall-clock times so the assertions hold in any timezone.
const iso = (local: string) => moment(local).toISOString();
const stamp = "2026-10-01T00:00:00Z";

const event = {
  id: 7,
  title: "Autumn LAN",
  description: "",
  image: null,
  timeBegin: iso("2026-11-13T18:00:00"),
  timeEnd: iso("2026-11-15T12:00:00"),
  createdAt: stamp,
  lastModified: stamp,
};

const entry = (
  id: number,
  gameId: number,
  gameName: string,
  start: string,
  minutes: number,
  pinned: boolean,
) => ({
  id,
  eventId: 7,
  gameId,
  gameName,
  startTime: iso(start),
  durationMinutes: minutes,
  isPinned: pinned,
  isSuggested: !pinned,
  createdAt: stamp,
  lastModified: stamp,
});

const gamer = (handle: string) => ({ handle, avatarUrl: null });

const suggestion = (appid: number, name: string, votes: number) => ({
  appid,
  name,
  userEmail: "",
  comment: null,
  lastModified: stamp,
  requestedAt: stamp,
  suggestionLastModified: stamp,
  selfVote: "noVote",
  votes,
  voters: [gamer("Ann")],
  suggester: gamer("Ann"),
  gamerOwned: [gamer("Ann")],
  gamerUnowned: [],
  gamerUnknown: [],
});

let schedule: ReturnType<typeof entry>[];
let calls: Array<{ method: string; url: string; body: unknown }>;

beforeEach(() => {
  schedule = [
    entry(1, 730, "Counter-Strike 2", "2026-11-13T19:00:00", 120, true),
    entry(2, 550, "Left 4 Dead 2", "2026-11-13T21:30:00", 60, true),
    entry(0, 548430, "Deep Rock Galactic", "2026-11-14T12:00:00", 120, false),
  ];
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method, url, body });
      const json = (data: unknown, status = 200) =>
        new Response(JSON.stringify(data), {
          status,
          headers: { "Content-Type": "application/json" },
        });
      const path = url.split("?")[0];
      if (method === "GET" && path === "/api/events/7") return json(event);
      if (method === "GET" && path === "/api/events/7/game_schedule")
        return json(schedule);
      if (method === "GET" && path === "/api/events/7/suggested_games")
        return json([
          suggestion(730, "Counter-Strike 2", 3),
          suggestion(548430, "Deep Rock Galactic", 2),
          suggestion(440, "Team Fortress 2", 1),
        ]);
      if (method === "GET" && path === "/api/events/7/invitations")
        return json([]);
      if (method === "GET" && path.startsWith("/api/steam-game"))
        return json([]);
      if (method === "PATCH") {
        const id = Number(path.split("/").pop());
        const cur = schedule.find((e) => e.id === id)!;
        const next = { ...cur, ...(body as object) };
        schedule = schedule.map((e) => (e.id === id ? next : e));
        return json(next);
      }
      if (
        method === "POST" &&
        (path.endsWith("/game_schedule") || path.endsWith("/game_schedule/pin"))
      ) {
        const b = body as {
          gameId: number;
          startTime: string;
          durationMinutes: number;
        };
        const names: Record<number, string> = {
          440: "Team Fortress 2",
          548430: "Deep Rock Galactic",
        };
        const created = entry(
          90 + schedule.length,
          b.gameId,
          names[b.gameId] ?? "Game",
          b.startTime,
          b.durationMinutes,
          true,
        );
        created.startTime = b.startTime;
        schedule = [
          ...schedule.filter((e) => e.gameId !== b.gameId || e.isPinned),
          created,
        ];
        return json(created);
      }
      return json(null, 404);
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

const renderPage = (isAdmin: boolean) =>
  render(
    <ThemeProvider theme={theme}>
      <SnackbarProvider>
        <UserContext.Provider
          value={{
            email: "admin@example.com",
            token: "t",
            loggedIn: true,
            isAdmin,
          }}
        >
          <MemoryRouter initialEntries={["/events/7/schedule"]}>
            <Routes>
              <Route
                path="/events/:id/schedule"
                element={<EventGameSchedule />}
              />
            </Routes>
          </MemoryRouter>
        </UserContext.Provider>
      </SnackbarProvider>
    </ThemeProvider>,
  );

const block = (name: RegExp) =>
  screen.findByRole("button", { name, description: /Enter opens details/ });

describe("EventGameSchedule", { timeout: 20000 }, () => {
  it("shows a read-only timeline and details for members", async () => {
    const user = userEvent.setup();
    renderPage(false);
    expect(
      await screen.findByRole("heading", { level: 1, name: "Schedule" }),
    ).toBeInTheDocument();
    const cs = await block(/^Counter-Strike 2, Friday 19:00 to 21:00, pinned/);
    expect(
      screen.queryByRole("button", { name: /Add to schedule/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Recalculate/ }),
    ).not.toBeInTheDocument();

    // Arrow keys do nothing for members.
    cs.focus();
    await user.keyboard("{ArrowRight}");
    expect(calls.some((c) => c.method === "PATCH")).toBe(false);

    await user.keyboard("{Enter}");
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: "Counter-Strike 2" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: "Remove" }),
    ).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/Timing/)).not.toBeInTheDocument();
  });

  it("moves a pinned session 30 minutes with the arrow keys (admin)", async () => {
    const user = userEvent.setup();
    renderPage(true);
    const cs = await block(/^Counter-Strike 2, Friday 19:00/);
    cs.focus();
    await user.keyboard("{ArrowRight}");
    await waitFor(() =>
      expect(calls.find((c) => c.method === "PATCH")).toBeTruthy(),
    );
    const patch = calls.find((c) => c.method === "PATCH")!;
    expect(patch.url).toBe("/api/events/7/game_schedule/1?as_admin=true");
    expect(patch.body).toMatchObject({
      gameId: 730,
      startTime: iso("2026-11-13T19:30:00"),
      durationMinutes: 120,
    });
    expect(
      await screen.findByText("Counter-Strike 2 moved to FRI 19:30–21:30"),
    ).toBeInTheDocument();
  });

  it("changes length with Shift+arrows", async () => {
    const user = userEvent.setup();
    renderPage(true);
    const l4d = await block(/^Left 4 Dead 2, Friday 21:30/);
    l4d.focus();
    await user.keyboard("{Shift>}{ArrowRight}{/Shift}");
    await waitFor(() =>
      expect(calls.find((c) => c.method === "PATCH")?.body).toMatchObject({
        durationMinutes: 90,
      }),
    );
  });

  it("refuses a move that clashes with another pinned session", async () => {
    const user = userEvent.setup();
    renderPage(true);
    const l4d = await block(/^Left 4 Dead 2, Friday 21:30/);
    l4d.focus();
    // 21:30 -> 21:00 overlaps Counter-Strike 2 (19:00-21:00)? No; -> 20:30 does.
    await user.keyboard("{ArrowLeft}");
    await waitFor(() =>
      expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(1),
    );
    const moved = await block(/^Left 4 Dead 2, Friday 21:00/);
    moved.focus();
    await user.keyboard("{ArrowLeft}");
    expect(
      await screen.findByText(/Clashes with Counter-Strike 2 \(19:00–21:00\)/),
    ).toBeInTheDocument();
    expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(1);
  });

  it("pins a suggested session when it is moved", async () => {
    const user = userEvent.setup();
    renderPage(true);
    const drg = await block(
      /^Deep Rock Galactic, Saturday 12:00 to 14:00, suggested/,
    );
    drg.focus();
    await user.keyboard("{ArrowRight}");
    await waitFor(() =>
      expect(
        calls.find(
          (c) => c.method === "POST" && c.url.includes("/game_schedule/pin"),
        ),
      ).toBeTruthy(),
    );
    const pin = calls.find((c) => c.url.includes("/game_schedule/pin"))!;
    expect(pin.body).toMatchObject({
      gameId: 548430,
      startTime: iso("2026-11-14T12:30:00"),
    });
    expect(
      await screen.findByText(
        "Deep Rock Galactic moved to SAT 12:30–14:30 · now pinned",
      ),
    ).toBeInTheDocument();
  });

  it("opens details on a tap and moves on a drag", async () => {
    renderPage(true);
    const cs = await block(/^Counter-Strike 2, Friday 19:00/);
    const track = screen.getByTestId("timeline-track-0");
    vi.spyOn(track, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      right: 1600,
      bottom: 42,
      width: 1600,
      height: 42,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    // A press that moves < 5px is a tap: it opens details.
    fireEvent.pointerDown(cs, {
      pointerType: "mouse",
      button: 0,
      clientX: 100,
      clientY: 20,
    });
    act(() => {
      window.dispatchEvent(
        new MouseEvent("pointermove", { clientX: 102, clientY: 21 }),
      );
      window.dispatchEvent(new MouseEvent("pointerup"));
    });
    fireEvent.click(cs);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close details" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );

    // Drag left by about an hour (the range spans ~15h over 1600px).
    fireEvent.pointerDown(cs, {
      pointerType: "mouse",
      button: 0,
      clientX: 100,
      clientY: 20,
    });
    act(() => {
      window.dispatchEvent(
        new MouseEvent("pointermove", { clientX: -7, clientY: 20 }),
      );
    });
    expect(
      await screen.findByText(/^FRI 18:00 → 20:00 · 2h/),
    ).toBeInTheDocument();
    act(() => {
      window.dispatchEvent(new MouseEvent("pointerup"));
    });
    await waitFor(() =>
      expect(calls.find((c) => c.method === "PATCH")).toBeTruthy(),
    );
    const patch = calls.find((c) => c.method === "PATCH")!;
    expect(patch.body).toMatchObject({
      startTime: iso("2026-11-13T18:00:00"),
      durationMinutes: 120,
    });
  });

  it("adds a suggested game from the dialog", async () => {
    const user = userEvent.setup();
    renderPage(true);
    await block(/^Counter-Strike 2/);
    await user.click(screen.getByRole("button", { name: /Add to schedule/ }));
    const dialog = await screen.findByRole("dialog", { name: "Pick a game" });
    await user.click(
      within(dialog).getByRole("button", { name: /Team Fortress 2/ }),
    );
    expect(
      await screen.findByRole("dialog", { name: "Set the time" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "SAT" }));
    await user.selectOptions(screen.getByLabelText("START"), "15");
    await user.click(screen.getByRole("button", { name: "Add to schedule" }));
    await waitFor(() =>
      expect(
        calls.find(
          (c) =>
            c.method === "POST" &&
            c.url.endsWith("/game_schedule?as_admin=true"),
        ),
      ).toBeTruthy(),
    );
    const post = calls.find((c) =>
      c.url.endsWith("/game_schedule?as_admin=true"),
    )!;
    expect(post.body).toMatchObject({
      gameId: 440,
      startTime: iso("2026-11-14T15:00:00"),
      durationMinutes: 120,
    });
    // An existing suggestion is not re-suggested.
    expect(
      calls.some(
        (c) => c.method === "POST" && c.url.endsWith("/suggested_games"),
      ),
    ).toBe(false);
    expect(
      await screen.findByText("Team Fortress 2 pinned to SAT 15:00."),
    ).toBeInTheDocument();
  });
});
