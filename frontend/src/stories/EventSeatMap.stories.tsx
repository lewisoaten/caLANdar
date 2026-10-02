import type { Decorator, Meta, StoryObj } from "@storybook/react-vite";
import Box from "@mui/material/Box";
import moment from "moment";
import EventSeatMap from "../components/EventSeatMap";
import { sectionGap } from "../components/hl";
import type { FloorPlanRoom } from "../components/seatFloorPlanModel";
import { EventData, EventSeatingConfig, Room, Seat } from "../types/events";
import { InvitationLiteData, RSVP } from "../types/invitations";
import type { SeatReservation } from "../types/seat_reservations";
import { designSeats, gamesRoom, mainHall, roomPhoto } from "./seatMapFixtures";
import {
  mockApi,
  mockResponse,
  stubImages,
  withRoute,
  withUser,
  type MockRequest,
} from "./mockApi";

stubImages();

const ME = "sam@example.com";

const stamp = moment.utc("2026-02-20T09:00:00Z");

const svgUri = (svg: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

// A simple 4:3 floorplan: outer walls, a seat under every seat, an entrance.
const floorplan = (title: string, seats: Array<[number, number]>) =>
  svgUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">` +
      `<rect width="800" height="600" fill="#e9edf2"/>` +
      `<rect x="24" y="24" width="752" height="552" rx="10" fill="#f8fafc" stroke="#475569" stroke-width="6"/>` +
      seats
        .map(
          ([x, y]) =>
            `<rect x="${x * 800 - 38}" y="${y * 600 - 20}" width="76" height="40" rx="6" fill="#cbd5e1" stroke="#94a3b8" stroke-width="2"/>`,
        )
        .join("") +
      `<text x="48" y="66" font-family="sans-serif" font-size="26" font-weight="700" fill="#475569">${title}</text>` +
      `<rect x="340" y="568" width="120" height="16" fill="#f8fafc"/>` +
      `<text x="400" y="560" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#64748b">ENTRANCE</text>` +
      `</svg>`,
  );

const avatar = (initials: string, color: string) =>
  svgUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${color}"/>` +
      `<text x="32" y="41" text-anchor="middle" font-family="sans-serif" font-size="26" font-weight="700" fill="#fff">${initials}</text></svg>`,
  );

const event = (id: number, title: string): EventData => ({
  id,
  createdAt: stamp,
  lastModified: stamp,
  title,
  description: "A weekend of LAN gaming",
  image: undefined,
  timeBegin: moment.utc("2026-03-13T18:00:00Z"),
  timeEnd: moment.utc("2026-03-15T12:00:00Z"),
});

const config = (
  eventId: number,
  overrides: Partial<EventSeatingConfig> = {},
): EventSeatingConfig => ({
  eventId,
  hasSeating: true,
  allowUnspecifiedSeat: true,
  unspecifiedSeatLabel: "Unspecified Seat",
  createdAt: stamp,
  lastModified: stamp,
  ...overrides,
});

const XS6 = [0.14, 0.29, 0.43, 0.57, 0.71, 0.86];
const XS3 = [0.25, 0.5, 0.75];

const seatGrid = (
  eventId: number,
  roomId: number,
  firstId: number,
  rows: Array<[string, number]>,
  xs: number[],
  describe: (label: string) => string | null = () => null,
): Seat[] => {
  let id = firstId;
  return rows.flatMap(([letter, y]) =>
    xs.map((x, i) => {
      const label = `${letter}${i + 1}`;
      return {
        id: id++,
        eventId,
        roomId,
        label,
        description: describe(label),
        x,
        y,
        createdAt: stamp,
        lastModified: stamp,
      };
    }),
  );
};

const makeRoom = (
  eventId: number,
  id: number,
  name: string,
  description: string | null,
  seats: Seat[],
): Room => ({
  id,
  eventId,
  name,
  description,
  image: floorplan(
    name,
    seats.map((s) => [s.x, s.y]),
  ),
  sortOrder: id,
  createdAt: stamp,
  lastModified: stamp,
});

const person = (
  eventId: number,
  handle: string | null,
  initials: string,
  color: string,
  response: RSVP,
  seatId: number | null,
  attendance: number[] = [1, 1, 1, 1, 1, 1, 1, 1],
): InvitationLiteData => ({
  eventId,
  avatarUrl: avatar(initials, color),
  handle,
  response,
  attendance,
  seatId,
  lastModified: stamp,
});

interface Me {
  handle: string;
  response: RSVP | null;
  attendance: number[] | null;
  /** Seat id, `null` for the unspecified seat, `undefined` for no reservation. */
  seatId?: number | null;
}

