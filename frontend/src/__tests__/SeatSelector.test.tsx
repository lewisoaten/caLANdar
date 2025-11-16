import {
  describe,
  test,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
  vi,
} from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { UserProvider } from "../UserProvider";
import { SnackbarProvider } from "notistack";
import SeatSelector from "../components/SeatSelector";

const theme = createTheme({ palette: { mode: "dark" } });

// Mock data
const mockSeatingConfig = {
  eventId: 1,
  hasSeating: true,
  allowUnspecifiedSeat: true,
  unspecifiedSeatLabel: "Unspecified Seat",
  createdAt: "2025-01-15T10:00:00Z",
  lastModified: "2025-01-15T10:00:00Z",
};

const mockRooms = [
  {
    id: 1,
    eventId: 1,
    name: "Main Hall",
    description: "The main gaming hall",
    image:
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    sortOrder: 0,
    createdAt: "2025-01-15T10:00:00Z",
    lastModified: "2025-01-15T10:00:00Z",
  },
];

const mockSeats = [
  {
    id: 1,
    eventId: 1,
    roomId: 1,
    label: "A1",
    description: "Front row, left corner",
    x: 0.25,
    y: 0.5,
    createdAt: "2025-01-15T10:00:00Z",
    lastModified: "2025-01-15T10:00:00Z",
  },
  {
    id: 2,
    eventId: 1,
    roomId: 1,
    label: "A2",
    description: "Front row, center",
    x: 0.5,
    y: 0.5,
    createdAt: "2025-01-15T10:00:00Z",
    lastModified: "2025-01-15T10:00:00Z",
  },
];

const mockAvailableSeats = {
  availableSeatIds: [1, 2],
};

