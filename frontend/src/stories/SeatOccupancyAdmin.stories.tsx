import type { Meta, StoryObj } from "@storybook/react-vite";
import SeatOccupancyAdmin from "../components/SeatOccupancyAdmin";
import { mockApi, mockResponse, withUser } from "./mockApi";

const STAMP = "2026-09-01T10:00:00Z";

const register = (
  id: number,
  opts: { hasSeating?: boolean; fail?: boolean; empty?: boolean } = {},
) => {
  const { hasSeating = true, fail = false, empty = false } = opts;
  const rooms = empty
    ? []
    : [
        {
          id: id * 10 + 1,
          name: "Main Hall",
          description: "Two rows of seats, wired networking",
          sortOrder: 0,
        },
        {
          id: id * 10 + 2,
          name: "Games Room",
          description: "Console corner and board games",
          sortOrder: 1,
        },
      ];
  const seats = empty
    ? []
    : [
        ...["A1", "A2", "A3", "A4", "B1", "B2", "B3", "B4"].map((label, i) => ({
          id: id * 100 + i,
          roomId: id * 10 + 1,
          label,
        })),
        ...["G1", "G2"].map((label, i) => ({
          id: id * 100 + 50 + i,
          roomId: id * 10 + 2,
          label,
        })),
      ];
  const people = [
    ["nia@example.com", "NoScope_Nia", id * 100 + 0],
    ["lag@example.com", "LagWizard", id * 100 + 5],
    ["sam@example.com", "SamTheSniper", id * 100 + 50],
    ["dan@example.com", "Dan_the_Man", null],
  ] as const;
  mockApi({
    [`GET /api/events/${id}/seating-config`]: fail
      ? mockResponse(500, null)
      : {
          eventId: id,
          hasSeating,
          allowUnspecifiedSeat: true,
          unspecifiedSeatLabel: "Bring my own seat",
          createdAt: STAMP,
          lastModified: STAMP,
        },
    [`GET /api/events/${id}/rooms`]: rooms.map((r) => ({
      ...r,
      eventId: id,
      image: null,
      createdAt: STAMP,
      lastModified: STAMP,
    })),
    [`GET /api/events/${id}/seats`]: seats.map((s) => ({
      ...s,
      eventId: id,
      description: null,
      x: 0.5,
      y: 0.5,
      createdAt: STAMP,
      lastModified: STAMP,
    })),
    [`GET /api/events/${id}/seat-reservations`]: empty
      ? []
      : people.map(([email, , seatId], i) => ({
          id: id * 1000 + i,
          eventId: id,
          seatId,
          invitationEmail: email,
          attendanceBuckets: [1, 1, 1, 0, 1, 1, 0, 0],
          createdAt: STAMP,
          lastModified: STAMP,
        })),
    [`GET /api/events/${id}/invitations`]: people.map(([email, handle]) => ({
      eventId: id,
      email,
      avatarUrl: null,
      handle,
      invitedAt: STAMP,
      respondedAt: STAMP,
      response: "yes",
      attendance: [1, 1, 1, 0, 1, 1, 0, 0],
      lastModified: STAMP,
    })),
    [`PUT /api/events/${id}/seat-reservations/:email`]: {},
    [`DELETE /api/events/${id}/seat-reservations/:email`]: () =>
      new Response(null, { status: 204 }),
  });
};

register(611);
register(612, { hasSeating: false });
register(613, { empty: true });
register(614, { fail: true });

const meta = {
  title: "Components/SeatOccupancyAdmin",
  component: SeatOccupancyAdmin,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  decorators: [withUser({ isAdmin: true })],
} satisfies Meta<typeof SeatOccupancyAdmin>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Two rooms, three assigned seats and one "bring my own seat". */
export const Default: Story = { args: { eventId: 611 } };

/** Seating turned off for the event. */
export const SeatingOff: Story = { args: { eventId: 612 } };

/** Seating on but no rooms or reservations yet. */
export const NoRooms: Story = { args: { eventId: 613 } };

/** Loading fails. */
export const LoadError: Story = { args: { eventId: 614 } };
