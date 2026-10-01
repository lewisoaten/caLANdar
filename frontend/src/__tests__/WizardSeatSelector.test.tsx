import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

let mockAvailability: { availableSeatIds: number[] } = {
  availableSeatIds: [],
};
// Number of check-availability calls left to fail with a 500.
let availabilityFailures = 0;

const mockInvitations = [
  {
    eventId: 1,
    avatarUrl: null,
    handle: "NoScope_Nia",
    response: "yes",
    attendance: [1],
    seatId: 10,
    lastModified: "2025-01-15T10:00:00Z",
  },
];

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

        if (url.endsWith("/invitations")) {
          return jsonResponse(mockInvitations);
        }

        if (url.includes("/rooms")) {
          return jsonResponse(mockRooms);
        }

        if (url.includes("/seats")) {
          return jsonResponse(mockSeats);
        }

        if (url.includes("seat-reservations/check-availability")) {
          if (availabilityFailures > 0) {
            availabilityFailures--;
            return Promise.resolve({
              ok: false,
              status: 500,
              json: async () => ({}),
            } as Response);
          }
          return jsonResponse(mockAvailability);
        }

        throw new Error(`Unhandled fetch URL: ${url}`);
      },
    );
  });

  afterEach(() => {
    mockAvailability = { availableSeatIds: [] };
    availabilityFailures = 0;
    localStorage.clear();
    vi.restoreAllMocks();
  });

  const renderSelector = (
    reservedSeatId: number | null,
    extra: {
      allowUnspecifiedSeat?: boolean;
      selectedSeatId?: number | null;
      onSeatSelect?: (
        seatId: number | null,
        label?: string,
        roomName?: string,
      ) => void;
    } = {},
  ) => {
    render(
      <MemoryRouter>
        <ThemeProvider theme={theme}>
          <SnackbarProvider>
            <UserProvider>
              <WizardSeatSelector
                eventId={1}
                attendanceBuckets={[1]}
                selectedSeatId={extra.selectedSeatId ?? null}
                reservedSeatId={reservedSeatId}
                onSeatSelect={extra.onSeatSelect ?? (() => {})}
                allowUnspecifiedSeat={extra.allowUnspecifiedSeat ?? false}
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

  it("shows who has taken an unavailable seat", async () => {
    renderSelector(null);

    expect(
      await screen.findByRole("button", {
        name: /Seat 10, taken by NoScope_Nia/,
      }),
    ).toBeDisabled();
  });

  it("selects a free seat with its label and room", async () => {
    mockAvailability = { availableSeatIds: [10] };
    const onSeatSelect = vi.fn();
    renderSelector(null, { onSeatSelect });

    const seat = await screen.findByRole("button", { name: /Seat 10, free/ });
    expect(seat).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(seat);
    expect(onSeatSelect).toHaveBeenCalledWith(10, "Seat 10", "Main Hall");
  });

  it("names a seat in the picker and passes its name to the review", async () => {
    mockAvailability = { availableSeatIds: [10] };
    const original = { ...mockSeats[0] };
    Object.assign(mockSeats[0], {
      label: "WS",
      name: "Wall sofa (S)",
      description: "By the TV",
    });
    try {
      const onSeatSelect = vi.fn();
      renderSelector(null, { onSeatSelect, selectedSeatId: 10 });
      const seat = await screen.findByRole("button", {
        name: /^WS, Wall sofa \(S\), By the TV/,
      });
      expect(seat).toHaveTextContent("WS");
      expect(
        screen.getByText("You selected Wall sofa (S) · WS — By the TV"),
      ).toBeInTheDocument();
      await userEvent.click(seat);
      // Pressing the selected seat deselects it; pick it again from scratch.
      expect(onSeatSelect).toHaveBeenCalledWith(null);
    } finally {
      mockSeats.splice(0, 1, original);
    }
  });

  it("passes the seat's name and identifier when picking it", async () => {
    mockAvailability = { availableSeatIds: [10] };
    const original = { ...mockSeats[0] };
    Object.assign(mockSeats[0], { label: "WS", name: "Wall sofa (S)" });
    try {
      const onSeatSelect = vi.fn();
      renderSelector(null, { onSeatSelect });
      await userEvent.click(
        await screen.findByRole("button", {
          name: /^WS, Wall sofa \(S\), free/,
        }),
      );
      expect(onSeatSelect).toHaveBeenCalledWith(
        10,
        "Wall sofa (S) · WS",
        "Main Hall",
      );
    } finally {
      mockSeats.splice(0, 1, original);
    }
  });

  it("deselects the picked seat when pressed again", async () => {
    mockAvailability = { availableSeatIds: [10] };
    const onSeatSelect = vi.fn();
    renderSelector(null, { onSeatSelect, selectedSeatId: 10 });

    const seat = await screen.findByRole("button", {
      name: /Seat 10, selected/,
    });
    expect(seat).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(seat);
    expect(onSeatSelect).toHaveBeenCalledWith(null);
  });

  it("offers Bring my own seat when unspecified seats are allowed", async () => {
    const onSeatSelect = vi.fn();
    renderSelector(null, {
      allowUnspecifiedSeat: true,
      selectedSeatId: 10,
      onSeatSelect,
    });

    const byo = await screen.findByRole("button", {
      name: /Bring my own seat/,
    });
    expect(byo).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(byo);
    expect(onSeatSelect).toHaveBeenCalledWith(
      null,
      "Bring my own seat",
      undefined,
    );
  });

  it("hides Bring my own seat when a specific seat is required", async () => {
    renderSelector(null);

    await screen.findByRole("button", { name: /Seat 10/ });
    expect(
      screen.queryByRole("button", { name: /Bring my own seat/ }),
    ).not.toBeInTheDocument();
  });

  it("shows an error with a retry instead of marking every seat taken", async () => {
    availabilityFailures = 1;
    mockAvailability = { availableSeatIds: [10] };
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderSelector(null, { allowUnspecifiedSeat: true });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Couldn't check which seats are free/,
    );
    expect(
      screen.queryByRole("button", { name: /Seat 10/ }),
    ).not.toBeInTheDocument();
    // Bring-your-own stays available while the plan is unavailable.
    expect(
      screen.getByRole("button", { name: /Bring my own seat/ }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(
      await screen.findByRole("button", { name: /Seat 10, free/ }),
    ).toBeEnabled();
  });
});
