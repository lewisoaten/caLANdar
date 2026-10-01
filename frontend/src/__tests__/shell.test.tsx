import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ThemeProvider } from "@mui/material/styles";
import theme from "../theme";
import { UserContext, UserDispatchContext } from "../UserProvider";
import ProtectedRoutes, { AdminRoutes } from "../ProtectedRoutes";
import { HlSnackbarProvider } from "../components/hl/HlSnackbarProvider";
import {
  ActivityTickerView,
  TICKER_HEIGHT,
  type ActivityTickerEvent,
} from "../components/ActivityTicker";
import MenuItems from "../components/MenuItems";
import type { ShellState } from "../components/shell/useShellState";
import { parseRoute } from "../components/shell/navModel";
import type { EventData } from "../types/events";
import moment from "moment";

function withUser(ui: React.ReactElement, isAdmin: boolean, path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ThemeProvider theme={theme}>
        <UserContext.Provider
          value={{
            email: "u@example.com",
            token: "t",
            loggedIn: true,
            isAdmin,
          }}
        >
          <UserDispatchContext.Provider
            value={{
              signIn: vi.fn(),
              verifyEmail: vi.fn(),
              signOut: vi.fn(),
              isSignedIn: () => true,
            }}
          >
            <HlSnackbarProvider>{ui}</HlSnackbarProvider>
          </UserDispatchContext.Provider>
        </UserContext.Provider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

const adminRoutes = (
  <Routes>
    <Route element={<ProtectedRoutes />}>
      <Route path="/events" element={<p>Events page</p>} />
      <Route element={<AdminRoutes />}>
        <Route path="/admin/events">
          <Route path="" element={<p>Manage events</p>} />
          <Route path=":id/rooms" element={<p>Room editor</p>} />
        </Route>
        <Route path="/admin/audit" element={<p>Audit log</p>} />
      </Route>
    </Route>
  </Routes>
);

describe("AdminRoutes", () => {
  it.each(["/admin/events", "/admin/events/2/rooms", "/admin/audit"])(
    "sends a non-admin from %s to /events with a toast",
    async (path) => {
      withUser(adminRoutes, false, path);
      expect(await screen.findByText("Events page")).toBeInTheDocument();
      expect(await screen.findByText("Admins only")).toBeInTheDocument();
      expect(screen.queryByText(/Manage events|Room editor|Audit log/)).toBe(
        null,
      );
    },
  );

  it("lets an admin through", () => {
    withUser(adminRoutes, true, "/admin/events/2/rooms");
    expect(screen.getByText("Room editor")).toBeInTheDocument();
    expect(screen.queryByText("Admins only")).toBe(null);
  });
});

const items: ActivityTickerEvent[] = [
  {
    id: 1,
    timestamp: "2026-10-01T10:00:00Z",
    message: "Nia voted for Factorio",
    icon: "👍",
    eventType: "game_vote",
  },
  {
    id: 2,
    timestamp: "2026-10-01T10:01:00Z",
    message: "Sam claimed B3",
    icon: "🪑",
    eventType: "seat_reservation",
  },
];

function mockReducedMotion(reduce: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: reduce && query.includes("prefers-reduced-motion: reduce"),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

describe("ActivityTickerView", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("animates with a 44px pause button by default", async () => {
    mockReducedMotion(false);
    render(<ActivityTickerView items={items} />);
    expect(TICKER_HEIGHT).toBeGreaterThanOrEqual(44);
    expect(screen.getByTestId("activity-ticker-track")).toHaveClass("hl-tick");
    const pause = screen.getByRole("button", { name: "Pause live activity" });
    await userEvent.click(pause);
    expect(
      screen.getByRole("button", { name: "Resume live activity" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("is a static, scrollable list under reduced motion", () => {
    mockReducedMotion(true);
    render(<ActivityTickerView items={items} />);
    expect(screen.queryByTestId("activity-ticker-track")).toBe(null);
    expect(screen.queryByRole("button")).toBe(null);
    const strip = screen.getByTestId("activity-ticker-static");
    expect(strip).toHaveAttribute("tabindex", "0");
    // Each item once (no marquee duplication).
    const list = within(strip).getAllByRole("listitem");
    expect(list).toHaveLength(2);
    expect(list[0]).toHaveTextContent("VOTE: Nia voted for Factorio");
  });
});

describe("MenuItems locked rows", () => {
  const event = {
    id: 7,
    title: "Autumn LAN",
    timeBegin: moment().add(5, "days"),
    timeEnd: moment().add(7, "days"),
  } as unknown as EventData;
  const shell: ShellState = {
    route: parseRoute("/events/7"),
    loggedIn: true,
    isAdmin: false,
    email: "u@example.com",
    handle: "U",
    avatarUrl: null,
    activeEvent: event,
    access: { loading: false, attending: false, responded: true },
    breadcrumb: [],
    signOut: vi.fn(),
  };

  it("renders RSVP-gated items as focusable aria-disabled buttons with a reason", () => {
    render(
      <MemoryRouter>
        <ThemeProvider theme={theme}>
          <MenuItems shell={shell} />
        </ThemeProvider>
      </MemoryRouter>,
    );
    const games = screen.getByRole("button", { name: /Games/ });
    expect(games.tagName).toBe("BUTTON");
    expect(games).toHaveAttribute("aria-disabled", "true");
    expect(games).toHaveAccessibleDescription(
      'RSVP "Yes" or "Maybe" to access this section.',
    );
    expect(screen.queryByRole("link", { name: /Games/ })).toBe(null);
    // The lobby stays a normal link.
    expect(screen.getByRole("link", { name: /Lobby/ })).toBeInTheDocument();
  });
});
