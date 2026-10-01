import { describe, it, expect } from "vitest";
import moment from "moment";
import {
  DEFAULT_GRID_ROWS,
  deriveFeatureGroups,
  labelRun,
  screenSeatLinks,
  squareEdges,
  touches,
  gridRowsFor,
  joinNames,
  layoutRoom,
  legacyCell,
  nextSeatInDirection,
  ownSeatLabel,
  roomBackground,
  roomCode,
  sortByCell,
  sortRooms,
  type FloorPlanRoom,
  type FloorPlanSeat,
} from "../components/seatFloorPlanModel";

const stamp = moment.utc("2026-01-01T00:00:00Z");

const room = (over: Partial<FloorPlanRoom> = {}): FloorPlanRoom => ({
  id: 1,
  eventId: 1,
  name: "Main Hall",
  description: null,
  image: null,
  sortOrder: 0,
  createdAt: stamp,
  lastModified: stamp,
  ...over,
});

let nextId = 1;
const seat = (over: Partial<FloorPlanSeat> = {}): FloorPlanSeat => ({
  id: nextId++,
  eventId: 1,
  roomId: 1,
  label: "A1",
  description: null,
  x: 0.5,
  y: 0.5,
  createdAt: stamp,
  lastModified: stamp,
  ...over,
});

describe("legacyCell", () => {
  it("maps relative x/y onto the 12-column grid (contract formula)", () => {
    expect(legacyCell(0, 0, 8)).toEqual({ col: 0, row: 0 });
    expect(legacyCell(0.2083, 0.3125, 8)).toEqual({ col: 2, row: 2 });
    expect(legacyCell(1, 1, 8)).toEqual({ col: 11, row: 7 });
  });

  it("clamps out-of-range and invalid positions", () => {
    expect(legacyCell(-2, 7, 5)).toEqual({ col: 0, row: 4 });
    expect(legacyCell(Number.NaN, 0.5, 8)).toEqual({ col: 6, row: 4 });
  });
});

describe("gridRowsFor", () => {
  it("uses the room's gridRows, or the editor default for legacy rooms", () => {
    expect(gridRowsFor(room({ gridRows: 5 }), [])).toBe(5);
    expect(gridRowsFor(room(), [])).toBe(DEFAULT_GRID_ROWS);
    expect(gridRowsFor(room({ gridRows: 0 }), [])).toBe(DEFAULT_GRID_ROWS);
  });

  it("grows to fit seats and features below the last row", () => {
    expect(
      gridRowsFor(room({ gridRows: 4 }), [seat({ gridCol: 0, gridRow: 6 })]),
    ).toBe(7);
    expect(
      gridRowsFor(
        room({ gridRows: 4, features: [{ col: 0, row: 9, kind: "screen" }] }),
        [],
      ),
    ).toBe(10);
  });

  it("adds rows when there are more seats than cells", () => {
    const many = Array.from({ length: 30 }, () => seat());
    expect(gridRowsFor(room({ gridRows: 2 }), many)).toBe(3);
  });
});

const cells = (g: { cells: { col: number; row: number }[] }) =>
  g.cells.map((c) => `${c.col},${c.row}`);

