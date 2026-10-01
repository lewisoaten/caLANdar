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
import RSVPWizard, {
  getWizardSteps,
} from "../components/RSVPWizard/RSVPWizard";
import { RSVP } from "../types/invitations";
import moment from "moment";
import * as Sentry from "@sentry/react";
import { ApiError } from "../utils/apiError";

vi.mock("@sentry/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@sentry/react")>()),
  captureException: vi.fn(),
}));

const theme = createTheme({ palette: { mode: "dark" } });

// Mock event data
const mockEvent = {
  id: 1,
  title: "Test LAN Party",
  description: "A test event",
  timeBegin: moment().add(1, "days"),
  timeEnd: moment().add(2, "days"),
  image: undefined,
  createdAt: moment(),
  lastModified: moment(),
};

// Set up MSW server
const server = setupServer(
  http.get("/api/events/:eventId/seating-config", () => {
    return HttpResponse.json({
      eventId: 1,
      hasSeating: false,
      allowUnspecifiedSeat: false,
      unspecifiedSeatLabel: "",
      createdAt: "2025-01-15T10:00:00Z",
      lastModified: "2025-01-15T10:00:00Z",
    });
  }),
  http.patch("/api/events/:eventId/invitations/*", async ({ request }) => {
    // Match any email (encoded or not)
    const body = await request.json();
    expect(body).toMatchObject({ response: expect.any(String) });
    return new HttpResponse(null, { status: 204 });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
beforeEach(() => {
  localStorage.clear();
  // UserProvider restores the session from "user_context"; storing it under
  // any other key leaves the wizard signed out, with no token or email.
  localStorage.setItem(
    "user_context",
    JSON.stringify({
      token: "mock-token",
      email: "test@example.com",
      loggedIn: true,
      isAdmin: false,
    }),
  );
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const yesButton = () => screen.getByRole("button", { name: /I'm in/i });
const noButton = () => screen.getByRole("button", { name: /Can't make it/i });
const yesButtonGone = () =>
  screen.queryByRole("button", { name: /I'm in/i }) === null;

const renderWizard = (props = {}) => {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    event: mockEvent,
    onSaved: vi.fn(),
    ...props,
  };

  return render(
    <MemoryRouter>
      <ThemeProvider theme={theme}>
        <UserProvider>
          <SnackbarProvider>
            <RSVPWizard {...defaultProps} />
          </SnackbarProvider>
        </UserProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
};

describe("RSVPWizard", () => {
  test("renders wizard dialog with title", async () => {
    renderWizard();
    await waitFor(() => {
      expect(screen.getByText(/RSVP to Test LAN Party/i)).toBeInTheDocument();
    });
  });

  test("shows response step initially", async () => {
    renderWizard();
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /Are you coming/i }),
      ).toBeInTheDocument();
    });
  });

  test("shows I'm in, Maybe, Can't make it toggle buttons", async () => {
    renderWizard();
    await waitFor(() => {
      expect(yesButton()).toHaveAttribute("aria-pressed", "false");
      expect(screen.getByRole("button", { name: /Maybe/ })).toBeInTheDocument();
      expect(noButton()).toBeInTheDocument();
    });
  });

  test("disables Next button until response is selected", async () => {
    renderWizard();
    await waitFor(() => {
      const nextButton = screen.getByRole("button", { name: /Next/i });
      expect(nextButton).toBeDisabled();
    });
  });

  test("enables Next button after selecting response", async () => {
    const user = userEvent.setup();
    renderWizard();

    await waitFor(() => expect(yesButton()).toBeInTheDocument());

    await user.click(yesButton());

    await waitFor(() => {
      const nextButton = screen.getByRole("button", { name: /Next/i });
      expect(nextButton).toBeEnabled();
    });
  });

  test("advances to the attendance step after selecting Yes", async () => {
    const user = userEvent.setup();
    renderWizard();

    await waitFor(() => expect(yesButton()).toBeInTheDocument());

    await user.click(yesButton());

    const nextButton = screen.getByRole("button", { name: /Next/i });
    await user.click(nextButton);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /When are you there/i }),
      ).toBeInTheDocument();
    });
    expect(yesButtonGone()).toBe(true);
  });

  test("shows exit warning when closing with unsaved changes", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWizard({ onClose });

    await waitFor(() => expect(yesButton()).toBeInTheDocument());

    await user.click(yesButton());

    await user.click(screen.getByRole("button", { name: "Close" }));

    await waitFor(() => {
      expect(screen.getByText(/Unsaved Changes/i)).toBeInTheDocument();
    });
  });

  test("completes full wizard flow for No response", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    const onClose = vi.fn();
    renderWizard({ onSaved, onClose });

    // Select No
    await waitFor(() => expect(noButton()).toBeInTheDocument());
    await user.click(noButton());

    // Advance to review
    const nextButton = screen.getByRole("button", { name: /Next/i });
    await user.click(nextButton);

    // Should show review step
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /Review & lock in/i }),
      ).toBeInTheDocument();
    });

    // Confirm RSVP
    const confirmButton = screen.getByRole("button", {
      name: /Lock it in/i,
    });
    await user.click(confirmButton);

    // Should call onSaved and onClose
    await waitFor(
      () => {
        expect(onSaved).toHaveBeenCalled();
        expect(onClose).toHaveBeenCalled();
      },
      { timeout: 3000 },
    );
  });

  test("validates handle before allowing to proceed", async () => {
    const user = userEvent.setup();
    renderWizard();

    // Select Yes
    await waitFor(() => expect(yesButton()).toBeInTheDocument());
    await user.click(yesButton());

    // Advance past attendance (defaults to every block) to the callsign step
    let nextButton = screen.getByRole("button", { name: /Next/i });
    await user.click(nextButton);
    await user.click(screen.getByRole("button", { name: /Next/i }));

    // Should show handle step
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /Your callsign/i }),
      ).toBeInTheDocument();
    });

    // Next button should be disabled without handle
    nextButton = screen.getByRole("button", { name: /Next/i });
    expect(nextButton).toBeDisabled();

    // Enter a handle
    const handleInput = screen.getByRole("textbox", { name: /Callsign/i });
    await user.type(handleInput, "TestGamer");

    // Next button should be enabled
    await waitFor(() => {
      expect(nextButton).toBeEnabled();
    });
  });
});

