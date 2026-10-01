import { describe, test, expect, beforeAll, afterEach, afterAll } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import EventSelection from "../components/EventSelection";
import { UserContext } from "../UserProvider";

const future = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString();

const ev = (
  id: number,
  title: string,
  begin: number,
  end: number,
  myResponse: string | null = null,
) => ({
  id,
  myResponse,
  title,
  description: `${title} description`,
  image: null,
  timeBegin: future(begin),
  timeEnd: future(end),
  createdAt: future(-100),
  lastModified: future(-100),
});

const upcoming = [ev(1, "Next LAN", 10, 12, "yes"), ev(2, "Later LAN", 40, 42)];
const past = [ev(3, "Old LAN", -40, -38, "yes")];

const requested: string[] = [];
const perEventRsvpCalls: string[] = [];
const server = setupServer(
  http.get("/api/events", ({ request }) => {
    const url = new URL(request.url);
    requested.push(url.search);
    const f = url.searchParams.get("filter");
    const events =
      f === "past" ? past : f === "all" ? [...upcoming, ...past] : upcoming;
    return HttpResponse.json({
      events,
      total: events.length,
      page: 1,
      limit: 20,
      totalPages: 1,
    });
  }),
  http.get("/api/events/:id/invitations/:email", ({ request }) => {
    perEventRsvpCalls.push(request.url);
    return HttpResponse.json({ response: null });
  }),
  http.get("/api/events/:id/invitations", () =>
    HttpResponse.json([
      { response: "yes", seatId: 1 },
      { response: "yes", seatId: null },
      { response: "maybe", seatId: null },
    ]),
  ),
  http.get("/api/events/:id/seats", () =>
    HttpResponse.json([{ id: 1 }, { id: 2 }, { id: 3 }]),
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  requested.length = 0;
  perEventRsvpCalls.length = 0;
});
afterAll(() => server.close());

const renderPage = () =>
  render(
    <MemoryRouter>
      <UserContext.Provider
        value={{
          email: "sam@example.com",
          token: "t",
          loggedIn: true,
          isAdmin: false,
        }}
      >
        <EventSelection />
      </UserContext.Provider>
    </MemoryRouter>,
  );

describe("EventSelection", () => {
  test("features the next event with RSVP status and squad summary", async () => {
    renderPage();
    const featured = await screen.findByRole("link", { name: /next lan/i });
    expect(featured).toHaveAttribute("href", "/events/1");
    expect(await within(featured).findByText("You're in")).toBeInTheDocument();
    expect(within(featured).getByText("Enter lobby")).toBeInTheDocument();
    expect(
      await within(featured).findByText("2 GOING · 2 SEATS LEFT"),
    ).toBeInTheDocument();

    const later = screen.getByRole("link", { name: /later lan/i });
    expect(later).toHaveAttribute("href", "/events/2");
    expect(await within(later).findByText("RSVP needed")).toBeInTheDocument();
    expect(requested[0]).toContain("filter=upcoming");
    // RSVPs come from `myResponse` on the list: no per-event lookups.
    expect(perEventRsvpCalls).toEqual([]);
  });

  test("filter tabs switch the API filter and support arrow keys", async () => {
    renderPage();
    await screen.findByRole("link", { name: /next lan/i });

    fireEvent.click(screen.getByRole("tab", { name: "Past" }));
    expect(screen.getByRole("tab", { name: "Past" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    const old = await screen.findByRole("link", { name: /old lan/i });
    expect(
      await within(old).findByText("Ended · Attended"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Next up")).not.toBeInTheDocument();
    expect(requested.at(-1)).toContain("filter=past");

    fireEvent.keyDown(screen.getByRole("tab", { name: "Past" }), {
      key: "ArrowRight",
    });
    expect(screen.getByRole("tab", { name: "All" })).toHaveFocus();
    await screen.findByRole("link", { name: /old lan/i });
    expect(requested.at(-1)).toContain("filter=all");
  });

  test("shows an empty state", async () => {
    server.use(
      http.get("/api/events", () =>
        HttpResponse.json({ events: [], total: 0, page: 1, limit: 20 }),
      ),
    );
    renderPage();
    expect(await screen.findByText("No upcoming events")).toBeInTheDocument();
  });

  test("shows an error with retry", async () => {
    server.use(
      http.get("/api/events", () => new HttpResponse(null, { status: 500 })),
    );
    renderPage();
    expect(await screen.findByText("Couldn't load events")).toBeInTheDocument();
    server.resetHandlers();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(
      await screen.findByRole("link", { name: /next lan/i }),
    ).toBeInTheDocument();
  });
});
