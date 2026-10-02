import type { Meta, StoryObj } from "@storybook/react-vite";
import RoomEditor from "../components/RoomEditor";
import type {
  ApiFeature,
  ApiLayout,
  ApiLayoutRoom,
  ApiLayoutSeat,
  ApiReservedBy,
  LayoutSubmit,
} from "../components/RoomEditor/layout";
import {
  mockApi,
  stubImages,
  mockResponse,
  withRoute,
  withUser,
} from "./mockApi";

stubImages();

const svgUri = (svg: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

// A rough architectural plan: walls, a bar, doors. Drawn at the grid's 12:8
// aspect so it lines up with the cells.
const plan = svgUri(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800">` +
    `<rect width="1200" height="800" fill="#d9d4c7"/>` +
    `<rect x="20" y="20" width="1160" height="760" fill="#efe9dc" stroke="#3b3a36" stroke-width="16"/>` +
    `<rect x="300" y="36" width="600" height="60" fill="#8b8574"/>` +
    `<rect x="36" y="600" width="180" height="164" fill="#b9b19c" stroke="#3b3a36" stroke-width="6"/>` +
    `<text x="126" y="690" text-anchor="middle" font-family="sans-serif" font-size="28" fill="#3b3a36">BAR</text>` +
    `<rect x="500" y="770" width="200" height="30" fill="#efe9dc"/>` +
    `<path d="M500 780 A100 100 0 0 1 600 680" fill="none" stroke="#3b3a36" stroke-width="4"/>` +
    `<g fill="#c9c2af" stroke="#6d6857" stroke-width="3">` +
    [200, 400, 700, 900]
      .flatMap((x) => [
        `<rect x="${x}" y="230" width="100" height="70"/>`,
        `<rect x="${x}" y="530" width="100" height="70"/>`,
      ])
      .join("") +
    `</g></svg>`,
);

const avatar = (email: string) =>
  `https://www.gravatar.com/avatar/${email.length}?d=robohash`;
const who = (handle: string): ApiReservedBy => {
  const email = `${handle.toLowerCase()}@example.com`;
  return { email, handle, avatarUrl: avatar(email) };
};

let nextId = 5000;
const seat = (
  label: string,
  col: number,
  row: number,
  rows: number,
  reservedBy: ApiReservedBy | null = null,
): ApiLayoutSeat => ({
  id: nextId++,
  label,
  description: null,
  gridCol: col,
  gridRow: row,
  x: (col + 0.5) / 12,
  y: (row + 0.5) / rows,
  reservedBy,
});

const screens = (row: number): ApiFeature[] =>
  [3, 4, 5, 6, 7, 8].map((col) => ({ col, row, kind: "screen" }));

const baseRoom = (
  eventId: number,
  id: number,
  name: string,
  description: string,
  rows: number,
  features: ApiFeature[],
  seats: ApiLayoutSeat[],
  extra: Partial<ApiLayoutRoom> = {},
): ApiLayoutRoom => ({
  id,
  eventId,
  name,
  description,
  image: null,
  sortOrder: id,
  gridRows: rows,
  features,
  backgroundUrl: null,
  backgroundStyle: "retro",
  backgroundOpacity: 0.6,
  seats,
  ...extra,
});

const autumn = (eventId: number): ApiLayout => ({
  rooms: [
    baseRoom(
      eventId,
      1,
      "Main Hall",
      "Two rows of seats, wired networking",
      8,
      [
        ...screens(0),
        { col: 5, row: 7, kind: "entrance" },
        { col: 6, row: 7, kind: "entrance" },
      ],
      [
        seat("A1", 2, 2, 8, who("NoScope_Nia")),
        seat("A2", 4, 2, 8),
        seat("A3", 7, 2, 8),
        seat("A4", 9, 2, 8, who("ProGamer123")),
        seat("B1", 2, 5, 8, who("CasualGamer")),
        seat("B2", 4, 5, 8, who("LagWizard")),
        seat("B3", 7, 5, 8),
        seat("B4", 9, 5, 8),
      ],
    ),
    baseRoom(
      eventId,
      2,
      "Games Room",
      "Console corner and board games",
      5,
      [
        ...screens(0),
        { col: 5, row: 4, kind: "entrance" },
        { col: 6, row: 4, kind: "entrance" },
      ],
      [seat("C1", 4, 2, 5, who("SamTheSniper")), seat("C2", 7, 2, 5)],
    ),
  ],
});

/** Answer `PUT /room-layout` the way the API does: echo with ids assigned. */
function saveHandler(eventId: number, state: { layout: ApiLayout }) {
  return ({ body }: { body: unknown }) => {
    const submit = body as LayoutSubmit;
    const reserved = new Map<number, ApiReservedBy>();
    const old = new Map<number, ApiLayoutRoom>();
    for (const r of state.layout.rooms) {
      old.set(r.id, r);
      for (const s of r.seats)
        if (s.reservedBy) reserved.set(s.id, s.reservedBy);
    }
    const kept = new Set(
      submit.rooms.flatMap((r) => r.seats.map((s) => s.id).filter(Boolean)),
    );
    const lost = [...reserved.keys()].filter((id) => !kept.has(id));
    if (lost.length && !submit.releaseReserved)
      return mockResponse(409, {
        error: {
          code: 409,
          reason: "Conflict",
          description: `${lost.length} reserved seat${lost.length === 1 ? "" : "s"} would be removed. Resend with releaseReserved=true to go ahead.`,
        },
      });
    state.layout = {
      rooms: submit.rooms.map((r, i) => {
        const id = r.id ?? nextId++;
        const prev = r.id != null ? old.get(r.id) : undefined;
        return baseRoom(
          eventId,
          id,
          r.name,
          r.description ?? "",
          r.gridRows,
          r.features,
          r.seats.map((s) => ({
            ...seat(s.label, s.gridCol, s.gridRow, r.gridRows),
            id: s.id ?? nextId++,
            reservedBy: s.id != null ? (reserved.get(s.id) ?? null) : null,
          })),
          {
            sortOrder: i,
            backgroundUrl: prev?.backgroundUrl ?? null,
            backgroundStyle: r.backgroundStyle,
            backgroundOpacity: r.backgroundOpacity,
          },
        );
      }),
    };
    return state.layout;
  };
}

function registerEvent(eventId: number, title: string, layout: ApiLayout) {
  const state = { layout };
  mockApi({
    [`GET /api/events/${eventId}`]: { id: eventId, title },
    [`GET /api/events/${eventId}/room-layout`]: () => state.layout,
    [`PUT /api/events/${eventId}/room-layout`]: saveHandler(eventId, state),
    [`PUT /api/events/${eventId}/rooms/:roomId/background`]: ({
      params,
    }: {
      params: Record<string, string>;
    }) => {
      const room = state.layout.rooms.find(
        (r) => String(r.id) === params.roomId,
      );
      if (room) room.backgroundUrl = plan;
      return room;
    },
    [`DELETE /api/events/${eventId}/rooms/:roomId/background`]: ({
      params,
    }: {
      params: Record<string, string>;
    }) => {
      const room = state.layout.rooms.find(
        (r) => String(r.id) === params.roomId,
      );
      if (room) room.backgroundUrl = null;
      return mockResponse(204, undefined);
    },
  });
}

registerEvent(1001, "Autumn LAN 2026", autumn(1001));

// 1002: a background plan on the main hall.
const withPlan = autumn(1002);
withPlan.rooms[0].backgroundUrl = plan;
registerEvent(1002, "Autumn LAN 2026", withPlan);

// 1003: no rooms yet.
registerEvent(1003, "Winter LAN 2027", { rooms: [] });

// 1004: the layout fails to load.
mockApi({
  "GET /api/events/1004": { id: 1004, title: "Broken LAN" },
  "GET /api/events/1004/room-layout": () =>
    mockResponse(500, {
      error: { code: 500, reason: "Internal Server Error", description: "db" },
    }),
});

// 1005: a legacy room from the old editor (no grid, x/y seats, base64 image).
registerEvent(1005, "Spring LAN 2025", {
  rooms: [
    baseRoom(
      1005,
      1,
      "Community Hall",
      "Set up with the old floorplan editor",
      8,
      [],
      [
        [0.14, 0.3],
        [0.29, 0.3],
        [0.43, 0.3],
        [0.57, 0.7],
        [0.71, 0.7],
        [0.86, 0.7],
      ].map(([x, y], i) => ({
        id: 7000 + i,
        label: `${i < 3 ? "A" : "B"}${(i % 3) + 1}`,
        description: null,
        gridCol: null,
        gridRow: null,
        x,
        y,
        reservedBy: i === 1 ? who("OldTimer") : null,
      })),
      { gridRows: null, image: plan, backgroundStyle: "original" },
    ),
  ],
});

// 1006: long identifiers and legacy labels that predate the 8-character
// limit ("Window seat 12"): tiles stay one square, the text is cut with an
// ellipsis and the full label + description are in the tooltip. The legacy
// labels raise the "Convert all to names" banner; WS12 already has a name.
registerEvent(1006, "Label Stress LAN", {
  rooms: [
    baseRoom(
      1006,
      1,
      "Main Hall",
      "Long labels and descriptions",
      6,
      screens(0),
      [
        {
          ...seat("Window seat 12", 1, 2, 6),
          description: "Window seat next to the fridge",
        },
        seat("ABCDEFGH", 2, 2, 6),
        seat("Seat-12", 3, 2, 6, who("NoScope_Nia")),
        {
          ...seat("WWWWWWWW", 4, 2, 6),
          description: "Widest possible identifier",
        },
        seat("A1", 5, 2, 6),
        seat("Legacy seat with a long name", 6, 2, 6, who("CasualGamer")),
        seat("x.y_z-9", 7, 2, 6),
        // Old-editor labels like the ones in the Lounge: the banner above
        // the grid offers to convert them to names.
        { ...seat("WALL SOFA (S)", 1, 4, 6), description: "Facing the TV" },
        seat("WALL SOFA (N)", 2, 4, 6, who("ZoeZoom")),
        // Already converted: a name plus a short identifier.
        {
          ...seat("WS12", 4, 4, 6),
          name: "Window seat 12",
          description: "Next to the radiator",
        },
      ],
    ),
  ],
});

// 1007: grouped shapes. An L-shaped door, two touching screens that stay two
// screens, and screens linked to seats by a side and by a corner (one seat
// with two screens: dual monitors).
const linked = (
  col: number,
  row: number,
  group: number,
  link?: [number, number],
): ApiFeature => ({
  col,
  row,
  kind: "screen",
  group,
  ...(link ? { linkCol: link[0], linkRow: link[1] } : {}),
});
registerEvent(1007, "Shapes LAN", {
  rooms: [
    baseRoom(
      1007,
      1,
      "Main Hall",
      "Merged, separate and linked screens",
      7,
      [
        // L-shaped door in the bottom-left corner.
        { col: 0, row: 5, kind: "entrance", group: 0 },
        { col: 0, row: 6, kind: "entrance", group: 0 },
        { col: 1, row: 6, kind: "entrance", group: 0 },
        // Two separate screens side by side.
        linked(4, 0, 1),
        linked(5, 0, 2),
        // A two-square screen above A1, linked by a side.
        linked(1, 1, 3, [1, 2]),
        linked(2, 1, 3, [1, 2]),
        // A2 (reserved) has two screens: one by its side, one at a corner.
        linked(5, 2, 4, [4, 2]),
        linked(3, 3, 5, [4, 2]),
        // A merged wall screen across the top right.
        linked(8, 0, 6),
        linked(9, 0, 6),
        linked(10, 0, 6),
      ],
      [
        seat("A1", 1, 2, 7),
        seat("A2", 4, 2, 7, who("NoScope_Nia")),
        seat("A3", 8, 2, 7),
        seat("B1", 4, 5, 7),
      ],
    ),
  ],
});

const meta = {
  title: "Admin/RoomEditor",
  component: RoomEditor,
  parameters: { layout: "padded" },
  decorators: [withUser({ isAdmin: true })],
} satisfies Meta<typeof RoomEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

const at = (eventId: number) => [
  withRoute("/admin/events/:id/rooms", `/admin/events/${eventId}/rooms`),
];

/** Two rooms with reserved seats (violet with the reserver's avatar). */
export const Default: Story = { decorators: at(1001) };

/** Main hall with an uploaded background plan in the Retro style. */
export const WithBackgroundPlan: Story = { decorators: at(1002) };

/** An event with no rooms yet. */
export const NoRooms: Story = { decorators: at(1003) };

/** The layout request fails. */
export const LoadError: Story = { decorators: at(1004) };

/** A room saved by the old editor: seats placed from x/y, legacy image shown. */
export const LegacyRoom: Story = { decorators: at(1005) };

/**
 * Long identifiers and legacy labels stay inside their squares (ellipsis +
 * tooltip); the banner above the grid converts the legacy labels to names
 * (select a legacy seat for its own "Use as name"). WS12 already has a name.
 */
export const LongLabels: Story = { decorators: at(1006) };

/** The long labels on a phone. */
export const LongLabelsMobile: Story = {
  decorators: at(1006),
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

/** Non-admins see an explanation instead of the editor. */
export const NotAdmin: Story = {
  decorators: [...at(1001), withUser({ isAdmin: false })],
};

/** Narrow screens: the grid keeps a 528px minimum and scrolls sideways. */
export const Mobile: Story = {
  decorators: at(1001),
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

/**
 * Shapes: an L-shaped door, two touching screens kept separate, a merged
 * wall screen and screens linked to seats (chain badges + amber connector).
 * Select a screen to merge, split or link it; try the Merge and Split tools.
 */
export const ShapesAndLinks: Story = { decorators: at(1007) };

/** The shapes room on a phone (Merge / Split work by tap and touch drag). */
export const ShapesAndLinksMobile: Story = {
  decorators: at(1007),
  globals: { viewport: { value: "mobile1", isRotated: false } },
};
