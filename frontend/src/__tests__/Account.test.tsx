import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "../test/test-utils";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import Account from "../components/Account";

// Mock profile data
const mockProfile = {
  steamId: "76561198000000000",
  games: [],
  gameCount: 0,
};

// Create MSW server for API mocking
const server = setupServer(
  // Default handler for profile fetch that happens on mount
  http.get("/api/profile", () => {
    return HttpResponse.json(mockProfile, { status: 200 });
  }),
);

beforeEach(() => {
  server.listen({ onUnhandledRequest: "bypass" });
});

afterEach(() => {
  server.resetHandlers();
  server.close();
});

describe("Account - Refresh Games Button", () => {
  test("button is enabled by default", async () => {
    render(<Account />);
    const button = await screen.findByRole("button", {
      name: /refresh games/i,
    });
    expect(button).toBeEnabled();
  });

  test("shows loading indicator when refresh is clicked", async () => {
    server.use(
      http.post("/api/profile/games/update", () => {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve(HttpResponse.json({}, { status: 200 }));
          }, 100);
        });
      }),
    );

    render(<Account />);

    const button = await screen.findByRole("button", {
      name: /refresh games/i,
    });
    await userEvent.click(button);

    // Button should be disabled during loading
    expect(button).toBeDisabled();
  });

  test("shows success notification after successful refresh", async () => {
    server.use(
      http.post("/api/profile/games/update", () => {
        return HttpResponse.json({}, { status: 200 });
      }),
    );

    render(<Account />);

    const button = await screen.findByRole("button", {
      name: /refresh games/i,
    });
    await userEvent.click(button);

    // Wait for success notification
    await waitFor(() => {
      expect(
        screen.getByText(/games refreshed successfully/i),
      ).toBeInTheDocument();
    });

    // Button should be re-enabled after completion
    await waitFor(() => {
      expect(button).toBeEnabled();
    });
  });

  test("shows error notification on failure", async () => {
    server.use(
      http.post("/api/profile/games/update", () => {
        return HttpResponse.json({ error: "Server error" }, { status: 500 });
      }),
    );

    render(<Account />);

    const button = await screen.findByRole("button", {
      name: /refresh games/i,
    });
    await userEvent.click(button);

    // Wait for error notification
    await waitFor(() => {
      expect(screen.getByText(/failed to refresh games/i)).toBeInTheDocument();
    });

    // Button should be re-enabled after error
    await waitFor(() => {
      expect(button).toBeEnabled();
    });
  });

  test("handles network errors gracefully", async () => {
    server.use(
      http.post("/api/profile/games/update", () => {
        return HttpResponse.error();
      }),
    );

    render(<Account />);

    const button = await screen.findByRole("button", {
      name: /refresh games/i,
    });
    await userEvent.click(button);

    // Wait for error notification
    await waitFor(() => {
      expect(screen.getByText(/error refreshing games/i)).toBeInTheDocument();
    });

    // Button should be re-enabled after error
    await waitFor(() => {
      expect(button).toBeEnabled();
    });
  });
});