describe("RSVPWizard seat reservation failures", () => {
  let directLookups: string[] = [];
  const seatingHandlers = (seatResponse: () => Response) => [
    http.get("/api/events/:eventId/seating-config", () =>
      HttpResponse.json({
        eventId: 1,
        hasSeating: true,
        allowUnspecifiedSeat: true,
        unspecifiedSeatLabel: "Unspecified",
        createdAt: "2025-01-15T10:00:00Z",
        lastModified: "2025-01-15T10:00:00Z",
      }),
    ),
    // The guest's own reservation comes from the squad list (no 404 for
    // "none"); the direct lookup must not be hit at all.
    http.get("/api/events/:eventId/invitations", () => HttpResponse.json([])),
    http.get("/api/events/:eventId/seat-reservations/me", () => {
      directLookups.push("GET me");
      return HttpResponse.json({}, { status: 404 });
    }),
    http.get("/api/events/:eventId/rooms", () => HttpResponse.json([])),
    http.get("/api/events/:eventId/seats", () => HttpResponse.json([])),
    http.post("/api/events/:eventId/seat-reservations/check-availability", () =>
      HttpResponse.json({ availableSeatIds: [] }),
    ),
    http.delete("/api/events/:eventId/seat-reservations/me", () => {
      // Saving the RSVP already released the old reservation server-side.
      directLookups.push("DELETE me");
      return new HttpResponse(null, { status: 404 });
    }),
    http.post("/api/events/:eventId/seat-reservations/me", seatResponse),
  ];

  const completeYesRsvp = async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    renderWizard({ onSaved });

    await waitFor(() => expect(yesButton()).toBeInTheDocument());
    await user.click(yesButton());
    // Response, then attendance (defaults to every block).
    await user.click(screen.getByRole("button", { name: /Next/i }));
    await user.click(screen.getByRole("button", { name: /Next/i }));
    await user.type(
      await screen.findByRole("textbox", { name: /Callsign/i }),
      "Josh",
    );
    // Callsign and seat steps, then confirm on the review step.
    while (!screen.queryByRole("button", { name: /Lock it in/i })) {
      await user.click(screen.getByRole("button", { name: /Next/i }));
    }
    await user.click(screen.getByRole("button", { name: /Lock it in/i }));
    return onSaved;
  };

  beforeEach(() => {
    vi.mocked(Sentry.captureException).mockClear();
    directLookups = [];
  });

  test("keeps 'bring my own seat' after attendance changes and never 404s", async () => {
    let posted: unknown = null;
    server.use(
      ...seatingHandlers(() => new HttpResponse(null, { status: 201 })),
    );
    server.use(
      http.post(
        "/api/events/:eventId/seat-reservations/me",
        async ({ request }) => {
          posted = await request.json();
          return HttpResponse.json({ id: 1, seatId: null }, { status: 201 });
        },
      ),
    );
    const user = userEvent.setup();
    renderWizard();
    await user.click(await screen.findByRole("button", { name: /I'm in/i }));
    await user.click(screen.getByRole("button", { name: /Next/i }));
    // Changing attendance used to null the seat label ("Not selected").
    const blocks = (
      await screen.findByRole("group", { name: "Attendance blocks" })
    ).querySelectorAll("button");
    await user.click(blocks[0]);
    await user.click(screen.getByRole("button", { name: /Next/i }));
    await user.type(
      await screen.findByRole("textbox", { name: /Callsign/i }),
      "Josh",
    );
    while (!screen.queryByRole("button", { name: /Lock it in/i })) {
      await user.click(screen.getByRole("button", { name: /Next/i }));
    }
    expect(screen.getByText("Unspecified")).toBeInTheDocument();
    expect(screen.queryByText(/Not selected/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Lock it in/i }));
    await waitFor(() => expect(posted).toMatchObject({ seatId: null }));
    expect(directLookups).toEqual([]);
  });

  test("reports a server error to Sentry without exposing its details", async () => {
    server.use(
      ...seatingHandlers(() =>
        HttpResponse.json(
          {
            error: {
              code: 500,
              reason: "Internal Server Error",
              description: 'violates foreign key constraint "fk_invitation"',
            },
          },
          { status: 500 },
        ),
      ),
    );

    const onSaved = await completeYesRsvp();

    expect(
      await screen.findByText(
        /RSVP saved, but your seat couldn't be reserved\. Please try again/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/fk_invitation/)).not.toBeInTheDocument();
    expect(onSaved).toHaveBeenCalled();

    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    const [error, context] = vi.mocked(Sentry.captureException).mock.calls[0];
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(500);
    expect((error as ApiError).description).toContain("fk_invitation");
    expect(context).toMatchObject({
      level: "error",
      tags: { rsvp_step: "seat_reservation", http_status: "500" },
      extra: { eventId: 1, status: 500 },
    });
  });

  test("shows the server's reason for a client error", async () => {
    server.use(
      ...seatingHandlers(() =>
        HttpResponse.json(
          {
            error: {
              code: 409,
              reason: "Conflict",
              description:
                "This seat is already reserved for one or more of the selected time buckets",
            },
          },
          { status: 409 },
        ),
      ),
    );

    await completeYesRsvp();

    expect(
      await screen.findByText(
        "RSVP saved, but your seat couldn't be reserved: This seat is already reserved for one or more of the selected time buckets",
      ),
    ).toBeInTheDocument();
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    // An expected outcome: reported as a warning with its status attached.
    expect(vi.mocked(Sentry.captureException).mock.calls[0][1]).toMatchObject({
      level: "warning",
      tags: { rsvp_step: "seat_reservation", http_status: "409" },
      extra: { status: 409 },
    });
  });
});

describe("getWizardSteps", () => {
  test("orders response, attendance, callsign, seat, review", () => {
    expect(getWizardSteps(RSVP.yes, true)).toEqual([
      "Response",
      "Attendance",
      "Handle",
      "Seat",
      "Review",
    ]);
  });

  test("skips the seat step without seating", () => {
    expect(getWizardSteps(RSVP.maybe, false)).toEqual([
      "Response",
      "Attendance",
      "Handle",
      "Review",
    ]);
    expect(getWizardSteps(null, false)).toHaveLength(4);
  });

  test("goes straight to review for a no", () => {
    expect(getWizardSteps(RSVP.no, true)).toEqual(["Response", "Review"]);
  });
});

describe("RSVPWizard dialog behaviour", () => {
  test("is a labelled modal dialog showing the step count", async () => {
    renderWizard();
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAccessibleName(
      /RSVP to Test LAN Party.*Are you coming/i,
    );
    expect(screen.getByText(/STEP 1 \/ 4/)).toBeInTheDocument();
  });

  test("marks the chosen response as pressed", async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.click(await screen.findByRole("button", { name: /Maybe/ }));
    expect(screen.getByRole("button", { name: /Maybe/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(yesButton()).toHaveAttribute("aria-pressed", "false");
  });

  test("Escape with unsaved changes asks before closing", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWizard({ onClose });
    await user.click(await screen.findByRole("button", { name: /I'm in/i }));
    await user.keyboard("{Escape}");
    expect(
      await screen.findByRole("heading", { name: /Unsaved changes/i }),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /Discard changes/i }));
    expect(onClose).toHaveBeenCalled();
  });

  test("closes straight away when nothing changed", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWizard({ onClose });
    await user.click(await screen.findByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
    expect(screen.queryByText(/Unsaved changes/i)).not.toBeInTheDocument();
  });

  test("moves focus to the new step heading", async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.click(await screen.findByRole("button", { name: /I'm in/i }));
    await user.click(screen.getByRole("button", { name: /Next/i }));
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: /When are you there/i }),
      ).toHaveFocus(),
    );
  });

  test("attendance blocks toggle and block Next when none are picked", async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.click(await screen.findByRole("button", { name: /I'm in/i }));
    await user.click(screen.getByRole("button", { name: /Next/i }));
    await user.click(await screen.findByRole("button", { name: "Clear" }));
    expect(screen.getByRole("button", { name: /Next/i })).toBeDisabled();
    expect(
      screen.getByText(/Pick at least one block to continue/),
    ).toBeInTheDocument();
    const blocks = screen
      .getByRole("group", { name: "Attendance blocks" })
      .querySelectorAll("button");
    expect(blocks.length).toBeGreaterThan(0);
    await user.click(blocks[0]);
    expect(blocks[0]).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Next/i })).toBeEnabled();
  });

  test("announces a saved RSVP to the rest of the app", async () => {
    const user = userEvent.setup();
    const listener = vi.fn();
    window.addEventListener("calandar:rsvp-updated", listener);
    renderWizard();
    await user.click(
      await screen.findByRole("button", { name: /Can't make it/i }),
    );
    await user.click(screen.getByRole("button", { name: /Next/i }));
    await user.click(screen.getByRole("button", { name: /Lock it in/i }));
    await waitFor(() => expect(listener).toHaveBeenCalledTimes(1));
    window.removeEventListener("calandar:rsvp-updated", listener);
  });
});
