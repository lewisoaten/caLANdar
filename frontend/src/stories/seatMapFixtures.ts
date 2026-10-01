/**
 * Floor-plan fixtures shared by the SeatFloorPlan and WizardSeatSelector
 * stories: the HyperLAN design's Main Hall (12x8) and Games Room (12x5).
 */
import moment from "moment";
import type {
  FloorPlanRoom,
  FloorPlanSeat,
  RoomFeature,
} from "../components/seatFloorPlanModel";

export const stamp = moment.utc("2026-02-20T09:00:00Z");

export const svgUri = (svg: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** A photo-like plan to show the retro / original background treatments. */
export const roomPhoto = svgUri(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800">` +
    `<rect width="1200" height="800" fill="#8a7a66"/>` +
    `<rect x="30" y="30" width="1140" height="740" fill="#c9b79c" stroke="#3b3024" stroke-width="16"/>` +
    `<rect x="300" y="40" width="600" height="60" fill="#222"/>` +
    `<rect x="160" y="240" width="880" height="80" rx="10" fill="#5a4632"/>` +
    `<rect x="160" y="500" width="880" height="80" rx="10" fill="#5a4632"/>` +
    `<circle cx="100" cy="700" r="50" fill="#6d8a4a"/>` +
    `<rect x="500" y="740" width="200" height="40" fill="#e8e2d0"/>` +
    `</svg>`,
);

const strip = (
  row: number,
  cols: number[],
  kind: "screen" | "entrance",
): RoomFeature[] => cols.map((col) => ({ col, row, kind }));

export const gridSeat = (
  eventId: number,
  roomId: number,
  id: number,
  label: string,
  gridCol: number,
  gridRow: number,
  rows: number,
  description: string | null = null,
): FloorPlanSeat => ({
  id,
  eventId,
  roomId,
  label,
  description,
  gridCol,
  gridRow,
  x: (gridCol + 0.5) / 12,
  y: (gridRow + 0.5) / rows,
  createdAt: stamp,
  lastModified: stamp,
});

export const mainHall = (
  eventId: number,
  over: Partial<FloorPlanRoom> = {},
): FloorPlanRoom => ({
  id: 1,
  eventId,
  name: "Main Hall",
  description: "Two rows of seats, wired 1GbE",
  image: null,
  sortOrder: 0,
  createdAt: stamp,
  lastModified: stamp,
  gridRows: 8,
  features: [
    ...strip(0, [3, 4, 5, 6, 7, 8], "screen"),
    ...strip(7, [5, 6], "entrance"),
  ],
  backgroundUrl: null,
  backgroundStyle: "retro",
  backgroundOpacity: 0.6,
  ...over,
});

export const gamesRoom = (
  eventId: number,
  over: Partial<FloorPlanRoom> = {},
): FloorPlanRoom => ({
  id: 2,
  eventId,
  name: "Games Room",
  description: "Console corner and board games",
  image: null,
  sortOrder: 1,
  createdAt: stamp,
  lastModified: stamp,
  gridRows: 5,
  features: [
    ...strip(0, [3, 4, 5, 6, 7, 8], "screen"),
    ...strip(4, [5, 6], "entrance"),
  ],
  backgroundUrl: null,
  backgroundStyle: "retro",
  backgroundOpacity: 0.6,
  ...over,
});

export const designSeats = (eventId: number): FloorPlanSeat[] => [
  gridSeat(eventId, 1, 1, "A1", 2, 2, 8, "Front row, by the projector"),
  gridSeat(eventId, 1, 2, "A2", 4, 2, 8),
  gridSeat(eventId, 1, 3, "A3", 7, 2, 8),
  gridSeat(eventId, 1, 4, "A4", 9, 2, 8),
  gridSeat(eventId, 1, 5, "B1", 2, 5, 8),
  gridSeat(eventId, 1, 6, "B2", 4, 5, 8),
  gridSeat(eventId, 1, 7, "B3", 7, 5, 8),
  gridSeat(eventId, 1, 8, "B4", 9, 5, 8),
  gridSeat(eventId, 2, 9, "C1", 4, 2, 5, "Console corner"),
  gridSeat(eventId, 2, 10, "C2", 7, 2, 5, "Console corner"),
];