describe("deriveFeatureGroups", () => {
  it("draws legacy squares (no group) as horizontal runs, as before", () => {
    const groups = deriveFeatureGroups(
      [
        ...[3, 4, 5, 6, 7, 8].map((col) => ({ col, row: 0, kind: "screen" })),
        { col: 5, row: 7, kind: "entrance" },
        { col: 6, row: 7, kind: "entrance" },
        { col: 9, row: 7, kind: "screen" },
        // Stacked squares stay separate runs.
        { col: 0, row: 3, kind: "screen" },
        { col: 0, row: 4, kind: "screen" },
      ],
      8,
    );
    expect(groups.map((g) => [g.kind, cells(g).join(" ")])).toEqual([
      ["screen", "3,0 4,0 5,0 6,0 7,0 8,0"],
      ["screen", "0,3"],
      ["screen", "0,4"],
      ["entrance", "5,7 6,7"],
      ["screen", "9,7"],
    ]);
    expect(new Set(groups.map((g) => g.id)).size).toBe(groups.length);
  });

  it("keeps saved groups: separate neighbours, L shapes and links", () => {
    const groups = deriveFeatureGroups([
      { col: 3, row: 0, kind: "screen", group: 4 },
      { col: 4, row: 0, kind: "screen", group: 5, linkCol: 4, linkRow: 1 },
      { col: 0, row: 5, kind: "entrance", group: 1 },
      { col: 0, row: 6, kind: "entrance", group: 1 },
      { col: 1, row: 6, kind: "entrance", group: 1 },
    ]);
    expect(groups.map((g) => [g.id, cells(g).join(" ")])).toEqual([
      [4, "3,0"],
      [5, "4,0"],
      [1, "0,5 0,6 1,6"],
    ]);
    expect(groups[1].link).toEqual({ col: 4, row: 1 });
    expect(groups[0].link).toBeNull();
  });

  it("splits a saved group that isn't joined by sides, and mixes with legacy", () => {
    const groups = deriveFeatureGroups([
      { col: 0, row: 0, kind: "screen", group: 0 },
      { col: 1, row: 1, kind: "screen", group: 0 },
      { col: 5, row: 0, kind: "screen" },
    ]);
    expect(groups.map((g) => cells(g).join(" "))).toEqual([
      "0,0",
      "5,0",
      "1,1",
    ]);
    expect(new Set(groups.map((g) => g.id)).size).toBe(3);
    // Links only count on screens.
    expect(
      deriveFeatureGroups([
        { col: 0, row: 0, kind: "entrance", group: 0, linkCol: 1, linkRow: 0 },
      ])[0].link,
    ).toBeNull();
  });

  it("ignores unknown kinds, duplicates and cells outside the grid", () => {
    expect(
      deriveFeatureGroups(
        [
          { col: 1, row: 1, kind: "plant" },
          { col: 12, row: 0, kind: "screen" },
          { col: 0, row: 8, kind: "screen" },
        ],
        8,
      ),
    ).toEqual([]);
    expect(deriveFeatureGroups(null, 8)).toEqual([]);
    expect(
      deriveFeatureGroups([
        { col: 2, row: 2, kind: "screen" },
        { col: 2, row: 2, kind: "entrance" },
      ]),
    ).toHaveLength(1);
  });
});

describe("shape geometry", () => {
  const l = [
    { col: 0, row: 0 },
    { col: 1, row: 0 },
    { col: 0, row: 1 },
  ];

  it("puts the label on the longest run", () => {
    expect(labelRun(l)).toEqual({ col: 0, row: 0, span: 2, vertical: false });
    expect(
      labelRun([
        { col: 4, row: 1 },
        { col: 4, row: 2 },
        { col: 4, row: 3 },
        { col: 5, row: 3 },
      ]),
    ).toEqual({ col: 4, row: 1, span: 3, vertical: true });
    expect(labelRun([{ col: 2, row: 2 }])).toEqual({
      col: 2,
      row: 2,
      span: 1,
      vertical: false,
    });
  });

  it("outlines only outer edges and keeps an L's inner corner open", () => {
    const corner = squareEdges(l, { col: 0, row: 0 });
    expect(corner).toMatchObject({
      top: true,
      left: true,
      right: false,
      bottom: false,
    });
    expect(corner.bridgeRight).toEqual({ top: true, bottom: true });
    expect(corner.bridgeDown).toEqual({ left: true, right: true, wide: false });
    expect(squareEdges(l, { col: 1, row: 0 }).bridgeRight).toBeNull();
    // A full 2x2 block fills the gap corner.
    const block = [...l, { col: 1, row: 1 }];
    const tl = squareEdges(block, { col: 0, row: 0 });
    expect(tl.bridgeDown).toEqual({ left: true, right: false, wide: true });
    expect(tl.bridgeRight).toEqual({ top: true, bottom: false });
  });

  it("touches counts sides and corners", () => {
    expect(touches({ col: 1, row: 1 }, { col: 2, row: 2 })).toBe(true);
    expect(touches({ col: 1, row: 1 }, { col: 1, row: 0 })).toBe(true);
    expect(touches({ col: 1, row: 1 }, { col: 3, row: 1 })).toBe(false);
    expect(touches({ col: 1, row: 1 }, { col: 1, row: 1 })).toBe(false);
  });
});

