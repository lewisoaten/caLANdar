import type { Meta, StoryObj } from "@storybook/react";
import { userEvent, within } from "@storybook/test";
import EventManagement from "../components/EventManagement";
import { mockApi, withRoute, withUser } from "./mockApi";

const meta = {
  title: "Components/EventManagement",
  component: EventManagement,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [withUser({ isAdmin: true })],
  tags: ["autodocs"],
} satisfies Meta<typeof EventManagement>;

export default meta;
type Story = StoryObj<typeof meta>;

// Each story owns one event id so the global fetch mocks never clash.
//   401 - full event: seating, two rooms, seats, mixed RSVPs
//   402 - seating disabled, no rooms, a handful of invitations
//   403 - brand new event: nothing configured, nobody invited
//   404 - very long title, description, handles and emails

interface MockEvent {
  id: number;
  title: string;
  description: string;
  image: null;
  timeBegin: string;
  timeEnd: string;
  createdAt: string;
  lastModified: string;
}

interface MockInvitation {
  email: string;
  handle: string | null;
  invitedAt: string;
  respondedAt: string | null;
  response: "yes" | "no" | "maybe" | null;
  attendance: number[] | null;
  lastModified: string;
}

interface MockRoom {
  id: number;
  name: string;
  description: string | null;
  sortOrder: number;
}

interface MockSeat {
  id: number;
  roomId: number;
  label: string;
  description: string | null;
  x: number;
  y: number;
}

interface MockReservation {
  id: number;
  seatId: number | null;
  invitationEmail: string;
  attendanceBuckets: number[];
}

interface Scenario {
  event: MockEvent;
  seatingConfig: {
    hasSeating: boolean;
    allowUnspecifiedSeat: boolean;
    unspecifiedSeatLabel: string;
  };
  invitations: MockInvitation[];
  rooms: MockRoom[];
  seats: MockSeat[];
  reservations: MockReservation[];
}

const STAMP = "2026-01-05T10:00:00Z";

const makeEvent = (
  id: number,
  title: string,
  description: string,
  timeBegin: string,
  timeEnd: string,
): MockEvent => ({
  id,
  title,
  description,
  image: null,
  timeBegin,
  timeEnd,
  createdAt: STAMP,
  lastModified: STAMP,
});

const inv = (
  email: string,
  handle: string | null,
  response: MockInvitation["response"],
  attendance: number[] | null,
  invitedAt = "2026-01-06T09:00:00Z",
): MockInvitation => ({
  email,
  handle,
  invitedAt,
  respondedAt: response ? "2026-01-08T18:30:00Z" : null,
  response,
  attendance,
  lastModified: response ? "2026-01-08T18:30:00Z" : invitedAt,
});

// Main Hall: four tables of four seats laid out on a 0-1 grid.
const mainHallSeats: MockSeat[] = ["A", "B", "C", "D"].flatMap((row, r) =>
  [1, 2, 3, 4].map((n, c) => ({
    id: 4010 + r * 4 + c + 1,
    roomId: 4011,
    label: `${row}${n}`,
    description:
      n === 1 ? `Corner of table ${row}, near the power strip` : null,
    x: 0.15 + c * 0.23,
    y: 0.2 + r * 0.2,
  })),
);

const loungeSeats: MockSeat[] = [
  {
    id: 4031,
    roomId: 4012,
    label: "Sofa 1",
    description: "Console corner, Mario Kart",
    x: 0.25,
    y: 0.5,
  },
  {
    id: 4032,
    roomId: 4012,
    label: "Sofa 2",
    description: null,
    x: 0.5,
    y: 0.5,
  },
  {
    id: 4033,
    roomId: 4012,
    label: "Beanbag",
    description: "Tabletop games area",
    x: 0.75,
    y: 0.5,
  },
];

