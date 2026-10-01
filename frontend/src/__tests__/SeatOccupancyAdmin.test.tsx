import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  afterEach,
} from "vitest";
import type { ContextType } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import SeatOccupancyAdmin from "../components/SeatOccupancyAdmin";
import { UserContext, UserDispatchContext } from "../UserProvider";
import { SnackbarProvider } from "notistack";

const mockUserDetails = {
  token: "mock-admin-token",
  email: "admin@example.com",
  loggedIn: true,
  isAdmin: true,
};

const mockUserDispatch: ContextType<typeof UserDispatchContext> = {
  signIn: vi.fn(() => Promise.resolve({} as Response)),
  verifyEmail: vi.fn(() => Promise.resolve({} as Response)),
  signOut: vi.fn(),
  isSignedIn: vi.fn(() => true),
};

const STAMP = "2026-01-01T00:00:00Z";
const config = (hasSeating: boolean) => ({
  eventId: 1,
  hasSeating,
  allowUnspecifiedSeat: true,
  unspecifiedSeatLabel: "Bring my own desk",
  createdAt: STAMP,
  lastModified: STAMP,
});

const server = setupServer();
const useData = (hasSeating = true) =>
  server.use(
    http.get("/api/events/1/seating-config", () =>
      HttpResponse.json(config(hasSeating)),
    ),
    http.get("/api/events/1/rooms", () =>
      HttpResponse.json([
        {
          id: 10,
          eventId: 1,
          name: "Main Hall",
          description: "Two rows",
          image: null,
          sortOrder: 0,
          createdAt: STAMP,
          lastModified: STAMP,
        },
      ]),
    ),
    http.get("/api/events/1/seats", () =>
      HttpResponse.json(
        ["A1", "A2", "A3"].map((label, i) => ({
          id: 100 + i,
          eventId: 1,
          roomId: 10,
          label,
          description: null,
          x: 0.2 * i,
          y: 0.5,
          createdAt: STAMP,
          lastModified: STAMP,
        })),
      ),
    ),
    http.get("/api/events/1/seat-reservations", () =>
      HttpResponse.json([
        {
          id: 1,
          eventId: 1,
          seatId: 100,
          invitationEmail: "nia@example.com",
          attendanceBuckets: [1, 1, 0],
          createdAt: STAMP,
          lastModified: STAMP,
        },
        {
          id: 2,
          eventId: 1,
          seatId: null,
          invitationEmail: "dan@example.com",
          attendanceBuckets: [0, 1, 1],
          createdAt: STAMP,
          lastModified: STAMP,
        },
      ]),
    ),
    http.get("/api/events/1/invitations", () =>
      HttpResponse.json([
        {
          eventId: 1,
          email: "nia@example.com",
          avatarUrl: null,
          handle: "NoScope_Nia",
          invitedAt: STAMP,
          respondedAt: STAMP,
          response: "yes",
          attendance: [1, 1, 0],
          lastModified: STAMP,
        },
      ]),
    ),
  );

beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const renderComponent = (eventId = 1, refreshTrigger?: number) =>
  render(
    <MemoryRouter>
      <UserContext.Provider value={mockUserDetails}>
        <UserDispatchContext.Provider value={mockUserDispatch}>
          <SnackbarProvider>
            <SeatOccupancyAdmin
              eventId={eventId}
              refreshTrigger={refreshTrigger}
            />
          </SnackbarProvider>
        </UserDispatchContext.Provider>
      </UserContext.Provider>
    </MemoryRouter>,
  );

describe("SeatOccupancyAdmin", () => {
  it("shows a loading state first", () => {
    useData();
    renderComponent();
    expect(
      screen.getByRole("status", { name: "Loading seat occupancy data" }),
    ).toBeInTheDocument();
  });

  it("summarises occupancy and lists assignments", async () => {
    useData();
    renderComponent();
    const region = await screen.findByRole("region", {
      name: "Seat assignments",
    });
    expect(await within(region).findByText("Total seats")).toBeInTheDocument();
    const desks = within(region).getByRole("list", { name: "Main Hall desks" });
    expect(within(desks).getAllByRole("listitem")).toHaveLength(3);
    expect(within(desks).getByText(/, taken/)).toBeInTheDocument();
    expect(within(region).getByText("NoScope_Nia")).toBeInTheDocument();
    expect(
      within(region).getByRole("list", { name: "Unspecified seat attendees" }),
    ).toHaveTextContent("dan@example.com");
  });

  it("opens the move dialog for an assignment", async () => {
    useData();
    const u = userEvent.setup();
    renderComponent();
    await u.click(
      await screen.findByRole("button", {
        name: "Move nia@example.com to different seat",
      }),
    );
    expect(
      await screen.findByRole("dialog", { name: "Move to a different seat" }),
    ).toBeInTheDocument();
  });

  it("explains when seating is off", async () => {
    useData(false);
    renderComponent();
    expect(await screen.findByText("Seating is off")).toBeInTheDocument();
  });

  it("shows an error with retry when loading fails", async () => {
    server.use(
      http.get(
        "/api/events/1/seating-config",
        () => new HttpResponse(null, { status: 500 }),
      ),
    );
    renderComponent(1, 42);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /failed to load/i,
    );
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
