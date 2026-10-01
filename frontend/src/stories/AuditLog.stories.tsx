import type { Decorator, Meta, StoryObj } from "@storybook/react-vite";
import Box from "@mui/material/Box";
import { sectionGap } from "../components/hl";
import { expect, userEvent, waitFor, within } from "storybook/test";
import AuditLog from "../components/AuditLog";
import { mockApi, withUser, type MockRequest } from "./mockApi";

/** Mimics the shell's <main>: a flex column with the section gap. */
const withPageFrame: Decorator = (Story) => (
  <Box sx={{ display: "flex", flexDirection: "column", gap: sectionGap }}>
    <Story />
  </Box>
);

const meta = {
  title: "Components/AuditLog",
  component: AuditLog,
  parameters: {
    layout: "padded",
  },
  decorators: [withPageFrame, withUser({ isAdmin: true })],
  tags: ["autodocs"],
} satisfies Meta<typeof AuditLog>;

export default meta;
type Story = StoryObj<typeof meta>;

interface MockLog {
  id: number;
  timestamp: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  avatarUrl: string | null;
}

type Template = Pick<
  MockLog,
  "userId" | "action" | "entityType" | "entityId" | "metadata"
>;

const templates: Template[] = [
  {
    userId: "alex.harding@example.com",
    action: "auth.login",
    entityType: "auth",
    entityId: null,
    metadata: null,
  },
  {
    userId: "callum.reid@example.com",
    action: "event.create",
    entityType: "event",
    entityId: "12",
    metadata: { title: "Winter Warzone LAN 2026" },
  },
  {
    userId: "callum.reid@example.com",
    action: "event.update",
    entityType: "event",
    entityId: "12",
    metadata: { title: "Winter Warzone LAN 2026 (Doors 6pm)" },
  },
  {
    userId: "callum.reid@example.com",
    action: "event_seating_config.update",
    entityType: "event_seating_config",
    entityId: "12",
    metadata: {
      has_seating: true,
      allow_unspecified_seat: true,
      unspecified_seat_label: "Bring your own beanbag",
    },
  },
  {
    userId: "callum.reid@example.com",
    action: "room.create",
    entityType: "room",
    entityId: "31",
    metadata: { name: "Main Hall" },
  },
  {
    userId: "callum.reid@example.com",
    action: "seat.create",
    entityType: "seat",
    entityId: "204",
    metadata: { label: "A4" },
  },
  {
    userId: "callum.reid@example.com",
    action: "invitation.create",
    entityType: "invitation",
    entityId: "12",
    metadata: { invited_email: "bex.okafor@example.com" },
  },
  {
    userId: "callum.reid@example.com",
    action: "email.send",
    entityType: "email",
    entityId: "12",
    metadata: {
      email_type: "custom",
      recipient_count: 24,
      subject: "Bring your own extension leads and headsets!",
    },
  },
  {
    userId: "callum.reid@example.com",
    action: "email.send",
    entityType: "email",
    entityId: "12",
    metadata: {
      email_type: "invitation_resend",
      recipient_email: "finn.oconnell@example.com",
    },
  },
  {
    userId: "bex.okafor@example.com",
    action: "rsvp.update",
    entityType: "rsvp",
    entityId: "12",
    metadata: {
      response: "yes",
      attendance: "Friday evening, Saturday all day",
      handle: "PixelPirate",
    },
  },
  {
    userId: "callum.reid@example.com",
    action: "rsvp.update",
    entityType: "rsvp",
    entityId: "12",
    metadata: {
      response: "maybe",
      attendance: "Saturday all day",
      handle: "LagSwitchLarry",
      admin_update: true,
      target_email: "finn.oconnell@example.com",
      seat_cleared: true,
    },
  },
  {
    userId: "bex.okafor@example.com",
    action: "seat_reservation.create",
    entityType: "seat_reservation",
    entityId: "12",
    metadata: { seat: "Main Hall - A4", attendance: "Friday, Saturday" },
  },
  {
    userId: "grace.liu@example.com",
    action: "game_suggestion.create",
    entityType: "game_suggestion",
    entityId: "12",
    metadata: {
      game_name: "Halo: The Master Chief Collection",
      comment: "4-player split screen on the projector, please!",
    },
  },
  {
    userId: "tom.gallagher@example.com",
    action: "game_vote.update",
    entityType: "game_vote",
    entityId: "12",
    metadata: { game_name: "Rocket League", vote: "up" },
  },
  {
    userId: "marcus.bell@example.com",
    action: "profile.games_refresh",
    entityType: "profile",
    entityId: "marcus.bell@example.com",
    metadata: { games_count: 640 },
  },
  {
    userId: null,
    action: "steam_games.update",
    entityType: "steam_games",
    entityId: null,
    metadata: { games_cached: 48297, games_added: 84 },
  },
  {
    userId: "callum.reid@example.com",
    action: "room.layout_update",
    entityType: "room",
    entityId: "12",
    metadata: null,
  },
];

