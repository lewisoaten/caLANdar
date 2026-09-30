import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import moment from "moment";
import RoomFloorplanView, {
  SeatDisplayData,
} from "../components/RoomFloorplanView";
import { Room, Seat } from "../types/events";
import { InvitationLiteData, RSVP } from "../types/invitations";

const stamp = moment.utc("2026-02-20T09:00:00Z");

const svgUri = (svg: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

// A simple 4:3 floorplan: outer walls, a desk under every seat, an entrance.
const floorplan = (title: string, desks: Array<[number, number]>) =>
  svgUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">` +
      `<rect width="800" height="600" fill="#e9edf2"/>` +
      `<rect x="24" y="24" width="752" height="552" rx="10" fill="#f8fafc" stroke="#475569" stroke-width="6"/>` +
      desks
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

const XS = [0.14, 0.29, 0.43, 0.57, 0.71, 0.86];

const makeSeats = (): Seat[] => {
  const rows: Array<[string, number, string]> = [
    ["A", 0.3, "Front row"],
    ["B", 0.62, "Back row"],
  ];
  let id = 1;
  return rows.flatMap(([letter, y, desc]) =>
    XS.map((x, i) => ({
      id: id++,
      eventId: 1,
      roomId: 1,
      label: `${letter}${i + 1}`,
      description: `${desc}, position ${i + 1}`,
      x,
      y,
      createdAt: stamp,
      lastModified: stamp,
    })),
  );
};

const seats = makeSeats();

const room: Room = {
  id: 1,
  eventId: 1,
  name: "Main Hall",
  description: "The main gaming hall",
  image: floorplan(
    "Main Hall",
    seats.map((s) => [s.x, s.y]),
  ),
  sortOrder: 0,
  createdAt: stamp,
  lastModified: stamp,
};

const person = (
  handle: string,
  initials: string,
  color: string,
  response: RSVP,
  seatId: number,
): InvitationLiteData => ({
  eventId: 1,
  avatarUrl: avatar(initials, color),
  handle,
  response,
  attendance: [1, 1, 1, 1, 1, 1],
  seatId,
  lastModified: stamp,
});

const free = (): SeatDisplayData[] =>
  seats.map((seat) => ({ seat, occupants: [] }));

const occupied = (): SeatDisplayData[] => {
  const byId: Record<number, InvitationLiteData[]> = {
    1: [person("FragMaster", "FM", "#7c3aed", RSVP.yes, 1)],
    2: [person("NightOwl", "NO", "#0ea5e9", RSVP.yes, 2)],
    4: [person("PixelPirate", "PP", "#db2777", RSVP.maybe, 4)],
    5: [person("LagLord", "LL", "#16a34a", RSVP.yes, 5)],
    7: [person("Headshot_Hannah", "HH", "#ea580c", RSVP.yes, 7)],
    9: [person("CtrlAltDefeat", "CD", "#475569", RSVP.maybe, 9)],
    12: [person("RespawnRick", "RR", "#0d9488", RSVP.yes, 12)],
  };
  return seats.map((seat) => ({ seat, occupants: byId[seat.id] ?? [] }));
};

const meta = {
  title: "Components/RoomFloorplanView",
  component: RoomFloorplanView,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 720 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RoomFloorplanView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Read-only view with every seat still free. */
export const AllSeatsAvailable: Story = {
  args: { room, seats: free() },
};

/** Occupied seats show the attendee avatar; maybe-RSVPs get an amber ring. */
export const SomeSeatsOccupied: Story = {
  args: { room, seats: occupied() },
};

/** Interactive selection: own seat, available seats and unavailable (grey) seats. */
export const SeatSelection: Story = {
  args: {
    room,
    seats: seats.map((seat) => ({
      seat,
      occupants: [],
      isOwnSeat: seat.id === 3,
      isAvailable: ![1, 2, 6, 8, 9, 10].includes(seat.id),
      onClick: fn(),
    })),
  },
};

/** Several people sharing one seat show as stacked avatars. */
export const SharedSeats: Story = {
  args: {
    room,
    seats: seats.map((seat) => ({
      seat,
      occupants:
        seat.id === 2
          ? [
              person("FragMaster", "FM", "#7c3aed", RSVP.yes, 2),
              person("NightOwl", "NO", "#0ea5e9", RSVP.yes, 2),
              person("PixelPirate", "PP", "#db2777", RSVP.maybe, 2),
            ]
          : seat.id === 8
            ? [
                person("LagLord", "LL", "#16a34a", RSVP.yes, 8),
                person("RespawnRick", "RR", "#0d9488", RSVP.maybe, 8),
              ]
            : [],
    })),
  },
};

/** Seat labels and occupant handles that are much longer than expected. */
export const LongLabels: Story = {
  args: {
    room,
    seats: seats.slice(0, 6).map((seat, i) => ({
      seat: {
        ...seat,
        label: `Corner Battlestation ${seat.label}`,
        description:
          "Next to the fire exit, beside the snack table and the tournament projector",
      },
      occupants:
        i % 2 === 0
          ? [
              person(
                "TheLegendaryDestroyerOfWorlds_2000",
                "TL",
                "#7c3aed",
                RSVP.yes,
                seat.id,
              ),
            ]
          : [],
    })),
  },
};
