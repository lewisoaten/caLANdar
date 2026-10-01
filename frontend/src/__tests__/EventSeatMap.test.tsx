import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Role queries over the full page are slow in jsdom (first test also warms up).
vi.setConfig({ testTimeout: 20000 });
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { SnackbarProvider } from "notistack";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import theme from "../theme";
import EventSeatMap, { isOwnInvitation } from "../components/EventSeatMap";
import { UserProvider } from "../UserProvider";

const stamp = "2026-01-01T00:00:00Z";

const seatingConfig = {
  eventId: 1,
  hasSeating: true,
  allowUnspecifiedSeat: true,
  unspecifiedSeatLabel: "Unspecified Seat",
  createdAt: stamp,
  lastModified: stamp,
};

const rooms = [
  {
    id: 1,
    eventId: 1,
    name: "Main Hall",
    description: "Two rows",
    image: null,
    sortOrder: 0,
    createdAt: stamp,
    lastModified: stamp,
    gridRows: 8,
    features: [{ col: 5, row: 0, kind: "screen" }],
  },
  {
    id: 2,
    eventId: 1,
    name: "Games Room",
    description: null,
    image: null,
    sortOrder: 1,
    createdAt: stamp,
    lastModified: stamp,
  },
];

const seat = (
  id: number,
  roomId: number,
  label: string,
  extra: Record<string, unknown>,
) => ({
  id,
  eventId: 1,
  roomId,
  label,
  description: null,
  x: 0.5,
  y: 0.5,
  createdAt: stamp,
  lastModified: stamp,
  ...extra,
});

const seats = [
  seat(1, 1, "A1", { gridCol: 2, gridRow: 2 }),
  seat(2, 1, "A2", { gridCol: 4, gridRow: 2 }),
  // Legacy seat without a grid cell.
  seat(3, 2, "C1", { x: 0.3, y: 0.4 }),
];

const ME_AVATAR = "https://gravatar/me";

type Handler = (init?: RequestInit) => Response;
let routes: Record<string, Handler>;
let calls: Array<{ method: string; url: string; body?: unknown }>;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const baseRoutes = (): Record<string, Handler> => ({
  "GET /api/events/1": () =>
    json({
      id: 1,
      title: "Autumn LAN",
      description: "",
      image: null,
      createdAt: stamp,
      lastModified: stamp,
      timeBegin: "2026-10-16T17:00:00Z",
      timeEnd: "2026-10-18T15:00:00Z",
    }),
  "GET /api/events/1/seating-config": () => json(seatingConfig),
  "GET /api/events/1/rooms": () => json(rooms),
  "GET /api/events/1/seats": () => json(seats),
  "GET /api/events/1/invitations": () =>
    json([
      {
        eventId: 1,
        avatarUrl: null,
        handle: "NoScope_Nia",
        response: "yes",
        attendance: [1, 1],
        seatId: 1,
        lastModified: stamp,
      },
      {
        eventId: 1,
        avatarUrl: null,
        handle: "CasualGamer",
        response: "maybe",
        attendance: [1, 0],
        seatId: null,
        lastModified: stamp,
      },
    ]),
  "GET /api/events/1/invitations/test%40example.com": () =>
    json({
      eventId: 1,
      email: "test@example.com",
      avatarUrl: ME_AVATAR,
      handle: "ProGamer123",
      invitedAt: stamp,
      respondedAt: stamp,
      response: "yes",
      attendance: [1, 1],
      lastModified: stamp,
    }),
  "GET /api/events/1/seat-reservations/me": () => json(null, 404),
  "POST /api/events/1/seat-reservations/check-availability": () =>
    json({ availableSeatIds: [2, 3] }),
});

const reservation = (seatId: number | null) => ({
  id: 7,
  eventId: 1,
  seatId,
  invitationEmail: "test@example.com",
  attendanceBuckets: [1, 1],
  createdAt: stamp,
  lastModified: stamp,
});

beforeEach(() => {
  localStorage.setItem(
    "user_context",
    JSON.stringify({
      token: "test-token",
      email: "test@example.com",
      loggedIn: true,
      isAdmin: false,
    }),
  );
  routes = baseRoutes();
  calls = [];
  vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const method = (init?.method ?? "GET").toUpperCase();
    calls.push({
      method,
      url,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    });
    const handler = routes[`${method} ${url}`];
    if (!handler) return json({ error: "unhandled" }, 500);
    return handler(init);
  });
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

const renderMap = () =>
  render(
    <MemoryRouter initialEntries={["/events/1/seat-map"]}>
      <ThemeProvider theme={theme}>
        <SnackbarProvider>
          <UserProvider>
            <Routes>
              <Route path="/events/:id/seat-map" element={<EventSeatMap />} />
            </Routes>
          </UserProvider>
        </SnackbarProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );

