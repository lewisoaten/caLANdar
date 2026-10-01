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
import EventGameSchedule, {
  STEPPER_SAVE_DELAY_MS,
} from "../components/EventGameSchedule";
import { UserContext, UserDispatchContext } from "../UserProvider";

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
/** Per-test overrides: return a Response to short-circuit the default mock. */
let override:
  | ((method: string, path: string) => Promise<Response> | Response | undefined)
  | undefined;
const signOut = vi.fn();

beforeEach(() => {
  schedule = [
    entry(1, 730, "Counter-Strike 2", "2026-11-13T19:00:00", 120, true),
    entry(2, 550, "Left 4 Dead 2", "2026-11-13T21:30:00", 60, true),
    entry(0, 548430, "Deep Rock Galactic", "2026-11-14T12:00:00", 120, false),
  ];
  calls = [];
  override = undefined;
  signOut.mockReset();
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
      const custom = override?.(method, path);
      if (custom) return custom;
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
      if (method === "GET" && path === "/api/steam-game")
        return json([
          { appid: 892970, name: "Valheim", last_modified: stamp, rank: null },
        ]);
      if (method === "POST" && path === "/api/events/7/suggested_games")
        return json(
          suggestion((body as { appid: number }).appid, "Valheim", 1),
        );
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
          <UserDispatchContext.Provider
            value={{
              signIn: vi.fn(),
              verifyEmail: vi.fn(),
              signOut,
              isSignedIn: vi.fn(() => true),
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
          </UserDispatchContext.Provider>
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
      await screen.findByText("Counter-Strike 2 moved to FRI 19:30 → 21:30"),
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
        "Deep Rock Galactic moved to SAT 12:30 → 14:30 · now pinned",
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

  it("suggests, votes and schedules a game from the Steam cache", async () => {
    const user = userEvent.setup();
    renderPage(true);
    await block(/^Counter-Strike 2/);
    await user.click(screen.getByRole("button", { name: /Add to schedule/ }));
    await user.type(
      await screen.findByRole("searchbox", { name: "Search games" }),
      "val",
    );
    expect(
      await screen.findByText("No suggested games match."),
    ).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: /Valheim/ }));
    expect(
      await screen.findByText(/Not suggested yet\. Adding it suggests it/),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Suggest, vote & schedule" }),
    );
    await waitFor(() =>
      expect(
        calls.find((c) => c.url.endsWith("/game_schedule?as_admin=true")),
      ).toBeTruthy(),
    );
    const suggestIdx = calls.findIndex(
      (c) => c.method === "POST" && c.url === "/api/events/7/suggested_games",
    );
    const scheduleIdx = calls.findIndex((c) =>
      c.url.endsWith("/game_schedule?as_admin=true"),
    );
    expect(suggestIdx).toBeGreaterThan(-1);
    expect(suggestIdx).toBeLessThan(scheduleIdx);
    expect(calls[suggestIdx].body).toEqual({ appid: 892970, comment: null });
  });

  it("puts a session back straight away when saving a move fails", async () => {
    const user = userEvent.setup();
    let failed = false;
    override = (method, path) => {
      if (method === "PATCH") {
        failed = true;
        return new Response("boom", { status: 500 });
      }
      // Hold the follow-up refresh so only the rollback can restore the block.
      if (failed && method === "GET" && path === "/api/events/7/game_schedule")
        return new Promise<Response>(() => undefined);
      return undefined;
    };
    renderPage(true);
    const cs = await block(/^Counter-Strike 2, Friday 19:00/);
    cs.focus();
    await user.keyboard("{ArrowRight}");
    expect(
      await screen.findByText("Failed to update game schedule"),
    ).toBeInTheDocument();
    expect(
      await block(/^Counter-Strike 2, Friday 19:00 to 21:00, pinned/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Friday 19:30/ })).toBeNull();
  });

  it("shares trophies on tied votes, like the lobby", async () => {
    override = (method, path) =>
      method === "GET" && path === "/api/events/7/suggested_games"
        ? new Response(
            JSON.stringify([
              suggestion(730, "Counter-Strike 2", 3),
              suggestion(550, "Left 4 Dead 2", 3),
              suggestion(548430, "Deep Rock Galactic", 0),
            ]),
            { status: 200, headers: { "Content-Type": "application/json" } },
          )
        : undefined;
    renderPage(false);
    expect(
      await block(/^Counter-Strike 2, .*pinned, number 1 most voted$/),
    ).toBeInTheDocument();
    expect(
      await block(/^Left 4 Dead 2, .*pinned, number 1 most voted$/),
    ).toBeInTheDocument();
    // No votes, no trophy.
    expect(
      await block(/^Deep Rock Galactic, .*suggested$/),
    ).toBeInTheDocument();
  });

  describe("debounced timing steppers", () => {
    afterEach(() => vi.useRealTimers());

    const openDetails = async (name: RegExp) => {
      const user = userEvent.setup();
      const b = await block(name);
      b.focus();
      await user.keyboard("{Enter}");
      return screen.findByRole("dialog");
    };
    const patches = () => calls.filter((c) => c.method === "PATCH");
    const output = (dialog: HTMLElement, label: "Start" | "End") =>
      within(dialog)
        .getByRole("group", { name: `${label} time` })
        .querySelector("output")!;

    it("mashing + sends one PATCH and one toast after a pause", async () => {
      renderPage(true);
      const dialog = await openDetails(/^Left 4 Dead 2, Friday 21:30/);
      vi.useFakeTimers();
      const later = within(dialog).getByRole("button", {
        name: "End 30 minutes later",
      });
      for (let i = 0; i < 10; i++) fireEvent.click(later);
      // The new end shows straight away, flagged as not saved yet.
      expect(output(dialog, "End")).toHaveTextContent("03:30");
      expect(output(dialog, "End")).toHaveTextContent("not saved yet");
      act(() => vi.advanceTimersByTime(STEPPER_SAVE_DELAY_MS - 1));
      expect(patches()).toHaveLength(0);
      act(() => vi.advanceTimersByTime(1));
      expect(patches()).toHaveLength(1);
      expect(patches()[0].body).toMatchObject({
        gameId: 550,
        startTime: iso("2026-11-13T21:30:00"),
        durationMinutes: 360,
      });
      vi.useRealTimers();
      expect(
        await screen.findAllByText(/^Left 4 Dead 2 now runs/),
      ).toHaveLength(1);
      // Nothing else gets sent later.
      await act(
        () => new Promise((r) => setTimeout(r, STEPPER_SAVE_DELAY_MS + 50)),
      );
      expect(patches()).toHaveLength(1);
      expect(screen.getAllByText(/now runs/)).toHaveLength(1);
    });

    it("refuses a clash once and reverts to the saved time", async () => {
      renderPage(true);
      const dialog = await openDetails(/^Counter-Strike 2, Friday 19:00/);
      vi.useFakeTimers();
      const later = within(dialog).getByRole("button", {
        name: "End 30 minutes later",
      });
      fireEvent.click(later);
      fireEvent.click(later);
      expect(output(dialog, "End")).toHaveTextContent("22:00");
      act(() => vi.advanceTimersByTime(STEPPER_SAVE_DELAY_MS));
      vi.useRealTimers();
      expect(
        await screen.findAllByText(
          /Clashes with Left 4 Dead 2 \(21:30–22:30\)\. Not moved\./,
        ),
      ).toHaveLength(1);
      expect(patches()).toHaveLength(0);
      expect(output(dialog, "End")).toHaveTextContent(/^21:00$/);
    });

    it("sends nothing when the steps cancel out", async () => {
      renderPage(true);
      const dialog = await openDetails(/^Left 4 Dead 2, Friday 21:30/);
      vi.useFakeTimers();
      fireEvent.click(
        within(dialog).getByRole("button", { name: "End 30 minutes later" }),
      );
      fireEvent.click(
        within(dialog).getByRole("button", { name: "End 30 minutes earlier" }),
      );
      act(() => vi.advanceTimersByTime(STEPPER_SAVE_DELAY_MS * 2));
      expect(patches()).toHaveLength(0);
      expect(calls.some((c) => c.url.includes("/game_schedule/pin"))).toBe(
        false,
      );
    });

    it("saves straight away on close, and on Enter", async () => {
      renderPage(true);
      let dialog = await openDetails(/^Left 4 Dead 2, Friday 21:30/);
      // Real timers here so the drawer can animate shut; the PATCH below is
      // sent synchronously on close, well inside the debounce delay.
      fireEvent.click(
        within(dialog).getByRole("button", { name: "End 30 minutes later" }),
      );
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Close details" }),
      );
      expect(patches()).toHaveLength(1);
      expect(patches()[0].body).toMatchObject({ durationMinutes: 90 });
      await screen.findByText(/^Left 4 Dead 2 now runs/);
      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );

      dialog = await openDetails(/^Left 4 Dead 2, Friday 21:30 to 23:00/);
      vi.useFakeTimers();
      const later = within(dialog).getByRole("button", {
        name: "End 30 minutes later",
      });
      fireEvent.click(later);
      // Enter saves what's pending instead of taking another step.
      fireEvent.keyDown(later, { key: "Enter" });
      expect(patches()).toHaveLength(2);
      expect(patches()[1].body).toMatchObject({ durationMinutes: 120 });
      act(() => vi.advanceTimersByTime(STEPPER_SAVE_DELAY_MS * 2));
      expect(patches()).toHaveLength(2);
    });

    it("Remove with a pending change drops it and only deletes", async () => {
      renderPage(true);
      const dialog = await openDetails(/^Left 4 Dead 2, Friday 21:30/);
      fireEvent.click(
        within(dialog).getByRole("button", { name: "End 30 minutes later" }),
      );
      fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));
      await waitFor(() =>
        expect(calls.filter((c) => c.method === "DELETE")).toHaveLength(1),
      );
      expect(patches()).toHaveLength(0);
    });
  });

  it("names the real day for sessions after midnight", async () => {
    schedule = [
      ...schedule,
      entry(5, 427520, "Factorio", "2026-11-14T00:30:00", 120, true),
    ];
    renderPage(false);
    expect(
      await block(
        /^Factorio, Saturday 00:30 to 02:30 \(Friday night\), pinned/,
      ),
    ).toBeInTheDocument();
    const card = screen.getByRole("button", {
      name: /^Factorio, Saturday 00:30 to 02:30 \(Friday night\), pinned\. /,
    });
    expect(card).toHaveTextContent("SAT 00:30 → 02:30");
    expect(card).toHaveTextContent("FRI NIGHT");
    // Still listed under Friday's column.
    expect(
      within(screen.getByRole("region", { name: "Friday" })).getByRole(
        "button",
        { name: /^Factorio/ },
      ),
    ).toBe(card);
  });

  it("explains a recalculation without offering an Undo", async () => {
    const user = userEvent.setup();
    override = (method, path) =>
      method === "POST" && path === "/api/events/7/game_schedule/recalculate"
        ? new Response(JSON.stringify([schedule[2]]), { status: 200 })
        : undefined;
    renderPage(true);
    await block(/^Counter-Strike 2/);
    await user.click(screen.getByRole("button", { name: /Recalculate/ }));
    expect(
      await screen.findByText(
        "Suggested 1 game, one session each, from the latest votes and attendance. Your 2 pinned sessions are unchanged.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
    // The scheduler is told which wall clock the window is on.
    expect(
      calls.find((c) => c.url.includes("/game_schedule/recalculate"))?.url,
    ).toBe(
      "/api/events/7/game_schedule/recalculate?as_admin=true&tz=Europe%2FLondon",
    );
  });

  it("counts games, not duplicate entries, after a recalculation", async () => {
    const user = userEvent.setup();
    const dsg = schedule[2];
    override = (method, path) =>
      method === "POST" && path === "/api/events/7/game_schedule/recalculate"
        ? new Response(
            JSON.stringify([
              dsg,
              { ...dsg, startTime: iso("2026-11-14T18:00:00") },
              // Already pinned: not a new suggestion
              { ...schedule[0], id: 0, isPinned: false, isSuggested: true },
            ]),
            { status: 200 },
          )
        : undefined;
    renderPage(true);
    await block(/^Counter-Strike 2/);
    await user.click(screen.getByRole("button", { name: /Recalculate/ }));
    expect(
      await screen.findByText(
        "Suggested 1 game, one session each, from the latest votes and attendance. Your 2 pinned sessions are unchanged.",
      ),
    ).toBeInTheDocument();
  });

  it("shows each game once even if the API repeats it", async () => {
    schedule = [
      ...schedule,
      // Suggested again although pinned, and a second suggestion
      entry(0, 730, "Counter-Strike 2", "2026-11-14T15:00:00", 120, false),
      entry(0, 548430, "Deep Rock Galactic", "2026-11-14T18:00:00", 120, false),
    ];
    renderPage(false);
    await block(/^Counter-Strike 2, Friday 19:00/);
    const timeline = screen.getByRole("region", { name: "Timeline" });
    expect(
      within(timeline).getAllByRole("button", { name: /^Counter-Strike 2,/ }),
    ).toHaveLength(1);
    expect(
      within(timeline).getAllByRole("button", { name: /^Deep Rock Galactic,/ }),
    ).toHaveLength(1);
    expect(
      within(timeline).getByRole("button", {
        name: /^Deep Rock Galactic, Saturday 12:00/,
      }),
    ).toBeInTheDocument();
  });

  it("explains the auto-schedule window and asks for local-time plans", async () => {
    renderPage(false);
    await block(/^Counter-Strike 2/);
    expect(
      screen.getByText(
        "Auto-schedule window: 10:00 – 01:00 each day (your local time). Suggested sessions are planned inside it; pinned sessions can go any time.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByTitle(/^Auto-schedule window: 10:00 – 01:00/),
    ).toHaveTextContent("Auto-schedule window");
    expect(
      calls.find((c) => c.url.startsWith("/api/events/7/game_schedule"))?.url,
    ).toBe("/api/events/7/game_schedule?tz=Europe%2FLondon");
  });

  it("keeps the last row while dragging through the gap between rows", async () => {
    renderPage(true);
    const cs = await block(/^Counter-Strike 2, Friday 19:00/);
    const rect = (top: number) => ({
      left: 0,
      top,
      right: 1600,
      bottom: top + 52,
      width: 1600,
      height: 52,
      x: 0,
      y: top,
      toJSON: () => ({}),
    });
    [0, 1, 2].forEach((i) =>
      vi
        .spyOn(
          screen.getByTestId(`timeline-track-${i}`),
          "getBoundingClientRect",
        )
        .mockReturnValue(rect(i * 66)),
    );
    fireEvent.pointerDown(cs, {
      pointerType: "mouse",
      button: 0,
      clientX: 100,
      clientY: 20,
    });
    act(() => {
      window.dispatchEvent(
        new MouseEvent("pointermove", { clientX: 100, clientY: 90 }),
      );
    });
    expect(
      await screen.findByText(/^SAT 19:00 → 21:00 · 2h/),
    ).toBeInTheDocument();
    // 60px is in the gap between Friday (0–52) and Saturday (66–118).
    act(() => {
      window.dispatchEvent(
        new MouseEvent("pointermove", { clientX: 100, clientY: 60 }),
      );
    });
    expect(screen.getByText(/^SAT 19:00 → 21:00 · 2h/)).toBeInTheDocument();
    act(() => {
      window.dispatchEvent(new MouseEvent("pointerup"));
    });
    await waitFor(() =>
      expect(calls.find((c) => c.method === "PATCH")?.body).toMatchObject({
        startTime: iso("2026-11-14T19:00:00"),
      }),
    );
  });

  it("signs out when the Steam search reports an expired session", async () => {
    const user = userEvent.setup();
    override = (_method, path) =>
      path === "/api/steam-game"
        ? new Response("", { status: 401 })
        : undefined;
    renderPage(true);
    await block(/^Counter-Strike 2/);
    await user.click(screen.getByRole("button", { name: /Add to schedule/ }));
    await user.type(
      await screen.findByRole("searchbox", { name: "Search games" }),
      "val",
    );
    await waitFor(() => expect(signOut).toHaveBeenCalled());
  });

  it("gives the Show suggested switch a full-size target", async () => {
    renderPage(false);
    const toggle = await screen.findByLabelText("Show suggested");
    expect(toggle.closest(".MuiSwitch-root")).not.toHaveClass(
      "MuiSwitch-sizeSmall",
    );
  });
});