const register = (
  eventId: number,
  title: string,
  cfg: EventSeatingConfig,
  rooms: Room[],
  seats: Seat[],
  invitations: InvitationLiteData[],
  me: Me = {
    handle: "SamTheGamer",
    response: RSVP.yes,
    attendance: [1, 1, 1, 1, 1, 1, 1, 1],
  },
) => {
  // In-memory state so claim / swap / release work in the story.
  let reservation: SeatReservation | null =
    me.seatId === undefined
      ? null
      : {
          id: 1,
          eventId,
          seatId: me.seatId,
          invitationEmail: ME,
          attendanceBuckets: me.attendance ?? [],
          createdAt: stamp,
          lastModified: stamp,
        };
  const mine = (): InvitationLiteData => ({
    eventId,
    avatarUrl: null,
    handle: me.handle,
    response: me.response,
    attendance: me.attendance,
    seatId: reservation ? reservation.seatId : null,
    lastModified: stamp,
  });
  const everyone = () =>
    me.response === RSVP.yes || me.response === RSVP.maybe
      ? [...invitations, mine()]
      : invitations;
  const save = (body: unknown) => {
    const { seatId } = body as { seatId: number | null };
    const clash = invitations.some(
      (inv) => seatId !== null && inv.seatId === seatId,
    );
    if (clash)
      return mockResponse(409, {
        error: {
          code: 409,
          reason: "Conflict",
          description:
            "This seat is already reserved for one or more of the selected time buckets",
        },
      });
    reservation = {
      id: 1,
      eventId,
      seatId,
      invitationEmail: ME,
      attendanceBuckets: me.attendance ?? [],
      createdAt: stamp,
      lastModified: stamp,
    };
    return reservation;
  };
  mockApi({
    [`GET /api/events/${eventId}`]: event(eventId, title),
    [`GET /api/events/${eventId}/seating-config`]: cfg,
    [`GET /api/events/${eventId}/rooms`]: rooms,
    [`GET /api/events/${eventId}/seats`]: seats,
    [`GET /api/events/${eventId}/invitations`]: () => everyone(),
    [`GET /api/events/${eventId}/invitations/:email`]: () => ({
      ...mine(),
      email: ME,
      invitedAt: stamp,
      respondedAt: me.response ? stamp : null,
    }),
    [`GET /api/events/${eventId}/seat-reservations/me`]: () =>
      reservation ?? mockResponse(204, undefined),
    [`POST /api/events/${eventId}/seat-reservations/check-availability`]:
      () => ({
        availableSeatIds: seats
          .filter(
            (s) =>
              s.id !== reservation?.seatId &&
              !invitations.some((inv) => inv.seatId === s.id),
          )
          .map((s) => s.id),
      }),
    [`POST /api/events/${eventId}/seat-reservations/me`]: ({
      body,
    }: MockRequest) => save(body),
    [`PUT /api/events/${eventId}/seat-reservations/me`]: ({
      body,
    }: MockRequest) => save(body),
    [`DELETE /api/events/${eventId}/seat-reservations/me`]: () => {
      reservation = null;
      return mockResponse(204, undefined);
    },
  });
};

// --- 201: populated multi-room map -----------------------------------------
const seats201 = [
  ...seatGrid(
    201,
    1,
    1,
    [
      ["A", 0.3],
      ["B", 0.62],
    ],
    XS6,
    (l) =>
      l.startsWith("A") ? "Front row, next to the projector" : "Back row",
  ),
  ...seatGrid(
    201,
    2,
    13,
    [
      ["C", 0.35],
      ["D", 0.65],
    ],
    XS3,
    () => "Console corner",
  ),
];
const rooms201 = [
  makeRoom(
    201,
    1,
    "Main Hall",
    "PC gaming, 12 stations with 1Gbit wired networking",
    seats201.slice(0, 12),
  ),
  makeRoom(
    201,
    2,
    "Console Lounge",
    "Sofas, big screens and controllers for the couch crowd",
    seats201.slice(12),
  ),
];
const invitations201 = [
  person(201, "FragMaster", "FM", "#7c3aed", RSVP.yes, 1),
  person(
    201,
    "NightOwl",
    "NO",
    "#0ea5e9",
    RSVP.yes,
    2,
    [0, 0, 1, 1, 1, 1, 1, 0],
  ),
  person(
    201,
    "PixelPirate",
    "PP",
    "#db2777",
    RSVP.maybe,
    2,
    [1, 1, 1, 1, 0, 0, 0, 0],
  ),
  person(201, "LagLord", "LL", "#16a34a", RSVP.yes, 3),
  person(201, "Headshot_Hannah", "HH", "#ea580c", RSVP.yes, 5),
  person(
    201,
    "CtrlAltDefeat",
    "CD",
    "#475569",
    RSVP.maybe,
    7,
    [0, 0, 1, 1, 1, 1, 0, 0],
  ),
  person(201, "RespawnRick", "RR", "#0d9488", RSVP.yes, 8),
  person(201, "GGWellPlayed", "GG", "#4f46e5", RSVP.yes, 10),
  person(201, "Toxic_Tabby", "TT", "#be123c", RSVP.yes, 12),
  person(201, "CouchCoop", "CC", "#0891b2", RSVP.yes, 13),
  person(201, "SpeedrunSam", "SS", "#65a30d", RSVP.maybe, 15),
  person(201, "Noob_Slayer_99", "NS", "#9333ea", RSVP.yes, null),
  person(201, "AFK_Andy", "AA", "#b45309", RSVP.maybe, null),
  person(201, null, "?", "#64748b", RSVP.yes, null),
];
register(
  201,
  "Winter LAN 2026",
  config(201),
  rooms201,
  seats201,
  invitations201,
);