const plan = () => screen.findByRole("group", { name: "Main Hall floor plan" });

describe("EventSeatMap", () => {
  it("shows room tabs with free counts and who's where", async () => {
    renderMap();
    await plan();
    const tabs = screen.getByRole("tablist", { name: "Rooms" });
    const [main, games] = within(tabs).getAllByRole("tab");
    expect(main).toHaveAttribute("aria-selected", "true");
    expect(main).toHaveTextContent("Main Hall1 FREE");
    expect(games).toHaveTextContent("Games Room1 FREE");

    expect(
      await screen.findByRole("button", { name: "A1, taken by NoScope_Nia" }),
    ).toBeDisabled();
    const who = screen.getByRole("heading", { name: /Who's where/i });
    expect(who).toBeInTheDocument();
    expect(screen.getAllByText("NoScope_Nia").length).toBeGreaterThan(0);
    // Attendees without a desk are listed under the own-desk label.
    expect(
      screen.getByRole("heading", { name: "Bring my own desk · 1" }),
    ).toBeInTheDocument();
  });

  it("switches rooms with the arrow keys and draws legacy seats", async () => {
    const user = userEvent.setup();
    renderMap();
    await plan();
    screen.getByRole("tab", { name: /Main Hall/ }).focus();
    await user.keyboard("{ArrowRight}");
    const games = screen.getByRole("tab", { name: /Games Room/ });
    expect(games).toHaveAttribute("aria-selected", "true");
    expect(games).toHaveFocus();
    expect(
      await screen.findByRole("group", { name: "Games Room floor plan" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "C1, free" })).toBeEnabled();
  });

  it("claims a selected desk", async () => {
    const user = userEvent.setup();
    routes["POST /api/events/1/seat-reservations/me"] = () =>
      json(reservation(2));
    renderMap();
    await plan();

    await user.click(await screen.findByRole("button", { name: "A2, free" }));
    expect(
      screen.getByRole("button", { name: "A2, selected" }),
    ).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Claim A2" }));

    expect(await screen.findByText("A2 · Main Hall")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "A2, your seat" }),
    ).toBeInTheDocument();
    expect(
      calls.find(
        (c) => c.method === "POST" && c.url.endsWith("seat-reservations/me"),
      )?.body,
    ).toEqual({ seatId: 2, attendanceBuckets: [1, 1] });
    expect(
      await screen.findByText("Seat reservation saved successfully"),
    ).toBeInTheDocument();
  });

  it("swaps with PUT and releases with DELETE", async () => {
    const user = userEvent.setup();
    routes["GET /api/events/1/seat-reservations/me"] = () =>
      json(reservation(2));
    routes["POST /api/events/1/seat-reservations/check-availability"] = () =>
      json({ availableSeatIds: [3] });
    routes["PUT /api/events/1/seat-reservations/me"] = () =>
      json(reservation(3));
    routes["DELETE /api/events/1/seat-reservations/me"] = () =>
      new Response(null, { status: 204 });
    renderMap();
    await plan();

    expect(
      await screen.findByRole("button", { name: "A2, your seat" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: /Games Room/ }));
    await user.click(screen.getByRole("button", { name: "C1, free" }));
    expect(
      screen.getByText(/Swap from A2 to C1\? Your old seat frees up/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Swap to C1" }));
    expect(await screen.findByText("C1 · Games Room")).toBeInTheDocument();
    expect(calls.some((c) => c.method === "PUT")).toBe(true);

    await user.click(screen.getByRole("button", { name: "Release seat" }));
    expect(await screen.findByText("Pick a desk")).toBeInTheDocument();
    expect(calls.some((c) => c.method === "DELETE")).toBe(true);
  });

  it("shows the server's reason when a claim is refused", async () => {
    const user = userEvent.setup();
    routes["POST /api/events/1/seat-reservations/me"] = () =>
      json(
        {
          error: {
            code: 409,
            reason: "Conflict",
            description:
              "This seat is already reserved for one or more of the selected time buckets",
          },
        },
        409,
      );
    renderMap();
    await plan();
    await user.click(await screen.findByRole("button", { name: "A2, free" }));
    await user.click(screen.getByRole("button", { name: "Claim A2" }));
    expect(
      await screen.findByText(
        "This seat is already reserved for one or more of the selected time buckets",
      ),
    ).toBeInTheDocument();
  });

  it("hides release when a specific seat is required", async () => {
    routes["GET /api/events/1/seating-config"] = () =>
      json({ ...seatingConfig, allowUnspecifiedSeat: false });
    routes["GET /api/events/1/seat-reservations/me"] = () =>
      json(reservation(2));
    renderMap();
    await plan();
    expect(
      await screen.findByText(/needs everyone at a desk/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Release seat" }),
    ).not.toBeInTheDocument();
  });

  it("locks the plan until the user RSVPs", async () => {
    routes["GET /api/events/1/invitations/test%40example.com"] = () =>
      json({
        eventId: 1,
        email: "test@example.com",
        avatarUrl: ME_AVATAR,
        handle: "ProGamer123",
        invitedAt: stamp,
        respondedAt: null,
        response: null,
        attendance: null,
        lastModified: stamp,
      });
    renderMap();
    await plan();
    expect(await screen.findByText("RSVP first")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "RSVP in the lobby" }),
    ).toHaveAttribute("href", "/events/1");
    expect(screen.getByRole("button", { name: "A2, free" })).toBeDisabled();
  });

  it("explains when seating is off", async () => {
    routes["GET /api/events/1/seating-config"] = () =>
      json({ ...seatingConfig, hasSeating: false });
    renderMap();
    expect(
      await screen.findByText("Seating is not enabled for this event."),
    ).toBeInTheDocument();
  });

  it("reports a failed load and retries", async () => {
    const user = userEvent.setup();
    routes["GET /api/events/1/rooms"] = () => json({}, 500);
    renderMap();
    expect(
      await screen.findByText(/Couldn't load the seat map/),
    ).toBeInTheDocument();
    routes["GET /api/events/1/rooms"] = () => json(rooms);
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await plan()).toBeInTheDocument();
  });

  it("shows a failed free-desk check with a retry instead of silently locking desks", async () => {
    const user = userEvent.setup();
    routes["POST /api/events/1/seat-reservations/check-availability"] = () =>
      json({}, 500);
    renderMap();
    await plan();
    expect(
      await screen.findByText(/Couldn't check which desks are free/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "A2, free" })).toBeDisabled();
    routes["POST /api/events/1/seat-reservations/check-availability"] = () =>
      json({ availableSeatIds: [2, 3] });
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "A2, free" })).toBeEnabled(),
    );
    expect(
      screen.queryByText(/Couldn't check which desks are free/),
    ).not.toBeInTheDocument();
  });

  it("uses the server's isSelf and hasSeatReservation markers", async () => {
    routes["GET /api/events/1/invitations"] = () =>
      json([
        {
          eventId: 1,
          avatarUrl: null,
          handle: "ProGamer123",
          response: "yes",
          attendance: [1, 1],
          seatId: null,
          isSelf: true,
          hasSeatReservation: true,
          lastModified: stamp,
        },
        {
          eventId: 1,
          avatarUrl: null,
          handle: "NoDeskYet",
          response: "maybe",
          attendance: [1, 0],
          seatId: null,
          isSelf: false,
          hasSeatReservation: false,
          lastModified: stamp,
        },
      ]);
    routes["GET /api/events/1/seat-reservations/me"] = () =>
      json(reservation(null));
    renderMap();
    await plan();
    // Only the guest who reserved the floating seat counts as "own desk".
    expect(
      await screen.findByRole("heading", { name: "Bring my own desk · 1" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/ProGamer123\s*\(you\)/)).toBeInTheDocument();
    expect(screen.queryByText("NoDeskYet")).not.toBeInTheDocument();
  });

  it("waits for data before rendering", async () => {
    renderMap();
    expect(screen.getByText("Loading seat map…")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByText("Loading seat map…")).not.toBeInTheDocument(),
    );
  });
});

