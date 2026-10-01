import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import EventTable from "../components/EventTable";
import { renderAsAdmin } from "./adminTestUtils";

const requests: URLSearchParams[] = [];

const server = setupServer(
  http.get("/api/events", ({ request }) => {
    const q = new URL(request.url).searchParams;
    requests.push(q);
    return HttpResponse.json({
      events: [],
      total: 30,
      totalPages: 5,
      counts: { all: 30, live: 1, draft: 0, ended: 29 },
    });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  requests.length = 0;
});
afterAll(() => server.close());

describe("EventTable search", () => {
  test("goes back to page 1 once, when the search settles", async () => {
    const u = userEvent.setup();
    renderAsAdmin(<EventTable asAdmin pageSize={6} />);
    await waitFor(() => expect(requests).toHaveLength(1));

    await u.click(screen.getByRole("button", { name: "Page 2" }));
    await waitFor(() => expect(requests.at(-1)?.get("page")).toBe("2"));
    const beforeSearch = requests.length;

    await u.type(
      screen.getByRole("searchbox", { name: "Search events" }),
      "lan",
    );
    await waitFor(() => expect(requests.at(-1)?.get("search")).toBe("lan"));

    // One request for the settled term, already on page 1: no request for
    // the old term on page 1, and none per keystroke.
    const after = requests.slice(beforeSearch);
    expect(after).toHaveLength(1);
    expect(after[0].get("page")).toBe("1");
  });
});