describe("screenSeatLinks", () => {
  it("resolves links by seat position and ignores stale ones", () => {
    const a = seat({ gridCol: 2, gridRow: 1 });
    const b = seat({ gridCol: 6, gridRow: 1 });
    const layout = layoutRoom(
      room({
        gridRows: 4,
        features: [
          // Diagonal link to A.
          { col: 1, row: 0, kind: "screen", group: 0, linkCol: 2, linkRow: 1 },
          // Side link to B.
          { col: 6, row: 0, kind: "screen", group: 1, linkCol: 6, linkRow: 1 },
          // No seat at the target.
          { col: 9, row: 0, kind: "screen", group: 2, linkCol: 9, linkRow: 1 },
          // Seat exists but doesn't touch.
          { col: 0, row: 3, kind: "screen", group: 3, linkCol: 2, linkRow: 1 },
        ],
      }),
      [a, b],
    );
    expect([...screenSeatLinks(layout)]).toEqual([
      [0, a.id],
      [1, b.id],
    ]);
  });
});

describe("layoutRoom", () => {
  it("keeps valid grid cells", () => {
    const a = seat({ gridCol: 2, gridRow: 2 });
    const b = seat({ gridCol: 9, gridRow: 5 });
    const { cells, rows } = layoutRoom(room({ gridRows: 8 }), [a, b]);
    expect(rows).toBe(8);
    expect(cells.get(a.id)).toEqual({ col: 2, row: 2 });
    expect(cells.get(b.id)).toEqual({ col: 9, row: 5 });
  });

  it("places legacy seats from x/y", () => {
    const a = seat({ x: 0.2083, y: 0.3125 });
    const { cells } = layoutRoom(room(), [a]);
    expect(cells.get(a.id)).toEqual({ col: 2, row: 2 });
  });

  it("moves colliding seats to the nearest free cell on the same row", () => {
    const a = seat({ x: 0.5, y: 0.5, label: "A1" });
    const b = seat({ x: 0.51, y: 0.52, label: "A2" });
    const { cells } = layoutRoom(room(), [a, b]);
    const ca = cells.get(a.id)!;
    const cb = cells.get(b.id)!;
    expect(ca).toEqual({ col: 6, row: 4 });
    expect(cb.row).toBe(4);
    expect(Math.abs(cb.col - ca.col)).toBe(1);
  });

  it("never puts a seat on a feature cell or on another seat", () => {
    const r = room({
      gridRows: 3,
      features: [{ col: 6, row: 1, kind: "screen" }],
    });
    const a = seat({ gridCol: 6, gridRow: 1 });
    const b = seat({ gridCol: 0, gridRow: 0 });
    const c = seat({ gridCol: 0, gridRow: 0 });
    const { cells } = layoutRoom(r, [a, b, c]);
    const keys = [a, b, c].map((s) => {
      const cell = cells.get(s.id)!;
      return `${cell.col},${cell.row}`;
    });
    expect(new Set(keys).size).toBe(3);
    expect(keys).not.toContain("6,1");
    expect(cells.get(b.id)).toEqual({ col: 0, row: 0 });
  });
});

