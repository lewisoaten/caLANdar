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
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { delay, http, HttpResponse } from "msw";
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
  unspecifiedSeatLabel: "Bring my own seat",
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

beforeAll(() => server.listen({ onUnhandledFrame: "bypass" }));
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
    const seats = within(region).getByRole("list", { name: "Main Hall seats" });
    expect(within(seats).getAllByRole("listitem")).toHaveLength(3);
    expect(within(seats).getByText(/, taken/)).toBeInTheDocument();
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

  it("clears an assignment once, however often Confirm is clicked", async () => {
    useData();
    let deletes = 0;
    server.use(
      http.delete("/api/events/1/seat-reservations/:email", async () => {
        deletes += 1;
        await delay(50);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const u = userEvent.setup();
    renderComponent();
    await u.click(
      await screen.findByRole("button", {
        name: "Clear seat assignment for nia@example.com",
      }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Clear seat assignment?",
    });
    const confirm = within(dialog).getByRole("button", {
      name: "Clear assignment",
    });
    // Rapid clicks, before the dialog can re-render as busy.
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(deletes).toBe(1);
  });

  it("does not offer 'no seat' in the move dialog when it isn't allowed", async () => {
    useData();
    server.use(
      http.get("/api/events/1/seating-config", () =>
        HttpResponse.json({ ...config(true), allowUnspecifiedSeat: false }),
      ),
    );
    const u = userEvent.setup();
    renderComponent();
    await u.click(
      await screen.findByRole("button", {
        name: "Move nia@example.com to different seat",
      }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Move to a different seat",
    });
    await u.click(within(dialog).getByRole("combobox", { name: "New seat" }));
    expect(await screen.findAllByRole("option")).not.toHaveLength(0);
    expect(
      screen.queryByRole("option", { name: "Bring my own seat" }),
    ).not.toBeInTheDocument();
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
