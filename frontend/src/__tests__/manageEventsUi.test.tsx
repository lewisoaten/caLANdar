import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  afterEach,
} from "vitest";
import type { ContextType, ReactElement } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ThemeProvider } from "@mui/material/styles";
import { SnackbarProvider } from "notistack";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import theme from "../theme";
import { UserContext, UserDispatchContext } from "../UserProvider";
import EventTable from "../components/EventTable";
import EventManagement from "../components/EventManagement";
import EventsAdmin from "../components/EventsAdmin";

const user = {
  token: "t",
  email: "admin@example.com",
  loggedIn: true,
  isAdmin: true,
};
const dispatch: ContextType<typeof UserDispatchContext> = {
  signIn: vi.fn(() => Promise.resolve({} as Response)),
  verifyEmail: vi.fn(() => Promise.resolve({} as Response)),
  signOut: vi.fn(),
  isSignedIn: vi.fn(() => true),
};

const wrap = (ui: ReactElement, path = "/admin/events") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <ThemeProvider theme={theme}>
        <UserContext.Provider value={user}>
          <UserDispatchContext.Provider value={dispatch}>
            <SnackbarProvider>{ui}</SnackbarProvider>
          </UserDispatchContext.Provider>
        </UserContext.Provider>
      </ThemeProvider>
    </MemoryRouter>,
  );

const ev = (id: number, title: string, status: string, invited = 4) => ({
  id,
  title,
  description: "d",
  image: null,
  timeBegin: "2026-10-16T18:00:00Z",
  timeEnd: "2026-10-18T16:00:00Z",
  createdAt: "2026-01-01T00:00:00Z",
  lastModified: "2026-01-01T00:00:00Z",
  status,
  rsvp: { invited, yes: 2, maybe: 1, no: 0, pending: invited - 3 },
});

const requests: URLSearchParams[] = [];
const all = Array.from({ length: 8 }, (_, i) =>
  ev(i + 1, `Event ${i + 1}`, i < 2 ? "live" : i < 3 ? "draft" : "ended"),
);

const server = setupServer(
  http.get("/api/events", ({ request }) => {
    const q = new URL(request.url).searchParams;
    requests.push(q);
    const search = (q.get("search") ?? "").toLowerCase();
    const status = q.get("status") ?? "all";
    const page = Number(q.get("page"));
    const limit = Number(q.get("limit"));
    const searched = all.filter((e) => e.title.toLowerCase().includes(search));
    const list =
      status === "all" ? searched : searched.filter((e) => e.status === status);
    return HttpResponse.json({
      events: list.slice((page - 1) * limit, page * limit),
      total: list.length,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(list.length / limit)),
      counts: {
        all: searched.length,
        live: searched.filter((e) => e.status === "live").length,
        draft: searched.filter((e) => e.status === "draft").length,
        ended: searched.filter((e) => e.status === "ended").length,
      },
    });
  }),
);

beforeAll(() => server.listen({ onUnhandledFrame: "bypass" }));
afterEach(() => {
  server.resetHandlers();
  requests.length = 0;
});
afterAll(() => server.close());

