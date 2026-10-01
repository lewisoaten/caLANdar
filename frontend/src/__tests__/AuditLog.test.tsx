import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import AuditLog, {
  buildAuditQuery,
  getActionDescription,
  humanizeAction,
  type AuditLogEntry,
} from "../components/AuditLog";
import { renderAsAdmin } from "./adminTestUtils";

const entry = (over: Partial<AuditLogEntry>): AuditLogEntry => ({
  id: 1,
  timestamp: new Date().toISOString(),
  userId: "bex@example.com",
  action: "rsvp.update",
  entityType: "rsvp",
  entityId: "12",
  metadata: { response: "yes", handle: "PixelPirate" },
  ipAddress: null,
  userAgent: null,
  avatarUrl: null,
  ...over,
});

const LOGS = [
  entry({ id: 2 }),
  entry({
    id: 1,
    userId: null,
    action: "steam_games.update",
    entityType: "steam_games",
    entityId: null,
    metadata: { games_cached: 48297, games_added: 84 },
  }),
];

let requests: URLSearchParams[] = [];

const server = setupServer(
  http.get("/api/audit-logs", ({ request }) => {
    const params = new URL(request.url).searchParams;
    requests.push(params);
    return HttpResponse.json({
      logs: LOGS,
      totalCount: 40,
      limit: 12,
      offset: Number(params.get("offset")),
    });
  }),
  http.get("/api/audit-logs/entity-types", () =>
    HttpResponse.json(["auth", "invitation", "rsvp", "steam_games"]),
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  requests = [];
});
afterAll(() => server.close());

const last = () => requests[requests.length - 1];

test("buildAuditQuery maps filters to API params", () => {
  const q = new URLSearchParams(
    buildAuditQuery({
      page: 3,
      userSearch: " grace ",
      entityTypes: ["rsvp", "invitation"],
      fromTimestamp: "2026-09-23T12:00:00.000Z",
    }),
  );
  expect(Object.fromEntries(q)).toEqual({
    as_admin: "true",
    limit: "12",
    offset: "24",
    user_search: "grace",
    entity_types: "rsvp,invitation",
    from_timestamp: "2026-09-23T12:00:00.000Z",
  });
});

describe("getActionDescription", () => {
  test("keeps the existing formatting", () => {
    expect(getActionDescription(entry({}))).toBe(
      "Updated RSVP: yes, handle: PixelPirate",
    );
    expect(
      getActionDescription(
        entry({
          action: "event.create",
          entityType: "event",
          metadata: { title: "Autumn LAN" },
        }),
      ),
    ).toBe('Created event "Autumn LAN"');
  });

  test("describes new actions and falls back to the raw action", () => {
    expect(getActionDescription(LOGS[1])).toBe(
      "Updated Steam games database (+84 games)",
    );
    expect(
      getActionDescription(
        entry({ action: "room.layout_update", entityType: "room" }),
      ),
    ).toBe("Saved room layout");
    expect(
      getActionDescription(
        entry({
          action: "room.layout_update",
          entityType: "room",
          metadata: {
            rooms: 2,
            seats: 40,
            reservations_released: ["a@example.com"],
          },
        }),
      ),
    ).toBe("Saved room layout (2 rooms, 40 seats, 1 reservation released)");
    expect(
      getActionDescription(
        entry({
          action: "room.background_update",
          entityType: "room",
          metadata: { content_type: "image/png", bytes: 245760 },
        }),
      ),
    ).toBe("Uploaded room background (PNG, 240 KB)");
    expect(
      getActionDescription(
        entry({ action: "seat.teleport", entityType: "seat" }),
      ),
    ).toBe("Seat teleport");
  });

  test("humanizes unknown entity.action codes", () => {
    expect(humanizeAction("room.background_update")).toBe(
      "Room background updated",
    );
    expect(humanizeAction("game_suggestion.update_comment")).toBe(
      "Game suggestion comment updated",
    );
    expect(humanizeAction("steam_cache.refresh")).toBe("Steam cache refreshed");
    expect(humanizeAction("widget.frobnicate")).toBe("Widget frobnicate");
    expect(humanizeAction("")).toBe("");
  });
});

describe("AuditLog", () => {
  test("loads the last 7 days, 12 per page, as admin", async () => {
    renderAsAdmin(<AuditLog />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Audit log" }),
    ).toBeInTheDocument();
    const list = await screen.findByRole("region", { name: "Log entries" });
    expect(
      await within(list).findByText("Updated RSVP: yes, handle: PixelPirate"),
    ).toBeInTheDocument();
    expect(within(list).getByText("bex@example.com")).toBeInTheDocument();
    expect(within(list).getByText("System")).toBeInTheDocument();
    expect(within(list).getByText("RSVP #12")).toBeInTheDocument();

    const q = last();
    expect(q.get("as_admin")).toBe("true");
    expect(q.get("limit")).toBe("12");
    expect(q.get("offset")).toBe("0");
    const from = Date.parse(q.get("from_timestamp")!);
    expect(Date.now() - from).toBeGreaterThan(6.9 * 86_400_000);
    expect(Date.now() - from).toBeLessThan(7.1 * 86_400_000);
    expect(screen.getByText("1–12 OF 40")).toBeInTheDocument();
  });

  test("entity chips come from the log's types and reset to page 1", async () => {
    renderAsAdmin(<AuditLog />);
    const group = await screen.findByRole("group", { name: "Entity type" });
    // Groups without entries (events, seating) are hidden once types load.
    await waitFor(() =>
      expect(
        within(group).queryByRole("button", { name: "Events" }),
      ).toBeNull(),
    );
    expect(
      within(group)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["All", "RSVPs", "Games", "System"]);

    await userEvent.click(screen.getByRole("button", { name: "Page 2" }));
    await waitFor(() => expect(last().get("offset")).toBe("12"));

    await userEvent.click(within(group).getByRole("button", { name: "RSVPs" }));
    await waitFor(() =>
      expect(last().get("entity_types")).toBe("rsvp,invitation"),
    );
    expect(last().get("offset")).toBe("0");
  });

  test("time range select and debounced user search", async () => {
    renderAsAdmin(<AuditLog />);
    await screen.findByText("1–12 OF 40");

    await userEvent.click(screen.getByRole("combobox", { name: "Time range" }));
    await userEvent.click(
      await screen.findByRole("option", { name: "All time" }),
    );
    await waitFor(() => expect(last().has("from_timestamp")).toBe(false));

    await userEvent.type(
      screen.getByRole("searchbox", { name: "Filter by user email" }),
      "bex",
    );
    await waitFor(() => expect(last().get("user_search")).toBe("bex"));
  });

  test("shows an error with retry", async () => {
    server.use(
      http.get("/api/audit-logs", () =>
        HttpResponse.json({}, { status: 500, statusText: "Server Error" }),
      ),
    );
    renderAsAdmin(<AuditLog />);
    expect(
      await screen.findByText("Couldn't load the audit log"),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
  });

  test("non-admins see a permission error", () => {
    renderAsAdmin(<AuditLog />, false);
    expect(screen.getByText(/Admin access required/)).toBeInTheDocument();
  });
});