// Set up MSW server
const server = setupServer(
  http.get("/api/events/:eventId/seating-config", ({ request }) => {
    console.log("[MSW] seating-config request:", request.url);
    return HttpResponse.json(mockSeatingConfig);
  }),
  http.get("/api/events/:eventId/rooms", ({ request }) => {
    console.log("[MSW] rooms request:", request.url);
    return HttpResponse.json(mockRooms);
  }),
  http.get("/api/events/:eventId/seats", ({ request }) => {
    console.log("[MSW] seats request:", request.url);
    return HttpResponse.json(mockSeats);
  }),
  http.get("/api/events/:eventId/seat-reservations/me", ({ request }) => {
    console.log("[MSW] reservation request:", request.url);
    return new HttpResponse(null, { status: 404 });
  }),
  http.get("/api/events/:eventId/invitations/me", ({ request }) => {
    console.log("[MSW] invitation request:", request.url);
    return HttpResponse.json({
      id: 1,
      eventId: 1,
      email: "test@example.com",
      avatarUrl: null,
      profileUrl: null,
      handle: "TestUser",
      response: "yes",
      attendance: [1, 1, 0, 0],
    });
  }),
  http.post(
    "/api/events/:eventId/seat-reservations/check-availability",
    ({ request }) => {
      console.log("[MSW] check-availability request:", request.url);
      return HttpResponse.json(mockAvailableSeats);
    },
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
beforeEach(() => {
  localStorage.clear();
  // Set up a mock user
  localStorage.setItem(
    "user",
    JSON.stringify({
      token: "mock-token",
      email: "test@example.com",
    }),
  );
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const renderSeatSelector = (props = {}) => {
  const defaultProps = {
    eventId: 1,
    attendanceBuckets: [1, 1, 0, 0],
    disabled: false,
    onReservationChange: vi.fn(),
    ...props,
  };

  return render(
    <MemoryRouter>
      <ThemeProvider theme={theme}>
        <UserProvider>
          <SnackbarProvider>
            <SeatSelector {...defaultProps} />
          </SnackbarProvider>
        </UserProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
};

describe.skip("SeatSelector", () => {
  test("renders seat selection title", async () => {
    renderSeatSelector();
    await waitFor(
      () => {
        expect(screen.getByText("Seat Selection")).toBeInTheDocument();
      },
      { timeout: 5000 },
    );
  });

  test("shows info message when no attendance buckets", async () => {
    renderSeatSelector({ attendanceBuckets: null });
    await waitFor(() => {
      expect(
        screen.getByText(/Please select your RSVP and attendance times above/i),
      ).toBeInTheDocument();
    });
  });

  test("shows unspecified seat option when allowed", async () => {
    renderSeatSelector();
    await waitFor(() => {
      expect(screen.getByText("Unspecified Seat")).toBeInTheDocument();
    });
  });

  test("displays room and seats", async () => {
    renderSeatSelector();
    await waitFor(() => {
      expect(screen.getByText("Main Hall")).toBeInTheDocument();
      expect(screen.getByText(/A1/)).toBeInTheDocument();
      expect(screen.getByText(/A2/)).toBeInTheDocument();
    });
  });

  test("displays legend with seat statuses", async () => {
    renderSeatSelector();
    await waitFor(() => {
      expect(screen.getByText("Available")).toBeInTheDocument();
      expect(screen.getByText("Your Seat")).toBeInTheDocument();
      expect(screen.getByText("Occupied")).toBeInTheDocument();
    });
  });

  test("allows selecting a seat", async () => {
    const user = userEvent.setup();
    const onReservationChange = vi.fn();

    server.use(
      http.post(
        "/api/events/:eventId/seat-reservations/me",
        async ({ request }) => {
          const body = (await request.json()) as {
            seatId: number | null;
            attendanceBuckets: number[];
          };
          return HttpResponse.json(
            {
              id: 1,
              eventId: 1,
              seatId: body.seatId,
              invitationEmail: "test@example.com",
              attendanceBuckets: body.attendanceBuckets,
              createdAt: "2025-01-15T10:00:00Z",
              lastModified: "2025-01-15T10:00:00Z",
            },
            { status: 200 },
          );
        },
      ),
    );

    renderSeatSelector({ onReservationChange });

    await waitFor(() => {
      expect(screen.getByText(/A1/)).toBeInTheDocument();
    });

    // Click on seat A1 button
    const seatButtons = screen.getAllByText(/A1/);
    await user.click(seatButtons[0]);

    await waitFor(() => {
      expect(onReservationChange).toHaveBeenCalled();
    });
  });

  test("shows error on conflict", async () => {
    const user = userEvent.setup();

    server.use(
      http.post("/api/events/:eventId/seat-reservations/me", () => {
        return HttpResponse.json({ error: "Seat conflict" }, { status: 409 });
      }),
    );

    renderSeatSelector();

    await waitFor(() => {
      expect(screen.getByText(/A1/)).toBeInTheDocument();
    });

    const seatButtons = screen.getAllByText(/A1/);
    await user.click(seatButtons[0]);

    await waitFor(() => {
      expect(
        screen.getByText(
          /This seat is already reserved for the selected times/i,
        ),
      ).toBeInTheDocument();
    });
  });

  test("displays current reservation", async () => {
    server.use(
      http.get("/api/events/:eventId/seat-reservations/me", () => {
        return HttpResponse.json(
          {
            id: 1,
            eventId: 1,
            seatId: 1,
            invitationEmail: "test@example.com",
            attendanceBuckets: [1, 1, 0, 0],
            createdAt: "2025-01-15T10:00:00Z",
            lastModified: "2025-01-15T10:00:00Z",
          },
          { status: 200 },
        );
      }),
    );

    renderSeatSelector();

    await waitFor(() => {
      expect(screen.getByText(/You have reserved seat/i)).toBeInTheDocument();
    });
  });

  test("allows removing reservation", async () => {
    const user = userEvent.setup();
    const onReservationChange = vi.fn();

    server.use(
      http.get("/api/events/:eventId/seat-reservations/me", () => {
        return HttpResponse.json(
          {
            id: 1,
            eventId: 1,
            seatId: 1,
            invitationEmail: "test@example.com",
            attendanceBuckets: [1, 1, 0, 0],
            createdAt: "2025-01-15T10:00:00Z",
            lastModified: "2025-01-15T10:00:00Z",
          },
          { status: 200 },
        );
      }),
      http.delete("/api/events/:eventId/seat-reservations/me", () => {
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderSeatSelector({ onReservationChange });

    await waitFor(() => {
      expect(screen.getByText("Remove")).toBeInTheDocument();
    });

    const removeButton = screen.getByText("Remove");
    await user.click(removeButton);

    await waitFor(() => {
      expect(onReservationChange).toHaveBeenCalled();
    });
  });

  test("is disabled when disabled prop is true", async () => {
    renderSeatSelector({ disabled: true });

    await waitFor(() => {
      expect(screen.getByText(/A1/)).toBeInTheDocument();
    });

    const seatButtons = screen.getAllByText(/A1/);
    expect(seatButtons[0]).toBeDisabled();
  });

  test("returns null when seating is not configured", async () => {
    server.use(
      http.get("/api/events/:eventId/seating-config", () => {
        return HttpResponse.json(
          {
            eventId: 1,
            hasSeating: false,
            allowUnspecifiedSeat: false,
            unspecifiedSeatLabel: "",
            createdAt: "2025-01-15T10:00:00Z",
            lastModified: "2025-01-15T10:00:00Z",
          },
          { status: 200 },
        );
      }),
    );

    const { container } = renderSeatSelector();

    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  test("shows keyboard navigation support", async () => {
    const user = userEvent.setup();
    const onReservationChange = vi.fn();

    server.use(
      http.post(
        "/api/events/:eventId/seat-reservations/me",
        async ({ request }) => {
          const body = (await request.json()) as {
            seatId: number | null;
            attendanceBuckets: number[];
          };
          return HttpResponse.json(
            {
              id: 1,
              eventId: 1,
              seatId: body.seatId,
              invitationEmail: "test@example.com",
              attendanceBuckets: body.attendanceBuckets,
              createdAt: "2025-01-15T10:00:00Z",
              lastModified: "2025-01-15T10:00:00Z",
            },
            { status: 200 },
          );
        },
      ),
    );

    renderSeatSelector({ onReservationChange });

    await waitFor(() => {
      expect(screen.getByText(/A1/)).toBeInTheDocument();
    });

    // Get all A1 buttons and find the one that's not disabled
    const seatButtons = screen.getAllByText(/A1/);
    const enabledButton = seatButtons.find(
      (button) => !(button as HTMLButtonElement).disabled,
    );

    if (enabledButton) {
      // Tab to the button and press Enter
      enabledButton.focus();
      await user.keyboard("{Enter}");

      await waitFor(() => {
        expect(onReservationChange).toHaveBeenCalled();
      });
    }
  });
});
