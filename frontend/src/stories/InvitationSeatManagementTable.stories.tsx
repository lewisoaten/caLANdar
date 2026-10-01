import type { Meta, StoryObj } from "@storybook/react-vite";
import moment from "moment";
import { userEvent, within } from "storybook/test";
import InvitationSeatManagementTable from "../components/InvitationSeatManagementTable";
import { mockApi, withUser } from "./mockApi";

// Fixed weekend: Friday 13 Nov 2026 18:00 to Sunday 15 Nov 2026 12:00.
const makeEvent = (id: number, title: string) => ({
  id,
  title,
  description: "Three days of co-op, RTS and late-night shooters.",
  image: undefined,
  timeBegin: moment("2026-11-13T18:00:00"),
  timeEnd: moment("2026-11-15T12:00:00"),
  createdAt: moment("2026-09-01T10:00:00"),
  lastModified: moment("2026-10-20T09:30:00"),
});

const invitation = (
  eventId: number,
  email: string,
  handle: string | null,
  response: string | null,
  attendance: number[] | null,
) => ({
  eventId,
  email,
  avatarUrl: null,
  handle,
  invitedAt: "2026-10-01T09:00:00",
  respondedAt: response ? "2026-10-05T19:30:00" : null,
  response,
  attendance,
  lastModified: response ? "2026-10-05T19:30:00" : "2026-10-01T09:00:00",
});

const invitationsFor = (id: number) => [
  invitation(
    id,
    "nightowl@example.com",
    "NightOwl",
    "yes",
    [1, 1, 1, 1, 1, 1, 1, 0],
  ),
  invitation(
    id,
    "fragqueen@example.com",
    "FragQueen",
    "yes",
    [1, 0, 1, 1, 1, 0, 1, 0],
  ),
  invitation(
    id,
    "mike.mccallum@example.com",
    "BigMike_NI",
    "yes",
    [1, 1, 1, 1, 1, 1, 0, 0],
  ),
  invitation(
    id,
    "pete.pixel@example.com",
    "PixelPete",
    "maybe",
    [0, 0, 1, 1, 1, 0, 0, 0],
  ),
  invitation(
    id,
    "laglord@example.com",
    "LagLord",
    "maybe",
    [0, 0, 0, 1, 1, 0, 0, 0],
  ),
  invitation(id, "tankjoe@example.com", "TankJoe", "no", null),
  invitation(id, "new.recruit@example.com", null, null, null),
  invitation(id, "casual.carol@example.com", "CasualCarol", null, null),
];

const rooms = (id: number) => [
  {
    id: id * 10 + 1,
    eventId: id,
    name: "Main Hall",
    description: "Long tables along the windows",
    image: null,
    sortOrder: 0,
    createdAt: "2026-09-02T10:00:00",
    lastModified: "2026-09-02T10:00:00",
  },
  {
    id: id * 10 + 2,
    eventId: id,
    name: "Chill-out Room",
    description: "Sofas and console corner",
    image: null,
    sortOrder: 1,
    createdAt: "2026-09-02T10:00:00",
    lastModified: "2026-09-02T10:00:00",
  },
];

const seat = (
  id: number,
  roomId: number,
  seatId: number,
  label: string,
  x: number,
  y: number,
) => ({
  id: seatId,
  eventId: id,
  roomId,
  label,
  description: null,
  x,
  y,
  createdAt: "2026-09-02T10:00:00",
  lastModified: "2026-09-02T10:00:00",
});

const seats = (id: number) => [
  seat(id, id * 10 + 1, id * 100 + 1, "A1", 0.2, 0.3),
  seat(id, id * 10 + 1, id * 100 + 2, "A2", 0.3, 0.3),
  seat(id, id * 10 + 1, id * 100 + 3, "B1", 0.2, 0.6),
  seat(id, id * 10 + 1, id * 100 + 4, "B2", 0.3, 0.6),
  seat(id, id * 10 + 2, id * 100 + 5, "Sofa 1", 0.5, 0.5),
];

const reservation = (
  id: number,
  resId: number,
  seatId: number,
  email: string,
  attendanceBuckets: number[],
) => ({
  id: resId,
  eventId: id,
  seatId,
  invitationEmail: email,
  attendanceBuckets,
  createdAt: "2026-10-05T19:35:00",
  lastModified: "2026-10-05T19:35:00",
});

const reservationsFor = (id: number) => [
  reservation(
    id,
    1,
    id * 100 + 1,
    "nightowl@example.com",
    [1, 1, 1, 1, 1, 1, 1, 0],
  ),
  reservation(
    id,
    2,
    id * 100 + 2,
    "fragqueen@example.com",
    [1, 0, 1, 1, 1, 0, 1, 0],
  ),
  reservation(
    id,
    3,
    id * 100 + 3,
    "mike.mccallum@example.com",
    [1, 1, 1, 1, 1, 1, 0, 0],
  ),
  reservation(
    id,
    4,
    id * 100 + 5,
    "pete.pixel@example.com",
    [0, 0, 1, 1, 1, 0, 0, 0],
  ),
];