// --- 202: seating disabled --------------------------------------------------
register(202, "Retro Night", config(202, { hasSeating: false }), [], [], []);

// --- 203: seating enabled but no rooms yet ---------------------------------
register(203, "Spring Bash 2026", config(203), [], [], []);

// --- 204: fully booked, no unspecified option -------------------------------
const seats204 = seatGrid(
  204,
  1,
  101,
  [
    ["A", 0.35],
    ["B", 0.65],
  ],
  XS3,
  () => "Tournament stage",
);
const rooms204 = [
  makeRoom(204, 1, "Tournament Arena", "Final-round bracket seating", seats204),
];
const handles204: Array<[string, string, string]> = [
  ["Tilted_Tim", "TT", "#7c3aed"],
  ["ClutchQueen", "CQ", "#db2777"],
  ["OneTapOllie", "OO", "#0ea5e9"],
  ["BunnyHopBen", "BB", "#16a34a"],
  ["SniperSiobhan", "SS", "#ea580c"],
  ["RushB_Ryan", "RB", "#0d9488"],
];
register(
  204,
  "Grand Finals Weekend",
  config(204, { allowUnspecifiedSeat: false }),
  rooms204,
  seats204,
  seats204.map((s, i) =>
    person(
      204,
      handles204[i][0],
      handles204[i][1],
      handles204[i][2],
      RSVP.yes,
      s.id,
    ),
  ),
);

// --- 205: long room names, descriptions and handles -------------------------
const seats205 = seatGrid(
  205,
  1,
  201,
  [
    ["A", 0.4],
    ["B", 0.7],
  ],
  XS3,
  () => null,
);
const rooms205 = [
  makeRoom(
    205,
    1,
    "The Enormous Community Centre Main Sports Hall (Ground Floor, East Wing)",
    "Please note the hall doubles as the tournament stage on Saturday night, so seating near the back may be relocated for the finals broadcast and prize-giving ceremony.",
    seats205,
  ),
];
register(
  205,
  "The Extremely Long Named Annual Charity Marathon LAN",
  config(205, { unspecifiedSeatLabel: "Somewhere near a plug socket" }),
  rooms205,
  seats205,
  [
    person(
      205,
      "TheLegendaryDestroyerOfWorlds_2000",
      "TL",
      "#7c3aed",
      RSVP.yes,
      201,
    ),
    person(
      205,
      "Sir_Lagsalot_of_the_Lower_Ping",
      "SL",
      "#db2777",
      RSVP.maybe,
      202,
    ),
    person(
      205,
      "xX_DarkLord_Ultimate_Gamer_Xx",
      "XX",
      "#0ea5e9",
      RSVP.yes,
      202,
    ),
    person(205, "Bartholomew_Fitzgerald_III", "BF", "#16a34a", RSVP.yes, null),
  ],
);

// --- 206-209: the HyperLAN design's rooms (grid layout, features, background)
const designRooms = (eventId: number): FloorPlanRoom[] => [
  mainHall(eventId),
  gamesRoom(eventId, { backgroundUrl: roomPhoto }),
];