describe("isOwnInvitation", () => {
  const mine = {
    eventId: 1,
    email: "me@example.com",
    avatarUrl: "a",
    handle: "Me",
    invitedAt: null,
    respondedAt: null,
    response: "yes",
    attendance: [1],
    lastModified: null,
  } as unknown as Parameters<typeof isOwnInvitation>[1];
  const row = (extra: Record<string, unknown>) =>
    ({
      eventId: 1,
      avatarUrl: "a",
      handle: "Me",
      response: "yes",
      attendance: [1],
      seatId: null,
      lastModified: null,
      ...extra,
    }) as unknown as Parameters<typeof isOwnInvitation>[0];

  it("trusts the server marker over avatar matching", () => {
    expect(isOwnInvitation(row({ isSelf: false }), mine, null)).toBe(false);
    expect(
      isOwnInvitation(row({ isSelf: true, avatarUrl: "b" }), mine, null),
    ).toBe(true);
  });

  it("falls back to avatar, then handle + seat, on an older API", () => {
    expect(isOwnInvitation(row({}), mine, null)).toBe(true);
    expect(isOwnInvitation(row({ avatarUrl: "b" }), mine, null)).toBe(false);
    expect(isOwnInvitation(row({ avatarUrl: null, seatId: 4 }), mine, 4)).toBe(
      true,
    );
  });
});