describe("EventTable (admin)", () => {
  it("shows a page of rows with counts, RSVP text and manage links", async () => {
    wrap(<EventTable asAdmin pageSize={6} />);
    const table = await screen.findByRole("table", { name: "Events" });
    await within(table).findByText("Event 1");
    expect(within(table).getAllByRole("row")).toHaveLength(7); // header + 6
    expect(
      within(table).getAllByText("2 IN · 1 MAYBE · 0 OUT · 1 PENDING"),
    ).not.toHaveLength(0);
    expect(
      screen.getByRole("link", { name: "Manage Event 1" }),
    ).toHaveAttribute("href", "/admin/events/1");
    expect(screen.getByRole("button", { name: /all\s*8/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("1–6 OF 8")).toBeInTheDocument();
  });

  it("filters by status server-side and resets to page 1", async () => {
    const u = userEvent.setup();
    wrap(<EventTable asAdmin pageSize={6} />);
    await screen.findByText("Event 1");
    await u.click(screen.getByRole("button", { name: "Page 2" }));
    await screen.findByText("Event 7");
    await u.click(screen.getByRole("button", { name: /draft\s*1/i }));
    await screen.findByText("Event 3");
    const last = requests[requests.length - 1];
    expect(last.get("status")).toBe("draft");
    expect(last.get("page")).toBe("1");
    expect(screen.queryByText("Event 1")).not.toBeInTheDocument();
  });

  it("searches (debounced) and shows the no-match state", async () => {
    const u = userEvent.setup();
    wrap(<EventTable asAdmin pageSize={6} />);
    await screen.findByText("Event 1");
    await u.type(
      screen.getByRole("searchbox", { name: "Search events" }),
      "zzz",
    );
    expect(await screen.findByText("No events match")).toBeInTheDocument();
    expect(requests[requests.length - 1].get("search")).toBe("zzz");
  });

  it("shows an error with retry", async () => {
    server.use(
      http.get("/api/events", () => new HttpResponse(null, { status: 500 })),
    );
    wrap(<EventTable asAdmin />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /couldn't load events/i,
    );
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});

describe("EventsAdmin", () => {
  it("toggles the inline new-event form", async () => {
    const u = userEvent.setup();
    wrap(<EventsAdmin />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Manage events" }),
    ).toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: "New event" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await u.click(toggle);
    expect(screen.getByRole("form", { name: "New event" })).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });
});

describe("EventManagement", () => {
  const eventBody = {
    id: 7,
    title: "Autumn LAN 2026",
    description: "Bring a rig.",
    image: null,
    timeBegin: "2026-10-16T18:00:00Z",
    timeEnd: "2026-10-18T16:00:00Z",
    createdAt: "2026-01-01T00:00:00Z",
    lastModified: "2026-01-01T00:00:00Z",
  };
  const room = (id: number, name: string) => ({
    id,
    eventId: 7,
    name,
    description: null,
    image: null,
    sortOrder: id,
    createdAt: "2026-01-01T00:00:00Z",
    lastModified: "2026-01-01T00:00:00Z",
  });

  const renderPage = (path: string) =>
    wrap(
      <Routes>
        <Route path="/admin/events/:id" element={<EventManagement />} />
      </Routes>,
      path,
    );

  it("renders the Details tab and switches tabs", async () => {
    server.use(
      http.get("/api/events/7", () => HttpResponse.json(eventBody)),
      http.get("/api/events/7/invitations", () => HttpResponse.json([])),
      http.get("/api/events/7/seat-reservations", () => HttpResponse.json([])),
      http.get("/api/events/7/rooms", () => HttpResponse.json([])),
      http.get("/api/events/7/seats", () => HttpResponse.json([])),
    );
    const u = userEvent.setup();
    renderPage("/admin/events/7");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Autumn LAN 2026" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Details" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      await screen.findByDisplayValue("Autumn LAN 2026"),
    ).toBeInTheDocument();
    await u.click(screen.getByRole("tab", { name: "Roster" }));
    expect(await screen.findByText("Nobody invited yet")).toBeInTheDocument();
  });

  it("lists rooms with seat counts and links to the room editor", async () => {
    server.use(
      http.get("/api/events/7", () => HttpResponse.json(eventBody)),
      http.get("/api/events/7/rooms", () =>
        HttpResponse.json([room(1, "Main Hall"), room(2, "Games Room")]),
      ),
      http.get("/api/events/7/seats", () =>
        HttpResponse.json([
          {
            id: 1,
            eventId: 7,
            roomId: 1,
            label: "A1",
            description: null,
            x: 0.1,
            y: 0.1,
          },
          {
            id: 2,
            eventId: 7,
            roomId: 1,
            label: "A2",
            description: null,
            x: 0.2,
            y: 0.1,
          },
          {
            id: 3,
            eventId: 7,
            roomId: 2,
            label: "B1",
            description: null,
            x: 0.2,
            y: 0.1,
          },
        ]),
      ),
      http.get("/api/events/7/seating-config", () =>
        HttpResponse.json({
          eventId: 7,
          hasSeating: true,
          allowUnspecifiedSeat: true,
          unspecifiedSeatLabel: "Bring my own seat",
          createdAt: "2026-01-01T00:00:00Z",
          lastModified: "2026-01-01T00:00:00Z",
        }),
      ),
      http.get("/api/events/7/seat-reservations", () => HttpResponse.json([])),
      http.get("/api/events/7/invitations", () => HttpResponse.json([])),
    );
    renderPage("/admin/events/7?tab=seating");
    const rooms = await screen.findByRole("region", { name: "Rooms" });
    expect(await within(rooms).findByText("2 SEATS")).toBeInTheDocument();
    expect(within(rooms).getByText("1 SEAT")).toBeInTheDocument();
    expect(
      within(rooms).getByRole("link", { name: /add room/i }),
    ).toHaveAttribute("href", "/admin/events/7/rooms");
    expect(
      within(rooms).getByRole("link", { name: "Edit Main Hall floor plan" }),
    ).toHaveAttribute("href", "/admin/events/7/rooms");
    expect(
      await screen.findByRole("switch", { name: /seat map enabled/i }),
    ).toBeInTheDocument();
    // Occupancy summary loaded too.
    await waitFor(() =>
      expect(screen.getByText("Total seats")).toBeInTheDocument(),
    );
  });

  it("shows a not-found state", async () => {
    server.use(
      http.get("/api/events/8", () => new HttpResponse(null, { status: 404 })),
    );
    renderPage("/admin/events/8");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Event not found" }),
    ).toBeInTheDocument();
  });
});
