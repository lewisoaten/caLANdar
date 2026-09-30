import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import moment from "moment";
import SeatList from "../components/SeatList";
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

const registerSeats = (eventId: number, seats: Seat[]) =>
  mockApi({ [`GET /api/events/${eventId}/seats`]: seats });

// 231: populated room plus seats in another room (filtered out by the component)
const main231 = seatGrid(
  231,
  1,
  1,
  [
    ["A", 0.3],
    ["B", 0.62],
  ],
  XS6,
  (l) =>
    l.startsWith("A")
      ? "Front row, next to the projector"
      : l === "B6"
        ? null
        : "Back row, near the power strips",
);
const lounge231 = seatGrid(231, 2, 13, [["C", 0.5]], XS3, () => "Sofa");
registerSeats(231, [...main231, ...lounge231]);
const room231 = makeRoom(231, 1, "Main Hall", "PC gaming hall", main231);

// 232: room with no seats yet
registerSeats(232, []);
const room232 = makeRoom(232, 1, "Console Lounge", null, []);

// 233: long labels and descriptions
const long233 = seatGrid(233, 1, 1, [["Battlestation ", 0.4]], XS3, (l) =>
  l.endsWith("1")
    ? "Right beside the fire exit and the snack table, so expect foot traffic all weekend"
    : l.endsWith("2")
      ? null
      : "Corner desk with the extra-wide monitor arm",
).map((s, i) => ({
  ...s,
  label: ["Tournament Stage Seat 1 (Captain)", "Table 5", "B2"][i],
  x: [0.123456, 0.5, 0.876543][i],
}));
registerSeats(233, long233);
const room233 = makeRoom(
  233,
  1,
  "The Enormous Community Centre Main Sports Hall",
  null,
  long233,
);

const meta = {
  title: "Components/SeatList",
  component: SeatList,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  decorators: [withUser({ isAdmin: true })],
  args: { refreshKey: 0, onSeatsChanged: fn() },
} satisfies Meta<typeof SeatList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Admin table of a room's seats with coordinates and edit/delete actions. */
export const WithSeats: Story = {
  args: { eventId: 231, room: room231 as Room },
};

/** A room selected but with no seats defined. */
export const EmptyRoom: Story = {
  args: { eventId: 232, room: room232 as Room },
};

/** Long labels, long descriptions and fractional coordinates. */
export const LongLabels: Story = {
  args: { eventId: 233, room: room233 as Room },
};

/** Nothing selected in the room manager yet. */
export const NoRoomSelected: Story = {
  args: { eventId: 231, room: null },
};