describe("nextSeatInDirection", () => {
  const seats = [
    { id: 1, col: 2, row: 2 },
    { id: 2, col: 4, row: 2 },
    { id: 3, col: 9, row: 2 },
    { id: 4, col: 2, row: 5 },
    { id: 5, col: 5, row: 5 },
  ];

  it("moves along the row first", () => {
    expect(nextSeatInDirection(seats, 1, "ArrowRight")).toBe(2);
    expect(nextSeatInDirection(seats, 2, "ArrowRight")).toBe(3);
    expect(nextSeatInDirection(seats, 2, "ArrowLeft")).toBe(1);
  });

  it("moves between rows to the closest column", () => {
    expect(nextSeatInDirection(seats, 2, "ArrowDown")).toBe(5);
    expect(nextSeatInDirection(seats, 4, "ArrowUp")).toBe(1);
  });

  it("returns null at the edge or for an unknown seat", () => {
    expect(nextSeatInDirection(seats, 3, "ArrowRight")).toBeNull();
    expect(nextSeatInDirection(seats, 1, "ArrowUp")).toBeNull();
    expect(nextSeatInDirection(seats, 99, "ArrowUp")).toBeNull();
  });
});

describe("roomBackground", () => {
  it("prefers the uploaded plan with its style and opacity", () => {
    expect(
      roomBackground(
        room({
          backgroundUrl: "/api/room-backgrounds/abc",
          backgroundStyle: "original",
          backgroundOpacity: 0.4,
          image: "data:legacy",
        }),
      ),
    ).toEqual({
      url: "/api/room-backgrounds/abc",
      style: "original",
      opacity: 0.4,
    });
  });

  it("defaults uploads to retro at 60%", () => {
    expect(roomBackground(room({ backgroundUrl: "/bg" }))).toEqual({
      url: "/bg",
      style: "retro",
      opacity: 0.6,
    });
  });

  it("falls back to the legacy floorplan image, shown as the original", () => {
    expect(roomBackground(room({ image: "data:legacy" }))).toEqual({
      url: "data:legacy",
      style: "original",
      opacity: 0.6,
    });
  });

  it("clamps opacity and returns null without an image", () => {
    expect(
      roomBackground(room({ backgroundUrl: "/bg", backgroundOpacity: 3 }))
        ?.opacity,
    ).toBe(1);
    expect(roomBackground(room())).toBeNull();
  });
});

describe("small helpers", () => {
  it("formats room codes", () => {
    expect(roomCode(0)).toBe("RM-01");
    expect(roomCode(11)).toBe("RM-12");
  });

  it("sorts rooms by sortOrder then id", () => {
    const rooms = [
      room({ id: 3, sortOrder: 1 }),
      room({ id: 2, sortOrder: 0 }),
      room({ id: 1, sortOrder: 1 }),
    ];
    expect(sortRooms(rooms).map((r) => r.id)).toEqual([2, 1, 3]);
  });

  it("sorts items by grid reading order", () => {
    const cells = new Map([
      [1, { col: 5, row: 1 }],
      [2, { col: 0, row: 2 }],
      [3, { col: 1, row: 1 }],
    ]);
    expect(
      sortByCell([{ id: 1 }, { id: 2 }, { id: 3 }], cells).map((i) => i.id),
    ).toEqual([3, 1, 2]);
  });

  it("joins names", () => {
    expect(joinNames([])).toBe("");
    expect(joinNames(["A"])).toBe("A");
    expect(joinNames(["A", "B"])).toBe("A and B");
    expect(joinNames(["A", "B", "C"])).toBe("A, B and C");
  });

  it("uses 'Bring my own seat' for the default unspecified label", () => {
    expect(ownSeatLabel("Unspecified Seat")).toBe("Bring my own seat");
    expect(ownSeatLabel("")).toBe("Bring my own seat");
    expect(ownSeatLabel(null)).toBe("Bring my own seat");
    expect(ownSeatLabel("Somewhere near a plug")).toBe("Somewhere near a plug");
  });
});
