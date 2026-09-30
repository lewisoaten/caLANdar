import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import moment from "moment";
import FloorplanEditor from "../components/FloorplanEditor";
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

// 241: fully laid out room, plus a second room's seats that must be ignored
const main241 = seatGrid(
  241,
  1,
  1,
  [
    ["A", 0.3],
    ["B", 0.62],
  ],
  XS6,
  (l) => (l.startsWith("A") ? "Front row" : "Back row"),
);
registerSeats(241, [...main241, ...seatGrid(241, 2, 13, [["C", 0.5]], XS3)]);
const room241 = makeRoom(241, 1, "Main Hall", "PC gaming hall", main241);

// 242: room without a floorplan image
const bare242 = seatGrid(242, 1, 1, [["T", 0.5]], [0.25, 0.5, 0.75]);
registerSeats(242, bare242);
const room242 = makeRoom(242, 1, "Overflow Room", null, bare242, false);

// 243: empty room, image only (ready to place first seat)
registerSeats(243, []);
const room243 = makeRoom(243, 1, "Console Lounge", null, []);

// 244: long seat labels and room name
const long244 = seatGrid(244, 1, 1, [["Seat ", 0.4]], XS3).map((s, i) => ({
  ...s,
  label: ["Tournament Stage Seat 1 (Captain)", "Table 5", "B2"][i],
  description:
    i === 0 ? "Right beside the fire exit and the snack table" : null,
}));
registerSeats(244, long244);
const room244 = makeRoom(
  244,
  1,
  "The Enormous Community Centre Main Sports Hall (Ground Floor, East Wing)",
  null,
  long244,
);

const meta = {
  title: "Components/FloorplanEditor",
  component: FloorplanEditor,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  decorators: [withUser({ isAdmin: true })],
  args: { refreshKey: 0, onSeatsChanged: fn() },
} satisfies Meta<typeof FloorplanEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Admin editing a fully laid-out room: seats are draggable markers on the floorplan. */
export const EditingPopulatedRoom: Story = {
  args: { eventId: 241, room: room241 as Room },
};

/** A room with a floorplan image but no seats placed yet. */
export const EmptyFloorplan: Story = {
  args: { eventId: 243, room: room243 },
};

/** No floorplan image uploaded: seats are placed on a blank canvas. */
export const NoFloorplanImage: Story = {
  args: { eventId: 242, room: room242 as Room },
};

/** Long room name and long seat labels. */
export const LongLabels: Story = {
  args: { eventId: 244, room: room244 as Room },
};

/** No room selected in the room manager. */
export const NoRoomSelected: Story = {
  args: { eventId: 241, room: null },
};
