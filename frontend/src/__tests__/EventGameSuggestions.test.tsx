import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { SnackbarProvider } from "notistack";
import { MemoryRouter } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import EventGameSuggestions from "../components/EventGameSuggestions";
import { UserProvider } from "../UserProvider";
import { RSVP } from "../types/invitations";

const theme = createTheme({ palette: { mode: "dark" } });

const suggestion = {
  appid: 440,
  name: "Team Fortress 2",
  userEmail: "nia@example.com",
  comment: null,
  lastModified: "2025-01-15T10:00:00Z",
  requestedAt: "2025-01-15T10:00:00Z",
  suggestionLastModified: "2025-01-15T10:00:00Z",
  selfVote: "noVote",
  votes: 2,
  voters: [],
  suggester: { avatarUrl: null, handle: "Nia" },
  gamerOwned: [],
  gamerUnowned: [],
  gamerUnknown: [],
};

const forbidden = (description: string) =>
  HttpResponse.json(
    { error: { code: 403, reason: "Forbidden", description } },
    { status: 403 },
  );

const server = setupServer(
  http.get("/api/events/:eventId/suggested_games", () =>
    HttpResponse.json([suggestion]),
  ),
);

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
beforeEach(() => {
  localStorage.setItem(
    "user_context",
    JSON.stringify({
      token: "t",
      email: "erin@example.com",
      loggedIn: true,
      isAdmin: false,
    }),
  );
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  server.resetHandlers();
  localStorage.clear();
  vi.restoreAllMocks();
});
afterAll(() => server.close());

const renderVote = (
  props: Partial<React.ComponentProps<typeof EventGameSuggestions>> = {},
) =>
  render(
    <MemoryRouter>
      <ThemeProvider theme={theme}>
        <SnackbarProvider>
          <UserProvider>
            <EventGameSuggestions
              event_id={2}
              responded={1}
              disabled={false}
              {...props}
            />
          </UserProvider>
        </SnackbarProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );

describe("EventGameSuggestions", () => {
  test("declined guests see the vote read-only, with why and a way back", async () => {
    const onEditRsvp = vi.fn();
    renderVote({ myResponse: RSVP.no, onEditRsvp });

    const vote = await screen.findByRole("button", {
      name: /Vote for Team Fortress 2/,
    });
    expect(vote).toBeDisabled();
    expect(vote).toHaveAccessibleDescription(/can't make it/);
    expect(
      screen.queryByRole("form", { name: "Suggest a game" }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Update RSVP" }));
    expect(onEditRsvp).toHaveBeenCalled();
  });

  test("a refused vote shows the server's reason and keeps the session", async () => {
    server.use(
      http.patch("/api/events/:eventId/suggested_games/:id", () =>
        forbidden("This event has ended, so the game vote is closed"),
      ),
    );
    renderVote({ myResponse: RSVP.yes });

    await userEvent.click(
      await screen.findByRole("button", { name: /Vote for Team Fortress 2/ }),
    );
    expect(
      await screen.findByText(
        "Couldn't vote for Team Fortress 2: This event has ended, so the game vote is closed",
      ),
    ).toBeInTheDocument();
    expect(localStorage.getItem("user_context")).not.toBeNull();
  });

  test("an expired session (401) still signs out", async () => {
    server.use(
      http.patch(
        "/api/events/:eventId/suggested_games/:id",
        () => new HttpResponse(null, { status: 401 }),
      ),
    );
    renderVote({ myResponse: RSVP.yes });

    await userEvent.click(
      await screen.findByRole("button", { name: /Vote for Team Fortress 2/ }),
    );
    await waitFor(() =>
      expect(localStorage.getItem("user_context")).toBeNull(),
    );
  });

  test("a failed Steam search says so instead of 'No games found'", async () => {
    server.use(
      http.get("/api/steam-game", () => HttpResponse.json({}, { status: 500 })),
    );
    renderVote({ myResponse: RSVP.yes });

    await userEvent.type(
      await screen.findByRole("combobox", { name: "Suggest a game" }),
      "portal",
    );
    expect(
      await screen.findByText(
        "Steam search is unavailable right now",
        {},
        { timeout: 3000 },
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("No games found")).not.toBeInTheDocument();
  });
});