// Newest first, one entry every 311 minutes counting back from now, so the
// time-range select has something to cut (~140 entries over ~30 days).
const TOTAL = 140;
const NOW = Date.now();
const logs: MockLog[] = Array.from({ length: TOTAL }, (_, i) => {
  const t = templates[(i * 7) % templates.length];
  return {
    id: TOTAL - i,
    timestamp: new Date(NOW - i * 311 * 60_000).toISOString(),
    ...t,
    ipAddress: t.userId ? `203.0.113.${10 + (i % 40)}` : null,
    userAgent: t.userId ? "Mozilla/5.0 (X11; Linux x86_64)" : null,
    avatarUrl: null,
  };
});

mockApi({
  "GET /api/audit-logs": (req: MockRequest) => {
    const limit = Number(req.query.get("limit") ?? "50");
    const offset = Number(req.query.get("offset") ?? "0");
    const userId = (req.query.get("user_id") ?? "").toLowerCase();
    const userSearch = (req.query.get("user_search") ?? "").toLowerCase();
    const entityType = req.query.get("entity_type") ?? "";
    const entityTypes = (req.query.get("entity_types") ?? "")
      .split(",")
      .filter(Boolean);
    const from = req.query.get("from_timestamp");
    const since = from ? Date.parse(from) : -Infinity;

    const matching = logs.filter(
      (l) =>
        (!userId || (l.userId ?? "").toLowerCase() === userId) &&
        (!userSearch || (l.userId ?? "").toLowerCase().includes(userSearch)) &&
        (!entityType || l.entityType === entityType) &&
        (!entityTypes.length || entityTypes.includes(l.entityType)) &&
        Date.parse(l.timestamp) >= since,
    );

    return {
      logs: matching.slice(offset, offset + limit),
      totalCount: matching.length,
      limit,
      offset,
    };
  },
  "GET /api/audit-logs/entity-types": [
    ...new Set(templates.map((t) => t.entityType)),
  ].sort(),
});

/** Admin view: last 7 days, 12 entries a page, chips from the log's types. */
export const Default: Story = {};

/** Signed-in non-admin sees the permission error instead of the log. */
export const NotAdmin: Story = {
  decorators: [withUser({ isAdmin: false })],
};

/** Entity type chip set to "RSVPs" (rsvp + invitation entries). */
export const FilteredByEntityType: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "RSVPs" }));
    await waitFor(() =>
      expect(canvas.queryAllByText("auth.login").length).toBe(0),
    );
  },
};

/** User email filter (partial match) narrowed to one person's activity. */
export const FilteredByUser: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      await canvas.findByLabelText("Filter by user email"),
      "grace",
    );
    await waitFor(
      () =>
        expect(canvas.queryAllByText("callum.reid@example.com").length).toBe(0),
      { timeout: 3000 },
    );
  },
};

/** Time range "All time" via the themed select menu. */
export const AllTime: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByLabelText("Time range"));
    // The select menu renders in a portal on document.body.
    await userEvent.click(
      await within(document.body).findByRole("option", { name: "All time" }),
    );
    await canvas.findByText(/OF 140/);
  },
};

/** A filter with no matches shows the empty state. */
export const NoResults: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      await canvas.findByLabelText("Filter by user email"),
      "nobody@example.com",
    );
    await canvas.findByText("No entries match those filters.", undefined, {
      timeout: 3000,
    });
  },
};
