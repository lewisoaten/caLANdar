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
import RSVPWizard from "../components/RSVPWizard/RSVPWizard";
import moment from "moment";

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
      expect(screen.getByText(/Will you be attending/i)).toBeInTheDocument();
    });
  });

  test("shows Yes, Maybe, No buttons", async () => {
    renderWizard();
    await waitFor(() => {
      expect(screen.getByText("Yes")).toBeInTheDocument();
      expect(screen.getByText("Maybe")).toBeInTheDocument();
      expect(screen.getByText("No")).toBeInTheDocument();
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

    await waitFor(() => {
      expect(screen.getByText("Yes")).toBeInTheDocument();
    });

    const yesButton = screen.getByText("Yes");
    await user.click(yesButton);

    await waitFor(() => {
      const nextButton = screen.getByRole("button", { name: /Next/i });
      expect(nextButton).toBeEnabled();
    });
  });

  test("advances to handle step after selecting Yes", async () => {
    const user = userEvent.setup();
    renderWizard();

    await waitFor(() => {
      expect(screen.getByText("Yes")).toBeInTheDocument();
    });

    const yesButton = screen.getByText("Yes");
    await user.click(yesButton);

    const nextButton = screen.getByRole("button", { name: /Next/i });
    await user.click(nextButton);

    await waitFor(() => {
      expect(screen.getByText(/Enter your gamer handle/i)).toBeInTheDocument();
    });
  });

  test("shows exit warning when closing with unsaved changes", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWizard({ onClose });

    await waitFor(() => {
      expect(screen.getByText("Yes")).toBeInTheDocument();
    });

    const yesButton = screen.getByText("Yes");
    await user.click(yesButton);

    const cancelButton = screen.getByRole("button", { name: /Cancel/i });
    await user.click(cancelButton);

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
    await waitFor(() => {
      expect(screen.getByText("No")).toBeInTheDocument();
    });
    const noButton = screen.getByText("No");
    await user.click(noButton);

    // Advance to review
    const nextButton = screen.getByRole("button", { name: /Next/i });
    await user.click(nextButton);

    // Should show review step
    await waitFor(() => {
      expect(screen.getByText(/Review your RSVP/i)).toBeInTheDocument();
    });

    // Confirm RSVP
    const confirmButton = screen.getByRole("button", {
      name: /Confirm RSVP/i,
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
    await waitFor(() => {
      expect(screen.getByText("Yes")).toBeInTheDocument();
    });
    const yesButton = screen.getByText("Yes");
    await user.click(yesButton);

    // Advance to handle step
    let nextButton = screen.getByRole("button", { name: /Next/i });
    await user.click(nextButton);

    // Should show handle step
    await waitFor(() => {
      expect(screen.getByText(/Enter your gamer handle/i)).toBeInTheDocument();
    });

    // Next button should be disabled without handle
    nextButton = screen.getByRole("button", { name: /Next/i });
    expect(nextButton).toBeDisabled();

    // Enter a handle
    const handleInput = screen.getByLabelText(/Gamer Handle/i);
    await user.type(handleInput, "TestGamer");

    // Next button should be enabled
    await waitFor(() => {
      expect(nextButton).toBeEnabled();
    });
  });
});
