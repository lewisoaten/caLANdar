import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, waitFor, within } from "@storybook/test";
import AuditLog from "../components/AuditLog";
import { mockApi, withUser, type MockRequest } from "./mockApi";

const meta = {
  title: "Components/AuditLog",
  component: AuditLog,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [withUser({ isAdmin: true })],
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
    metadata: null,
  },
];

const pad = (n: number) => String(n).padStart(2, "0");

// Newest first, one entry every 37 minutes, counting back from a fixed
// moment on 2026-02-22 (all of it stays within February, so plain
// arithmetic on a minute-of-month counter is enough).
const TOTAL = 120;
const logs: MockLog[] = Array.from({ length: TOTAL }, (_, i) => {
  const t = templates[i % templates.length];
  const minutesFromMonthStart = 21 * 24 * 60 + 22 * 60 + 15 - i * 37;
  const day = Math.floor(minutesFromMonthStart / (24 * 60)) + 1;
  const hour = Math.floor((minutesFromMonthStart % (24 * 60)) / 60);
  const minute = minutesFromMonthStart % 60;
  return {
    id: TOTAL - i,
    timestamp: `2026-02-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(
      (i * 7) % 60,
    )}Z`,
    ...t,
    ipAddress: t.userId ? `203.0.113.${10 + (i % 40)}` : null,
    userAgent: t.userId ? "Mozilla/5.0 (X11; Linux x86_64)" : null,
  };
});

mockApi({
  "GET /api/audit-logs": (req: MockRequest) => {
    const limit = Number(req.query.get("limit") ?? "50");
    const offset = Number(req.query.get("offset") ?? "0");
    const userId = (req.query.get("user_id") ?? "").toLowerCase();
    const entityType = req.query.get("entity_type") ?? "";

    const matching = logs.filter(
      (l) =>
        (!userId || (l.userId ?? "").toLowerCase().includes(userId)) &&
        (!entityType || l.entityType === entityType),
    );

    return {
      logs: matching.slice(offset, offset + limit),
      totalCount: matching.length,
      limit,
      offset,
    };
  },
});

/** Admin view: first page of 50 of 120 entries with filters and pagination. */
export const Default: Story = {};

/** Signed-in non-admin sees the permission error instead of the log. */
export const NotAdmin: Story = {
  decorators: [withUser({ isAdmin: false })],
};

/** Entity Type filter set to "RSVPs". */
export const FilteredByEntityType: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByLabelText("Entity Type"));
    // The select menu renders in a portal on document.body.
    await userEvent.click(
      await within(document.body).findByRole("option", { name: "RSVPs" }),
    );
    await waitFor(() =>
      expect(canvas.queryAllByText("Authentication").length).toBe(0),
    );
  },
};

/** User Email filter narrowed to one organiser's activity. */
export const FilteredByUser: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      await canvas.findByLabelText("User Email"),
      "grace.liu",
    );
    await waitFor(() =>
      expect(canvas.queryAllByText("Authentication").length).toBe(0),
    );
  },
};

/** A filter with no matches shows the empty "No audit logs found" row. */
export const NoResults: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      await canvas.findByLabelText("User Email"),
      "nobody@example.com",
    );
    await canvas.findByText("No audit logs found");
  },
};