const scenarios: Scenario[] = [
  {
    event: makeEvent(
      401,
      "Winter Warzone LAN 2026",
      "Three days of frags, snacks and questionable sleep.\n\nDoors open Friday 6pm. Bring your own PC, monitor, headset and extension lead. Pizza on Saturday night, tournament finals Sunday at noon.",
      "2026-02-27T18:00:00Z",
      "2026-03-01T14:00:00Z",
    ),
    seatingConfig: {
      hasSeating: true,
      allowUnspecifiedSeat: true,
      unspecifiedSeatLabel: "Bring your own beanbag",
    },
    invitations: [
      inv("alex.harding@example.com", "FragMaster", "yes", [0, 1, 2, 3, 4]),
      inv("bex.okafor@example.com", "PixelPirate", "yes", [1, 2, 3]),
      inv("callum.reid@example.com", "NightOwl", "yes", [0, 1, 2, 3, 4]),
      inv("dani.moreno@example.com", "CasualDani", "maybe", [2, 3]),
      inv("eilidh.macleod@example.com", "HeadshotHaggis", "yes", [0, 1, 2]),
      inv("finn.oconnell@example.com", "LagSwitchLarry", "no", null),
      inv("grace.liu@example.com", "SupportMain", "maybe", [1, 2]),
      inv("hamza.qureshi@example.com", null, null, null),
      inv("isla.brennan@example.com", "CritHitCharlie", "yes", [2, 3, 4]),
      inv("jamie.whitfield@example.com", null, null, null),
    ],
    rooms: [
      {
        id: 4011,
        name: "Main Hall",
        description: "Four long tables, 16 seats, main projector",
        sortOrder: 0,
      },
      {
        id: 4012,
        name: "Chill-out Lounge",
        description: "Consoles, sofas and tabletop games",
        sortOrder: 1,
      },
      {
        id: 4013,
        name: "Overflow Room",
        description: null,
        sortOrder: 2,
      },
    ],
    seats: [...mainHallSeats, ...loungeSeats],
    reservations: [
      {
        id: 40101,
        seatId: 4011,
        invitationEmail: "alex.harding@example.com",
        attendanceBuckets: [0, 1, 2, 3, 4],
      },
      {
        id: 40102,
        seatId: 4012,
        invitationEmail: "bex.okafor@example.com",
        attendanceBuckets: [1, 2, 3],
      },
      {
        id: 40103,
        seatId: 4015,
        invitationEmail: "callum.reid@example.com",
        attendanceBuckets: [0, 1, 2, 3, 4],
      },
      {
        id: 40104,
        seatId: 4031,
        invitationEmail: "eilidh.macleod@example.com",
        attendanceBuckets: [0, 1, 2],
      },
      {
        id: 40105,
        seatId: null,
        invitationEmail: "isla.brennan@example.com",
        attendanceBuckets: [2, 3, 4],
      },
    ],
  },
  {
    event: makeEvent(
      402,
      "Retro Games Night",
      "A relaxed evening of couch co-op and old-school consoles. No seating plan needed.",
      "2026-03-13T19:00:00Z",
      "2026-03-13T23:30:00Z",
    ),
    seatingConfig: {
      hasSeating: false,
      allowUnspecifiedSeat: false,
      unspecifiedSeatLabel: "Unspecified Seat",
    },
    invitations: [
      inv("kiran.patel@example.com", "TankTopKiran", "yes", [0]),
      inv("lena.fischer@example.com", "SpeedrunLena", "yes", [0]),
      inv("marcus.bell@example.com", "BigBellBoom", "maybe", [0]),
      inv("nia.abara@example.com", null, null, null),
    ],
    rooms: [],
    seats: [],
    reservations: [],
  },
  {
    event: makeEvent(
      403,
      "Spring Smash Bash",
      "",
      "2026-04-17T18:00:00Z",
      "2026-04-19T12:00:00Z",
    ),
    seatingConfig: {
      hasSeating: false,
      allowUnspecifiedSeat: false,
      unspecifiedSeatLabel: "Unspecified Seat",
    },
    invitations: [],
    rooms: [],
    seats: [],
    reservations: [],
  },
  {
    event: makeEvent(
      404,
      "The Extremely Unofficial Northern Ireland Multi-Day Marathon LAN Party and Charity Tournament Spectacular 2026",
      "Welcome to the biggest and longest-running LAN party this side of the Irish Sea. Please read the whole thing before asking questions in the group chat.\n\nSchedule: Friday 4pm load-in and network setup, 7pm opening ceremony and first round of the Rocket League bracket. Saturday 10am breakfast (bacon rolls provided), noon Counter-Strike 2 five-a-side, 6pm team-building Mario Kart tournament, 9pm pizza and the traditional midnight Worms Armageddon showdown. Sunday 11am prize-giving and pack-down.\n\nRules: no wallhacks, no lag switches, no stealing snacks from other people's desks. All proceeds go to the local youth club.",
      "2026-05-22T16:00:00Z",
      "2026-05-24T15:00:00Z",
    ),
    seatingConfig: {
      hasSeating: true,
      allowUnspecifiedSeat: true,
      unspecifiedSeatLabel:
        "Wherever there is a free plug socket and a bit of floor",
    },
    invitations: [
      inv(
        "bartholomew.featherstonehaugh-armstrong@very-long-company-domain-name.example.com",
        "TheOneAndOnlyBartholomewOfTheNorthernRealms",
        "yes",
        [0, 1, 2, 3, 4],
      ),
      inv(
        "ciara.mcgonigle-oneill@example.com",
        "CiaraNoScope_420_BlazeIt",
        "maybe",
        [1, 2],
      ),
      inv("d@example.com", "D", "no", null),
      inv("evangeline.porter@example.com", null, null, null),
    ],
    rooms: [
      {
        id: 4041,
        name: "The Great Hall of Networked Computers and Assorted Cables",
        description:
          "The main event space with the big projector, the stage and the pizza table. Seating is on long trestle tables arranged in rows of eight.",
        sortOrder: 0,
      },
    ],
    seats: [
      {
        id: 4051,
        roomId: 4041,
        label: "Trestle 1 - Seat 1 (by the window)",
        description: "Extra mains socket, good for the kettle",
        x: 0.2,
        y: 0.3,
      },
      {
        id: 4052,
        roomId: 4041,
        label: "Trestle 1 - Seat 2",
        description: null,
        x: 0.4,
        y: 0.3,
      },
    ],
    reservations: [
      {
        id: 40401,
        seatId: 4051,
        invitationEmail:
          "bartholomew.featherstonehaugh-armstrong@very-long-company-domain-name.example.com",
        attendanceBuckets: [0, 1, 2, 3, 4],
      },
    ],
  },
];