const squad = (eventId: number): InvitationLiteData[] => [
  { ...person(eventId, "NoScope_Nia", "", "", RSVP.yes, 1), avatarUrl: null },
  {
    ...person(
      eventId,
      "CasualGamer",
      "",
      "",
      RSVP.maybe,
      5,
      [1, 0, 1, 0, 0, 0, 0, 0],
    ),
    avatarUrl: null,
  },
  {
    ...person(
      eventId,
      "LagWizard",
      "",
      "",
      RSVP.yes,
      6,
      [0, 0, 1, 1, 1, 1, 1, 0],
    ),
    avatarUrl: null,
  },
  {
    ...person(
      eventId,
      "SamTheSniper",
      "",
      "",
      RSVP.yes,
      9,
      [0, 0, 0, 1, 1, 1, 1, 1],
    ),
    avatarUrl: null,
  },
  {
    ...person(eventId, "Dan_the_Man", "", "", RSVP.yes, null),
    avatarUrl: null,
  },
];

const registerDesign = (eventId: number, me: Me) =>
  register(
    eventId,
    "Autumn LAN 2026",
    config(eventId),
    designRooms(eventId),
    designSeats(eventId),
    squad(eventId),
    me,
  );

registerDesign(206, {
  handle: "ProGamer123",
  response: RSVP.yes,
  attendance: [1, 1, 1, 1, 1, 1, 1, 1],
  seatId: 4,
});
registerDesign(207, {
  handle: "ProGamer123",
  response: RSVP.yes,
  attendance: [1, 1, 1, 1, 1, 1, 1, 1],
});
registerDesign(208, {
  handle: "ProGamer123",
  response: null,
  attendance: null,
});
register(
  209,
  "Grand Finals Weekend",
  config(209, { allowUnspecifiedSeat: false }),
  designRooms(209),
  designSeats(209),
  squad(209),
  {
    handle: "ProGamer123",
    response: RSVP.maybe,
    attendance: [0, 0, 1, 1, 1, 1, 0, 0],
    seatId: 3,
  },
);

// Loading forever / failing API
const never = () => new Promise(() => {});
const fail = () => mockResponse(500, {});
mockApi(
  Object.fromEntries(
    [
      "",
      "/seating-config",
      "/rooms",
      "/seats",
      "/invitations",
      "/invitations/:email",
    ].flatMap((path) => [
      [`GET /api/events/210${path}`, never],
      [`GET /api/events/211${path}`, fail],
    ]),
  ),
);

/** Stand-in for the app shell's <main>: padding, max width, section gap. */
const withPageFrame: Decorator = (Story) => (
  <Box
    sx={{
      maxWidth: 1400,
      mx: "auto",
      px: "clamp(14px, 3vw, 40px)",
      py: "clamp(18px, 3vw, 40px)",
      display: "flex",
      flexDirection: "column",
      gap: sectionGap,
    }}
  >
    <Story />
  </Box>
);

const meta = {
  title: "Components/EventSeatMap",
  component: EventSeatMap,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  decorators: [withPageFrame],
} satisfies Meta<typeof EventSeatMap>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The design: you hold A4 (lime); tap a free seat to swap, or release it. */
export const YourSeat: Story = {
  decorators: [withRoute("/events/:id", "/events/206"), withUser()],
};

/** RSVP'd but no seat yet: pick one, then claim it (or bring your own seat). */
export const NoSeatYet: Story = {
  decorators: [withRoute("/events/:id", "/events/207"), withUser()],
};

/** Not RSVP'd: the plan is read-only and the panel points to the lobby. */
export const LockedUntilRsvp: Story = {
  decorators: [withRoute("/events/:id", "/events/208"), withUser()],
};

/** A specific seat is required (no release), maybe-RSVP with part-time attendance. */
export const SeatRequired: Story = {
  decorators: [withRoute("/events/:id", "/events/209"), withUser()],
};

/** Waiting for the API. */
export const Loading: Story = {
  decorators: [withRoute("/events/:id", "/events/210"), withUser()],
};

/** The API failed. */
export const LoadError: Story = {
  decorators: [withRoute("/events/:id", "/events/211"), withUser()],
};

/** Legacy rooms (x/y seats over an uploaded floorplan image), shared seats and unspecified attendees. */
export const PopulatedMultiRoom: Story = {
  decorators: [withRoute("/events/:id", "/events/201"), withUser()],
};

/** Every seat taken: the free counts are zero. */
export const FullyBooked: Story = {
  decorators: [withRoute("/events/:id", "/events/204"), withUser()],
};

/** Very long room and attendee names, plus a custom unspecified label. */
export const LongNames: Story = {
  decorators: [withRoute("/events/:id", "/events/205"), withUser()],
};

/** Seating turned off for the event. */
export const SeatingDisabled: Story = {
  decorators: [withRoute("/events/:id", "/events/202"), withUser()],
};

/** Seating enabled, but no rooms or seats configured yet. */
export const NoRoomsConfigured: Story = {
  decorators: [withRoute("/events/:id", "/events/203"), withUser()],
};
