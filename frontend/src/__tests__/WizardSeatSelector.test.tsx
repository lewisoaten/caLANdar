import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { SnackbarProvider } from "notistack";
import { MemoryRouter } from "react-router-dom";
import WizardSeatSelector from "../components/RSVPWizard/WizardSeatSelector";
import { UserProvider } from "../UserProvider";

const theme = createTheme({ palette: { mode: "dark" } });

const mockRooms = [
  {
    id: 1,
    eventId: 1,
    name: "Main Hall",
    description: "",
    image: null,
    sortOrder: 0,
    createdAt: "2025-01-15T10:00:00Z",
    lastModified: "2025-01-15T10:00:00Z",
  },
];

const mockSeats = [
  {
    id: 10,
    eventId: 1,
    roomId: 1,
    label: "Seat 10",
    description: null,
    x: 0.5,
    y: 0.5,
    createdAt: "2025-01-15T10:00:00Z",
    lastModified: "2025-01-15T10:00:00Z",
  },
];

const mockAvailability = { availableSeatIds: [] };

const jsonResponse = (data: unknown) =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: async () => data,
  } as Response);

describe("WizardSeatSelector reserved seat handling", () => {
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

    vi.spyOn(global, "fetch").mockImplementation(
      (
        input: Parameters<typeof fetch>[0],
        _init?: Parameters<typeof fetch>[1],
      ) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;

        if (url.includes("/rooms")) {
          return jsonResponse(mockRooms);
        }

        if (url.includes("/seats")) {
          return jsonResponse(mockSeats);
        }

        if (url.includes("seat-reservations/check-availability")) {
          return jsonResponse(mockAvailability);
        }

        throw new Error(`Unhandled fetch URL: ${url}`);
      },
    );
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  const renderSelector = (reservedSeatId: number | null) => {
    render(
      <MemoryRouter>
        <ThemeProvider theme={theme}>
          <SnackbarProvider>
            <UserProvider>
              <WizardSeatSelector
                eventId={1}
                attendanceBuckets={[1]}
                selectedSeatId={null}
                reservedSeatId={reservedSeatId}
                onSeatSelect={() => {}}
                allowUnspecifiedSeat={false}
                disabled={false}
              />
            </UserProvider>
          </SnackbarProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );
  };

  it("keeps an unavailable seat disabled when the user has no reservation", async () => {
    renderSelector(null);

    const seatButton = await screen.findByRole("button", { name: /Seat 10/ });
    expect(seatButton).toBeDisabled();
  });

  it("allows reselecting a seat reserved by the user", async () => {
    renderSelector(10);

    const seatButton = await screen.findByRole("button", { name: /Seat 10/ });
    expect(seatButton).not.toBeDisabled();
  });
});