const paginatedEvents = {
  events: [
    makeEvent(
      390,
      "Autumn Aim Trainer Open",
      "Last season's tournament weekend.",
      "2025-10-24T18:00:00Z",
      "2025-10-26T12:00:00Z",
    ),
    ...scenarios.map((s) => s.event),
  ],
  total: scenarios.length + 1,
  page: 1,
  limit: 100,
  totalPages: 1,
};

const table: Record<string, unknown> = {
  "GET /api/events": paginatedEvents,
  // The component first renders with the placeholder event id 0, before the
  // event itself has loaded.
  "GET /api/events/0/rooms": [],
  "GET /api/events/0/seating-config": {
    eventId: 0,
    hasSeating: false,
    allowUnspecifiedSeat: false,
    unspecifiedSeatLabel: "Unspecified Seat",
    createdAt: STAMP,
    lastModified: STAMP,
  },
};

for (const s of scenarios) {
  const id = s.event.id;
  table[`GET /api/events/${id}`] = s.event;
  table[`GET /api/events/${id}/seating-config`] = {
    eventId: id,
    ...s.seatingConfig,
    createdAt: STAMP,
    lastModified: STAMP,
  };
  table[`GET /api/events/${id}/invitations`] = s.invitations.map((i) => ({
    eventId: id,
    avatarUrl: null,
    ...i,
  }));
  table[`GET /api/events/${id}/rooms`] = s.rooms.map((r) => ({
    ...r,
    eventId: id,
    image: null,
    createdAt: STAMP,
    lastModified: STAMP,
  }));
  table[`GET /api/events/${id}/seats`] = s.seats.map((seat) => ({
    ...seat,
    eventId: id,
    createdAt: STAMP,
    lastModified: STAMP,
  }));
  table[`GET /api/events/${id}/seat-reservations`] = s.reservations.map(
    (r) => ({
      ...r,
      eventId: id,
      createdAt: STAMP,
      lastModified: STAMP,
    }),
  );
}

mockApi(table);

/** Fully configured event: seating, rooms, seats and mixed RSVPs. */
export const Default: Story = {
  decorators: [withRoute("/events/:id", "/events/401")],
};

/** As Default, with the Main Hall selected so the floorplan and seat list show its seats. */
export const RoomSelected: Story = {
  decorators: [withRoute("/events/:id", "/events/401")],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Select Main Hall" }),
    );
  },
};

/** Seating disabled and no rooms; a small invite list. */
export const NoSeating: Story = {
  decorators: [withRoute("/events/:id", "/events/402")],
};

/** Brand-new event with no description, no rooms and nobody invited. */
export const EmptyEvent: Story = {
  decorators: [withRoute("/events/:id", "/events/403")],
};

/** Very long title, description, room name, handles and email addresses. */
export const LongContent: Story = {
  decorators: [withRoute("/events/:id", "/events/404")],
};
