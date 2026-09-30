import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import moment from "moment";
import RoomManager from "../components/RoomManager";
import { Room, Seat } from "../types/events";
import { mockApi, withUser } from "./mockApi";

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
  withImage = true,
): Room => ({
  id,
  eventId,
  name,
  description,
  image: withImage
    ? floorplan(
        name,
        seats.map((s) => [s.x, s.y]),
      )
    : null,
  sortOrder: id,
  createdAt: stamp,
  lastModified: stamp,
});

const registerRooms = (eventId: number, rooms: Room[]) =>
  mockApi({ [`GET /api/events/${eventId}/rooms`]: rooms });

// 221: three rooms with floorplans
const main221 = seatGrid(
  221,
  1,
  1,
  [
    ["A", 0.3],
    ["B", 0.62],
  ],
  XS6,
);
const lounge221 = seatGrid(221, 2, 13, [["C", 0.5]], XS3);
const stream221 = seatGrid(221, 3, 16, [["S", 0.5]], [0.5]);
registerRooms(221, [
  makeRoom(
    221,
    1,
    "Main Hall",
    "PC gaming, 12 stations with wired 1Gbit networking",
    main221,
  ),
  makeRoom(
    221,
    2,
    "Console Lounge",
    "Sofas, big screens and controllers",
    lounge221,
  ),
  makeRoom(221, 3, "Streaming Booth", null, stream221),
]);

// 222: nothing configured yet
registerRooms(222, []);

// 223: long names and descriptions, one room without an image
registerRooms(223, [
  makeRoom(
    223,
    1,
    "The Enormous Community Centre Main Sports Hall (Ground Floor, East Wing)",
    "Doubles as the tournament stage on Saturday night, so seating near the back may be relocated for the finals broadcast and prize-giving ceremony.",
    seatGrid(223, 1, 1, [["A", 0.4]], XS3),
  ),
  makeRoom(
    223,
    2,
    "Overflow Room Behind the Kitchen",
    "Only opened once the main hall is full.",
    [],
    false,
  ),
]);

const meta = {
  title: "Components/RoomManager",
  component: RoomManager,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  decorators: [withUser({ isAdmin: true })],
  args: { onRoomSelect: fn() },
} satisfies Meta<typeof RoomManager>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Admin view of an event's rooms as cards with floorplan thumbnails. */
export const WithRooms: Story = {
  args: { eventId: 221 },
};

/** No rooms yet: only the empty-state hint and the Add Room button. */
export const NoRooms: Story = {
  args: { eventId: 222 },
};

/** Long names and descriptions, and a room with no floorplan image. */
export const LongNamesAndMissingImage: Story = {
  args: { eventId: 223 },
};
