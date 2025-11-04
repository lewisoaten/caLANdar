import type { Meta, StoryObj } from "@storybook/react";
import { http, HttpResponse } from "msw";
import InvitationsTable from "../components/InvitationsTable";
import moment from "moment";
import { RSVP } from "../types/invitations";

const meta = {
  title: "Components/InvitationsTable",
  component: InvitationsTable,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof InvitationsTable>;

export default meta;
type Story = StoryObj<typeof meta>;

const mockEvent = {
  id: 1,
  title: "Summer LAN Party",
  description: "Annual summer gaming event",
  image: undefined,
  timeBegin: moment().startOf("day").hour(18),
  timeEnd: moment().add(2, "days").startOf("day").hour(12),
  createdAt: moment().subtract(7, "days"),
  lastModified: moment().subtract(1, "day"),
};

const mockInvitations = [
  {
    eventId: 1,
    email: "player1@example.com",
    avatarUrl: null,
    handle: "GamerOne",
    invitedAt: moment().subtract(5, "days"),
    respondedAt: moment().subtract(4, "days"),
    response: RSVP.yes,
    attendance: [0, 1, 2, 3, 4],
    lastModified: moment().subtract(4, "days"),
  },
  {
    eventId: 1,
    email: "player2@example.com",
    avatarUrl: null,
    handle: "ProGamer",
    invitedAt: moment().subtract(5, "days"),
    respondedAt: moment().subtract(3, "days"),
    response: RSVP.maybe,
    attendance: [0, 1],
    lastModified: moment().subtract(3, "days"),
  },
  {
    eventId: 1,
    email: "player3@example.com",
    avatarUrl: null,
    handle: "CasualPlayer",
    invitedAt: moment().subtract(5, "days"),
    respondedAt: moment().subtract(2, "days"),
    response: RSVP.no,
    attendance: null,
    lastModified: moment().subtract(2, "days"),
  },
  {
    eventId: 1,
    email: "player4@example.com",
    avatarUrl: null,
    handle: "NightOwl",
    invitedAt: moment().subtract(5, "days"),
    respondedAt: null,
    response: null,
    attendance: null,
    lastModified: moment().subtract(5, "days"),
  },
  {
    eventId: 1,
    email: "player5@example.com",
    avatarUrl: null,
    handle: "EarlyBird",
    invitedAt: moment().subtract(4, "days"),
    respondedAt: moment().subtract(1, "day"),
    response: RSVP.yes,
    attendance: [2, 3, 4],
    lastModified: moment().subtract(1, "day"),
  },
];

export const Default: Story = {
  args: {
    event: mockEvent,
    as_admin: true,
  },
  parameters: {
    msw: {
      handlers: [
        http.get("/api/events/:eventId/invitations", () => {
          return HttpResponse.json(mockInvitations);
        }),
      ],
    },
  },
};

export const EmptyState: Story = {
  args: {
    event: mockEvent,
    as_admin: true,
  },
  parameters: {
    msw: {
      handlers: [
        http.get("/api/events/:eventId/invitations", () => {
          return HttpResponse.json([]);
        }),
      ],
    },
  },
};

export const WithManyInvitations: Story = {
  args: {
    event: mockEvent,
    as_admin: true,
  },
  parameters: {
    msw: {
      handlers: [
        http.get("/api/events/:eventId/invitations", () => {
          // Generate 20 invitations for pagination testing
          const manyInvitations = Array.from({ length: 20 }, (_, i) => ({
            eventId: 1,
            email: `player${i + 1}@example.com`,
            avatarUrl: null,
            handle: `Player${i + 1}`,
            invitedAt: moment().subtract(i, "days"),
            respondedAt: i % 3 === 0 ? moment().subtract(i - 1, "days") : null,
            response: i % 3 === 0 ? RSVP.yes : i % 3 === 1 ? RSVP.maybe : null,
            attendance: i % 3 === 0 ? [0, 1, 2] : null,
            lastModified: moment().subtract(i - 1, "days"),
          }));
          return HttpResponse.json(manyInvitations);
        }),
      ],
    },
  },
};

export const MixedResponses: Story = {
  args: {
    event: mockEvent,
    as_admin: true,
  },
  parameters: {
    msw: {
      handlers: [
        http.get("/api/events/:eventId/invitations", () => {
          return HttpResponse.json([
            {
              ...mockInvitations[0],
              handle: "VeryLongHandleNameThatShouldTruncateInTheTableCell",
            },
            {
              ...mockInvitations[1],
              email:
                "very.long.email.address.that.should.also.truncate@example.com",
            },
            ...mockInvitations.slice(2),
          ]);
        }),
      ],
    },
  },
};