// Other events offered by the "pre-fill from another event" picker.
const otherEvents = {
  events: [
    {
      ...{
        id: 390,
        title: "Summer LAN 2026",
        description: "Last summer's gathering",
        image: null,
        timeBegin: "2026-07-17T18:00:00",
        timeEnd: "2026-07-19T12:00:00",
        createdAt: "2026-05-01T10:00:00",
        lastModified: "2026-07-01T10:00:00",
      },
    },
    {
      id: 391,
      title: "Winter Warmer 2025",
      description: "Cosy winter LAN",
      image: null,
      timeBegin: "2025-12-05T18:00:00",
      timeEnd: "2025-12-07T12:00:00",
      createdAt: "2025-10-01T10:00:00",
      lastModified: "2025-11-20T10:00:00",
    },
  ],
  total: 2,
  page: 1,
  limit: 20,
  totalPages: 1,
};

// Each story owns an event id so the page-global fetch mocks never clash.
const seatingConfig = (id: number, hasSeating: boolean) => ({
  eventId: id,
  hasSeating,
  allowUnspecifiedSeat: false,
  unspecifiedSeatLabel: "Unspecified Seat",
  createdAt: "2026-09-02T10:00:00",
  lastModified: "2026-09-02T10:00:00",
});

const register = (
  id: number,
  data: {
    invitations: unknown[];
    reservations: unknown[];
    rooms: unknown[];
    seats: unknown[];
  },
) =>
  mockApi({
    [`GET /api/events/${id}/invitations`]: data.invitations,
    [`GET /api/events/${id}/seat-reservations`]: data.reservations,
    [`GET /api/events/${id}/rooms`]: data.rooms,
    [`GET /api/events/${id}/seats`]: data.seats,
    [`GET /api/events/${id}/seating-config`]: seatingConfig(
      id,
      data.seats.length > 0,
    ),
  });

// 321: seated event with a mix of RSVPs
register(321, {
  invitations: invitationsFor(321),
  reservations: reservationsFor(321),
  rooms: rooms(321),
  seats: seats(321),
});
// 322: no seating configured
register(322, {
  invitations: invitationsFor(322),
  reservations: [],
  rooms: [],
  seats: [],
});
// 323: nobody invited yet
register(323, { invitations: [], reservations: [], rooms: [], seats: [] });
// 324: same as 321, used for the open "send invitations" dialog
register(324, {
  invitations: invitationsFor(324),
  reservations: reservationsFor(324),
  rooms: rooms(324),
  seats: seats(324),
});
// 325: long names
register(325, {
  invitations: [
    invitation(
      325,
      "bartholomew.cuthbertson-hargreaves@very-long-company-domain.example.com",
      "Sir_Reginald_Fragsworth_III_of_Ballymena",
      "yes",
      [1, 1, 1, 1, 1, 1, 1, 0],
    ),
    invitation(
      325,
      "xx.darklord.of.the.rockets.2009@example.com",
      "xX_DarkLord_Of_The_Rockets_Xx_2009",
      "maybe",
      [1, 0, 0, 1, 1, 0, 0, 0],
    ),
    invitation(325, "zoe@example.com", "Zoe", "no", null),
  ],
  reservations: [
    reservation(
      325,
      1,
      32501,
      "bartholomew.cuthbertson-hargreaves@very-long-company-domain.example.com",
      [1, 1, 1, 1, 1, 1, 1, 0],
    ),
  ],
  rooms: [
    {
      ...rooms(325)[0],
      name: "The Grand Ballroom of the Ballymena Community Centre",
    },
  ],
  seats: [seat(325, 3251, 32501, "Table 12 - Seat 6 (window side)", 0.5, 0.5)],
});
mockApi({
  "GET /api/events": otherEvents,
});

const meta = {
  title: "Components/InvitationSeatManagementTable",
  component: InvitationSeatManagementTable,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  decorators: [withUser({ isAdmin: true })],
} satisfies Meta<typeof InvitationSeatManagementTable>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Admin table with yes/maybe/no/no-response invitees and seat assignments. */
export const AdminWithSeating: Story = {
  args: {
    event: makeEvent(321, "Autumn LAN: Rock and Stone"),
    as_admin: true,
  },
};

/** Event without seating: every invitee shows no seat. */
export const NoSeatingConfigured: Story = {
  args: {
    event: makeEvent(322, "Autumn LAN: Rock and Stone"),
    as_admin: true,
  },
};

/** Nothing to manage yet: empty state under the invite bar. */
export const NoInvitationsYet: Story = {
  args: {
    event: makeEvent(323, "Autumn LAN: Rock and Stone"),
    as_admin: true,
  },
};

/** Very long emails, handles and seat labels. */
export const LongNames: Story = {
  args: {
    event: makeEvent(325, "Autumn LAN: Rock and Stone"),
    as_admin: true,
  },
};

/** The copy-from-event invitations dialog, opened from the invite bar. */
export const SendInvitationsDialogOpen: Story = {
  args: {
    event: makeEvent(324, "Autumn LAN: Rock and Stone"),
    as_admin: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Copy from event" }),
    );
  },
};

/** Remove confirmation for an invitee. */
export const RemoveConfirm: Story = {
  args: {
    event: makeEvent(324, "Autumn LAN: Rock and Stone"),
    as_admin: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", {
        name: "Remove nightowl@example.com",
      }),
    );
  },
};
