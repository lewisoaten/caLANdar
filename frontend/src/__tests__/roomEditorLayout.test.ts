import { describe, it, expect } from "vitest";
import {
  applyTool,
  canMergeAdjacent,
  cellKey,
  cellLabel,
  describeSeat,
  describePlan,
  duplicateLabels,
  fromLayout,
  groupKeys,
  isDuplicateLabel,
  linkCandidates,
  linkedSeat,
  mergeAdjacent,
  mergePath,
  mergeShapes,
  normalizeRoom,
  isValidIdentifier,
  legacyCell,
  MAX_DESCRIPTION_LENGTH,
  minRows,
  moveFocus,
  moveGroup,
  moveItem,
  newRoom,
  nextSeatLabel,
  planMove,
  removedReservations,
  renameSeat,
  sanitizeLabel,
  screensLinkedTo,
  setRows,
  setScreenLink,
  splitAll,
  splitSquare,
  snapshot,
  toSubmit,
  toolForShortcut,
  validateBackgroundFile,
  validateRooms,
  type ApiLayoutRoom,
  type Cell,
  type FeatureCell,
  type SeatCell,
  type EditorRoom,
} from "../components/RoomEditor/layout";

const nia = {
  email: "nia@example.com",
  handle: "NoScope_Nia",
  avatarUrl: "https://example.com/nia.png",
};

const room = (cells: Record<string, Cell> = {}, rows = 8): EditorRoom => ({
  key: "r1",
  id: 1,
  name: "Main Hall",
  description: "",
  rows,
  cells,
  links: {},
  backgroundUrl: null,
  legacyImage: null,
  backgroundStyle: "retro",
  backgroundOpacity: 60,
});

const apiRoom = (over: Partial<ApiLayoutRoom> = {}): ApiLayoutRoom => ({
  id: 1,
  eventId: 9,
  name: "Main Hall",
  description: null,
  image: null,
  sortOrder: 0,
  gridRows: 8,
  features: [],
  backgroundUrl: null,
  backgroundStyle: "retro",
  backgroundOpacity: 0.6,
  seats: [],
  ...over,
});

describe("nextSeatLabel", () => {
  it("starts an empty room at A1", () => {
    expect(nextSeatLabel(room(), 2)).toBe("A1");
  });

  it("continues the row's letter with the lowest free number", () => {
    const r = room({
      "2,2": { t: "seat", label: "A1" },
      "4,2": { t: "seat", label: "A3" },
    });
    expect(nextSeatLabel(r, 2)).toBe("A2");
  });

  it("gives a new row the next letter nobody uses (skipping I and O)", () => {
    const r = room({
      "2,2": { t: "seat", label: "A1" },
      "2,5": { t: "seat", label: "B1" },
    });
    expect(nextSeatLabel(r, 7)).toBe("C1");
    const lots: Record<string, Cell> = {};
    "ABCDEFGH".split("").forEach((l, i) => {
      lots[cellKey(0, i)] = { t: "seat", label: `${l}1` };
    });
    expect(nextSeatLabel(room(lots, 12), 10)).toBe("J1");
  });

  it("ignores numeric-only labels when picking the row letter", () => {
    const r = room({ "0,1": { t: "seat", label: "12" } });
    expect(nextSeatLabel(r, 1)).toBe("A1");
  });

  it("never returns a label longer than 8 characters", () => {
    const r = room({ "0,0": { t: "seat", label: "ABCDEFGH" } });
    const label = nextSeatLabel(r, 0);
    expect(label.length).toBeLessThanOrEqual(8);
    expect(label).toBe("A1");
  });

  it("treats identifiers case-insensitively when numbering", () => {
    const r = room({ "0,0": { t: "seat", label: "a1" } });
    expect(nextSeatLabel(r, 0)).toBe("A2");
  });
});

describe("labels", () => {
  it("sanitises to A-Z a-z 0-9 - _ ., max 8, keeping case", () => {
    expect(sanitizeLabel("a-1 b2c")).toBe("a-1b2c");
    expect(sanitizeLabel("Win.dow_12345")).toBe("Win.dow_");
    expect(sanitizeLabel("é!")).toBe("");
  });

  it("knows which identifiers are valid (legacy labels are not)", () => {
    expect(isValidIdentifier("A1")).toBe(true);
    expect(isValidIdentifier("Seat-12")).toBe(true);
    expect(isValidIdentifier("ABCDEFGH")).toBe(true);
    expect(isValidIdentifier("ABCDEFGHI")).toBe(false);
    expect(isValidIdentifier("Window seat 12")).toBe(false);
    expect(isValidIdentifier("")).toBe(false);
  });

  it("flags duplicates regardless of case", () => {
    const r = room({
      "0,0": { t: "seat", label: "a1" },
      "1,0": { t: "seat", label: "A1" },
    });
    expect(isDuplicateLabel(r, "0,0")).toBe(true);
    expect(duplicateLabels(r)).toEqual(new Set(["a1", "A1"]));
  });

  it("sets descriptions on seats only, capped at 120 characters", () => {
    const r = room({
      "0,0": { t: "seat", label: "A1" },
      "1,0": { t: "screen", g: 0 },
    });
    const d = describeSeat(r, "0,0", "Window seat next to the fridge");
    expect(d.cells["0,0"]).toEqual({
      t: "seat",
      label: "A1",
      description: "Window seat next to the fridge",
    });
    expect(
      (describeSeat(r, "0,0", "x".repeat(200)).cells["0,0"] as SeatCell)
        .description,
    ).toHaveLength(MAX_DESCRIPTION_LENGTH);
    // Counted in code points like the API, never cutting a surrogate pair.
    const emoji = (
      describeSeat(r, "0,0", "🎮".repeat(150)).cells["0,0"] as SeatCell
    ).description as string;
    expect(Array.from(emoji)).toHaveLength(MAX_DESCRIPTION_LENGTH);
    expect(emoji.endsWith("🎮")).toBe(true);
    expect(describeSeat(r, "1,0", "nope")).toBe(r);
    // Trimmed, and blank becomes null, in the PUT body.
    const padded = describeSeat(r, "0,0", "  By the door  ");
    expect(toSubmit([padded], false).rooms[0].seats[0].description).toBe(
      "By the door",
    );
    expect(
      toSubmit([describeSeat(r, "0,0", "   ")], false).rooms[0].seats[0]
        .description,
    ).toBeNull();
  });

  it("detects duplicates within a room", () => {
    const r = room({
      "0,0": { t: "seat", label: "A1" },
      "1,0": { t: "seat", label: "A1" },
      "2,0": { t: "seat", label: "A2" },
    });
    expect([...duplicateLabels(r)]).toEqual(["A1"]);
    expect(isDuplicateLabel(r, "0,0")).toBe(true);
    expect(isDuplicateLabel(r, "2,0")).toBe(false);
  });

  it("renames only seats, sanitising the value", () => {
    const r = room({
      "0,0": { t: "seat", label: "A1" },
      "1,0": { t: "screen", g: 0 },
    });
    expect(renameSeat(r, "0,0", "b12 x9 long").cells["0,0"]).toEqual({
      t: "seat",
      label: "b12x9lon",
    });
    expect(renameSeat(r, "1,0", "Z")).toBe(r);
  });
});

describe("applyTool", () => {
  const base = room({
    "2,2": { t: "seat", label: "A1", seatId: 10, reservedBy: nia },
    "4,2": { t: "seat", label: "A2", seatId: 11 },
    "5,0": { t: "screen", g: 0 },
  });

  it("select picks seats and features and clears on empty squares", () => {
    expect(applyTool(base, "select", "4,2", null)).toEqual({
      type: "select",
      sel: "4,2",
    });
    expect(applyTool(base, "select", "5,0", "4,2")).toEqual({
      type: "select",
      sel: "5,0",
    });
    expect(applyTool(base, "select", "9,5", "4,2")).toEqual({
      type: "select",
      sel: null,
    });
  });

  it("seat drops an auto-labelled seat and selects it", () => {
    const out = applyTool(base, "seat", "7,2", null);
    expect(out.type).toBe("update");
    if (out.type !== "update") return;
    expect(out.room.cells["7,2"]).toEqual({ t: "seat", label: "A3" });
    expect(out.sel).toBe("7,2");
    expect(out.announce).toBe("Placed seat A3 at column 8, row 3.");
    // Original is untouched.
    expect(base.cells["7,2"]).toBeUndefined();
  });

  it("seat on an existing seat selects it", () => {
    expect(applyTool(base, "seat", "4,2", null)).toEqual({
      type: "select",
      sel: "4,2",
    });
  });

  it("screen toggles and replaces free seats, never reserved ones", () => {
    const off = applyTool(base, "screen", "5,0", null);
    expect(off.type === "update" && off.room.cells["5,0"]).toBeUndefined();
    const over = applyTool(base, "screen", "4,2", "4,2");
    expect(over.type === "update" && over.room.cells["4,2"]).toEqual({
      t: "screen",
      g: 1,
    });
    expect(over.type === "update" && over.sel).toBeNull();
    const reserved = applyTool(base, "entrance", "2,2", null);
    expect(reserved.type).toBe("select");
    expect(reserved.type === "select" && reserved.announce).toMatch(/reserved/);
  });

  it("erase clears cells but asks before removing a reserved seat", () => {
    expect(applyTool(base, "erase", "2,2", null)).toEqual({
      type: "confirm",
      key: "2,2",
    });
    const out = applyTool(base, "erase", "4,2", "4,2");
    expect(out.type === "update" && out.room.cells["4,2"]).toBeUndefined();
    expect(out.type === "update" && out.sel).toBeNull();
    expect(applyTool(base, "erase", "0,0", null)).toEqual({ type: "noop" });
  });
});

describe("fromLayout / toSubmit", () => {
  it("places grid seats, legacy seats and features", () => {
    const [r] = fromLayout({
      rooms: [
        apiRoom({
          gridRows: 5,
          features: [
            { col: 3, row: 0, kind: "screen" },
            { col: 5, row: 4, kind: "entrance" },
          ],
          seats: [
            {
              id: 10,
              label: "A1",
              description: null,
              gridCol: 2,
              gridRow: 2,
              x: 0,
              y: 0,
              reservedBy: nia,
            },
            // Legacy seat, lands on the same cell as A1 -> nearest free cell.
            {
              id: 11,
              label: "L1",
              description: "window",
              gridCol: null,
              gridRow: null,
              x: 2.5 / 12,
              y: 2.5 / 5,
              reservedBy: null,
            },
          ],
        }),
      ],
    });
    expect(r.rows).toBe(5);
    expect(r.cells["2,2"]).toMatchObject({ label: "A1", seatId: 10 });
    const legacy = Object.entries(r.cells).find(
      ([, c]) => c.t === "seat" && c.label === "L1",
    );
    expect(legacy?.[0]).not.toBe("2,2");
    expect(r.cells["3,0"]).toMatchObject({ t: "screen" });
    expect(r.cells["5,4"]).toMatchObject({ t: "entrance" });
    expect(r.backgroundOpacity).toBe(60);
  });

  it("defaults legacy rooms to 8 rows and grows rows to fit content", () => {
    const [legacy] = fromLayout({ rooms: [apiRoom({ gridRows: null })] });
    expect(legacy.rows).toBe(8);
    const [grown] = fromLayout({
      rooms: [
        apiRoom({
          gridRows: 3,
          features: [{ col: 0, row: 6, kind: "screen" }],
        }),
      ],
    });
    expect(grown.rows).toBe(7);
  });

  it("uses the legacy image only when there is no uploaded background", () => {
    const [a, b] = fromLayout({
      rooms: [
        apiRoom({ image: "data:image/png;base64,AAA" }),
        apiRoom({
          id: 2,
          image: "data:x",
          backgroundUrl: "/api/room-backgrounds/t",
        }),
      ],
    });
    expect(a.legacyImage).toBe("data:image/png;base64,AAA");
    expect(b.legacyImage).toBeNull();
  });

  it("round-trips into the PUT body", () => {
    const r = room({
      "4,2": { t: "seat", label: "A2" },
      "2,2": { t: "seat", label: "A1", seatId: 10, reservedBy: nia },
      "3,0": { t: "screen", g: 7 },
    });
    const n = { ...newRoom([r], "new-1"), name: "  Games  " };
    const body = toSubmit([r, n], true);
    expect(body.releaseReserved).toBe(true);
    expect(body.rooms[0]).toEqual({
      id: 1,
      name: "Main Hall",
      description: null,
      sortOrder: 0,
      gridRows: 8,
      features: [{ col: 3, row: 0, kind: "screen", group: 0 }],
      backgroundStyle: "retro",
      backgroundOpacity: 0.6,
      seats: [
        { id: 10, label: "A1", description: null, gridCol: 2, gridRow: 2 },
        { label: "A2", description: null, gridCol: 4, gridRow: 2 },
      ],
    });
    expect(body.rooms[1]).toMatchObject({
      name: "Games",
      sortOrder: 1,
      gridRows: 6,
    });
    expect(body.rooms[1]).not.toHaveProperty("id");
  });

  it("snapshots ignore keys, cell order and group numbering", () => {
    const a = room({
      "0,0": { t: "screen", g: 0 },
      "1,0": { t: "screen", g: 1 },
    });
    const b = {
      ...room({ "1,0": { t: "screen", g: 4 }, "0,0": { t: "screen", g: 9 } }),
      key: "x",
    };
    expect(snapshot([a])).toBe(snapshot([b]));
    // ...but merging two squares is a change.
    const merged = room({
      "0,0": { t: "screen", g: 0 },
      "1,0": { t: "screen", g: 0 },
    });
    expect(snapshot([merged])).not.toBe(snapshot([a]));
  });
});

describe("rows", () => {
  it("can't shrink below the last occupied row", () => {
    const r = room({ "0,4": { t: "entrance", g: 0 } });
    expect(minRows(r)).toBe(5);
    expect(setRows(r, 2).rows).toBe(5);
    expect(setRows(r, 99).rows).toBe(50);
    expect(minRows(room())).toBe(1);
  });
});

describe("validation", () => {
  it("reports blank names, blank labels, duplicates and repeated room names", () => {
    const a = room({
      "0,0": { t: "seat", label: "" },
      "1,0": { t: "seat", label: "A1" },
      "2,0": { t: "seat", label: "A1" },
    });
    const b = { ...room(), key: "b", name: "main hall" };
    const c = { ...room(), key: "c", name: "  " };
    const problems = validateRooms([a, b, c]);
    expect(problems).toContain("Main Hall has a seat without a label.");
    expect(problems).toContain("Main Hall: more than one seat is labelled A1.");
    expect(problems).toContain("Room 3 needs a name.");
    expect(problems.some((p) => p.startsWith("2 rooms are called"))).toBe(true);
    expect(validateRooms([room()])).toEqual([]);
  });

  it("validates background files by type and size", () => {
    expect(
      validateBackgroundFile({ name: "a.png", type: "image/png", size: 1000 }),
    ).toBeNull();
    expect(
      validateBackgroundFile({
        name: "a.svg",
        type: "image/svg+xml",
        size: 10,
      }),
    ).toMatch(/PNG, JPEG, WebP or GIF/);
    expect(
      validateBackgroundFile({
        name: "big.jpg",
        type: "image/jpeg",
        size: 6 * 1024 * 1024,
      }),
    ).toMatch(/6\.0 MB.*5 MB/);
    expect(
      validateBackgroundFile({ name: "e.gif", type: "image/gif", size: 0 }),
    ).toMatch(/empty/);
  });

  it("lists reserved seats that a save would remove", () => {
    const before = [
      room({ "2,2": { t: "seat", label: "A1", seatId: 10, reservedBy: nia } }),
    ];
    expect(removedReservations(before, before)).toEqual([]);
    expect(removedReservations(before, [room()])).toEqual([
      { room: "Main Hall", label: "A1", who: "NoScope_Nia" },
    ]);
    // Deleting the whole room counts too.
    expect(removedReservations(before, [])).toHaveLength(1);
  });
});

describe("keyboard helpers", () => {
  it("moves focus within the grid", () => {
    const p = { col: 0, row: 0 };
    expect(moveFocus(p, "ArrowLeft", 8)).toEqual(p);
    expect(moveFocus(p, "ArrowRight", 8)).toEqual({ col: 1, row: 0 });
    expect(moveFocus({ col: 11, row: 7 }, "ArrowDown", 8)).toEqual({
      col: 11,
      row: 7,
    });
    expect(moveFocus({ col: 4, row: 3 }, "End", 8)).toEqual({
      col: 11,
      row: 3,
    });
    expect(moveFocus({ col: 4, row: 3 }, "End", 8, true)).toEqual({
      col: 11,
      row: 7,
    });
    expect(moveFocus({ col: 4, row: 3 }, "PageUp", 8)).toEqual({
      col: 4,
      row: 0,
    });
    expect(moveFocus(p, "a", 8)).toBeNull();
  });

  it("maps tool shortcuts", () => {
    expect(toolForShortcut("d")).toBe("seat");
    expect(toolForShortcut("g")).toBe("merge");
    expect(toolForShortcut("U")).toBe("split");
    expect(toolForShortcut("X")).toBe("erase");
    expect(toolForShortcut("q")).toBeUndefined();
  });

  it("names cells for screen readers", () => {
    const r = room({
      "2,2": { t: "seat", label: "A1", reservedBy: nia },
      "5,7": { t: "entrance", g: 0 },
      "3,1": { t: "screen", g: 1 },
      "4,1": { t: "screen", g: 1 },
    });
    expect(cellLabel(r, "0,0")).toBe("Empty square, column 1, row 1");
    expect(cellLabel(r, "2,2")).toBe(
      "Seat A1, reserved by NoScope_Nia, column 3, row 3",
    );
    expect(cellLabel(r, "5,7")).toBe("Entrance, column 6, row 8");
    expect(cellLabel(r, "4,1")).toBe("Screen, 2 squares, column 5, row 2");
    const linked = { ...r, links: { "1": "2,2" } };
    expect(cellLabel(linked, "3,1")).toBe(
      "Screen, 2 squares, linked to seat A1, column 4, row 2",
    );
    expect(cellLabel(linked, "2,2")).toBe(
      "Seat A1, with screen, reserved by NoScope_Nia, column 3, row 3",
    );
  });

  it("legacy x/y maps into the grid", () => {
    expect(legacyCell(0.99, 0.99, 8)).toEqual({ col: 11, row: 7 });
    expect(legacyCell(1.5, -1, 8)).toEqual({ col: 11, row: 0 });
    expect(legacyCell(NaN, 0.5, 8)).toEqual({ col: 6, row: 4 });
  });
});

describe("moving seats and features", () => {
  const base = () =>
    room(
      {
        "1,1": {
          t: "seat",
          label: "A1",
          seatId: 10,
          description: "Window seat",
          reservedBy: nia,
        },
        "2,1": { t: "seat", label: "A2", seatId: 11 },
        // A three-square screen on the top row, and an entrance.
        "4,0": { t: "screen", g: 1 },
        "5,0": { t: "screen", g: 1 },
        "6,0": { t: "screen", g: 1 },
        "0,5": { t: "entrance", g: 2 },
      },
      6,
    );

  it("groups a seat alone and a feature with its whole shape", () => {
    const r = base();
    expect(moveGroup(r, "1,1")).toEqual(["1,1"]);
    expect(moveGroup(r, "5,0")).toEqual(["4,0", "5,0", "6,0"]);
    expect(moveGroup(r, "0,5")).toEqual(["0,5"]);
    expect(moveGroup(r, "9,9")).toEqual([]);
  });

  it("moves a reserved seat with its id, identifier, description and reservation", () => {
    const r = base();
    const out = moveItem(r, "1,1", { col: 8, row: 3 });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.key).toBe("8,3");
    expect(out.room.cells["1,1"]).toBeUndefined();
    expect(out.room.cells["8,3"]).toEqual(r.cells["1,1"]);
    expect(out.announce).toBe(
      "Moved seat A1 to column 9, row 4. NoScope_Nia's reservation moves with it.",
    );
    // The save keeps the seat id, so the reservation stays attached.
    const seat = toSubmit([out.room], false).rooms[0].seats.find(
      (s) => s.id === 10,
    );
    expect(seat).toEqual({
      id: 10,
      label: "A1",
      description: "Window seat",
      gridCol: 8,
      gridRow: 3,
    });
    expect(removedReservations([r], [out.room])).toEqual([]);
  });

  it("swaps a seat dropped on another seat", () => {
    const r = base();
    expect(planMove(r, "1,1", { col: 2, row: 1 })).toEqual({
      type: "swap",
      from: ["1,1"],
      to: ["2,1"],
      other: "2,1",
    });
    const out = moveItem(r, "1,1", { col: 2, row: 1 });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect((out.room.cells["2,1"] as SeatCell).label).toBe("A1");
    expect((out.room.cells["1,1"] as SeatCell).label).toBe("A2");
    expect((out.room.cells["1,1"] as SeatCell).seatId).toBe(11);
    expect(out.announce).toMatch(/^Swapped seat A1 with seat A2\./);
  });

  it("won't drop a seat on a feature", () => {
    const r = base();
    const plan = planMove(r, "1,1", { col: 5, row: 0 });
    expect(plan.type).toBe("blocked");
    const out = moveItem(r, "1,1", { col: 5, row: 0 });
    expect(out).toEqual({
      ok: false,
      announce:
        "Can't move it there. The screen (3 squares) is in the way. Seats can only swap places with other seats.",
    });
  });

  it("moves a whole feature shape, clamped inside the grid", () => {
    const r = base();
    // Grabbing the middle square and dropping it on the right edge keeps
    // the strip whole: it ends at the last column.
    const plan = planMove(r, "5,0", { col: 11, row: 3 });
    expect(plan).toEqual({
      type: "move",
      from: ["4,0", "5,0", "6,0"],
      to: ["9,3", "10,3", "11,3"],
    });
    const out = moveItem(r, "5,0", { col: 11, row: 3 });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.key).toBe("10,3");
    for (const k of ["9,3", "10,3", "11,3"])
      expect(out.room.cells[k]).toEqual({ t: "screen", g: 1 });
    for (const k of ["4,0", "5,0", "6,0"])
      expect(out.room.cells[k]).toBeUndefined();
    expect(out.announce).toBe("Moved screen (3 squares) to column 10, row 4.");
    // Overlapping its own old squares is fine.
    expect(planMove(r, "4,0", { col: 5, row: 0 }).type).toBe("move");
    // Rows clamp too.
    expect(planMove(r, "0,5", { col: 0, row: 40 })).toEqual({ type: "none" });
  });

  it("rejects a feature landing on anything else", () => {
    const r = base();
    const plan = planMove(r, "4,0", { col: 1, row: 1 });
    expect(plan.type).toBe("blocked");
    expect(describePlan(r, plan)).toMatch(
      /^column 2, row 2, can't drop here\. The seat A1 at column 2, row 2 is in the way\./,
    );
    expect(moveItem(r, "4,0", { col: 1, row: 1 }).ok).toBe(false);
  });

  it("describes drops for the live region and ignores no-op moves", () => {
    const r = base();
    expect(describePlan(r, planMove(r, "1,1", { col: 3, row: 3 }))).toBe(
      "column 4, row 4, free.",
    );
    expect(describePlan(r, planMove(r, "1,1", { col: 2, row: 1 }))).toBe(
      "column 3, row 2, swaps with seat A2.",
    );
    expect(planMove(r, "1,1", { col: 1, row: 1 })).toEqual({ type: "none" });
    expect(moveItem(r, "1,1", { col: 1, row: 1 }).ok).toBe(false);
    expect(moveItem(r, "9,9", { col: 1, row: 1 }).ok).toBe(false);
  });

  it("names seats with their description", () => {
    expect(cellLabel(base(), "1,1")).toBe(
      "Seat A1, Window seat, reserved by NoScope_Nia, column 2, row 2",
    );
  });
});

const g = (r: EditorRoom, k: string) => (r.cells[k] as FeatureCell).g;
const ok = <T extends { ok: boolean }>(r: T) => {
  expect(r.ok).toBe(true);
  return r as Extract<T, { ok: true }>;
};

describe("feature shapes", () => {
  it("loads legacy rooms as horizontal runs, grouped rooms as saved", () => {
    const [legacy] = fromLayout({
      rooms: [
        apiRoom({
          features: [
            { col: 3, row: 0, kind: "screen" },
            { col: 4, row: 0, kind: "screen" },
            { col: 3, row: 1, kind: "screen" },
            { col: 7, row: 0, kind: "entrance" },
          ],
        }),
      ],
    });
    // The old look: one strip on row 0, a separate square below it.
    expect(g(legacy, "3,0")).toBe(g(legacy, "4,0"));
    expect(g(legacy, "3,1")).not.toBe(g(legacy, "3,0"));
    expect(g(legacy, "7,0")).not.toBe(g(legacy, "3,0"));

    const [grouped] = fromLayout({
      rooms: [
        apiRoom({
          features: [
            // Two touching screens that stay two screens...
            { col: 3, row: 0, kind: "screen", group: 0 },
            { col: 4, row: 0, kind: "screen", group: 1 },
            // ...and an L-shaped door.
            { col: 0, row: 6, kind: "entrance", group: 2 },
            { col: 0, row: 7, kind: "entrance", group: 2 },
            { col: 1, row: 7, kind: "entrance", group: 2 },
          ],
        }),
      ],
    });
    expect(g(grouped, "3,0")).not.toBe(g(grouped, "4,0"));
    expect(groupKeys(grouped, "1,7")).toEqual(["0,6", "0,7", "1,7"]);
  });

  it("places new squares as separate single squares", () => {
    let r = room();
    for (const k of ["2,0", "3,0"]) {
      const out = applyTool(r, "screen", k, null);
      if (out.type !== "update") throw new Error(out.type);
      r = out.room;
    }
    expect(g(r, "2,0")).not.toBe(g(r, "3,0"));
    expect(groupKeys(r, "2,0")).toEqual(["2,0"]);
    // Saved with explicit groups so they stay apart.
    expect(toSubmit([r], false).rooms[0].features).toEqual([
      { col: 2, row: 0, kind: "screen", group: 0 },
      { col: 3, row: 0, kind: "screen", group: 1 },
    ]);
  });

  it("merges side neighbours of the same kind into L and T shapes", () => {
    const r = room({
      "0,0": { t: "entrance", g: 0 },
      "0,1": { t: "entrance", g: 1 },
      "1,1": { t: "entrance", g: 2 },
      "2,1": { t: "screen", g: 3 },
      "1,0": { t: "entrance", g: 4 },
    });
    // Corner contact is not enough, and kinds don't mix.
    expect(mergeShapes(r, "0,0", "1,1")).toMatchObject({ ok: false });
    expect(mergeShapes(r, "1,1", "2,1").ok).toBe(false);
    const l = ok(mergeShapes(r, "0,0", "0,1"));
    const ll = ok(mergeShapes(l.room, "0,0", "1,1"));
    expect(groupKeys(ll.room, "0,0")).toEqual(["0,0", "0,1", "1,1"]);
    expect(ll.announce).toBe("Merged into one entrance (3 squares).");
    // Joining a square that touches a merged shape joins both groups.
    const all = ok(mergeShapes(ll.room, "1,0", "1,1"));
    expect(groupKeys(all.room, "1,0")).toHaveLength(4);
    expect(mergeShapes(all.room, "0,0", "1,0")).toMatchObject({ ok: false });
  });

  it("merges a drag path and everything adjacent", () => {
    const r = room({
      "0,0": { t: "screen", g: 0 },
      "1,0": { t: "screen", g: 1 },
      "2,0": { t: "screen", g: 2 },
      "2,1": { t: "screen", g: 3 },
      "5,5": { t: "screen", g: 4 },
    });
    // The path may list a square before the one that connects it.
    const path = ok(mergePath(r, ["0,0", "2,0", "1,0"]));
    expect(groupKeys(path.room, "0,0")).toEqual(["0,0", "1,0", "2,0"]);
    expect(mergePath(r, ["0,0"]).ok).toBe(false);
    expect(canMergeAdjacent(r, "0,0")).toBe(true);
    expect(canMergeAdjacent(r, "5,5")).toBe(false);
    const adj = ok(mergeAdjacent(r, "0,0"));
    expect(groupKeys(adj.room, "0,0")).toEqual(["0,0", "1,0", "2,0", "2,1"]);
    expect(g(adj.room, "5,5")).toBe(4);
    expect(mergeAdjacent(r, "5,5").ok).toBe(false);
  });

  it("splits a square off, and a cut shape falls apart into its parts", () => {
    // A T: three across, one hanging from the middle.
    const r = room({
      "0,0": { t: "screen", g: 1 },
      "1,0": { t: "screen", g: 1 },
      "2,0": { t: "screen", g: 1 },
      "1,1": { t: "screen", g: 1 },
    });
    const tip = ok(splitSquare(r, "1,1"));
    expect(groupKeys(tip.room, "0,0")).toEqual(["0,0", "1,0", "2,0"]);
    expect(groupKeys(tip.room, "1,1")).toEqual(["1,1"]);
    // Splitting the middle leaves three separate squares.
    const mid = ok(splitSquare(r, "1,0"));
    const ids = new Set(
      ["0,0", "1,0", "2,0", "1,1"].map((k) => g(mid.room, k)),
    );
    expect(ids.size).toBe(4);
    expect(mid.announce).toMatch(/The rest is now 3 separate screens\./);
    expect(splitSquare(tip.room, "1,1")).toMatchObject({ ok: false });
    const singles = ok(splitAll(r, "0,0"));
    expect(
      new Set(Object.keys(singles.room.cells).map((k) => g(singles.room, k)))
        .size,
    ).toBe(4);
  });

  it("erasing a square re-checks the shape", () => {
    const r = room({
      "0,0": { t: "entrance", g: 1 },
      "1,0": { t: "entrance", g: 1 },
      "2,0": { t: "entrance", g: 1 },
    });
    const out = applyTool(r, "erase", "1,0", null);
    if (out.type !== "update") throw new Error(out.type);
    expect(out.announce).toBe("Cleared entrance square at column 2, row 1.");
    expect(g(out.room, "0,0")).not.toBe(g(out.room, "2,0"));
    expect(groupKeys(out.room, "0,0")).toEqual(["0,0"]);
  });

  it("moves a whole L shape, clamped and blocked by occupied squares", () => {
    const r = room(
      {
        "0,0": { t: "entrance", g: 1 },
        "0,1": { t: "entrance", g: 1 },
        "1,1": { t: "entrance", g: 1 },
        "5,3": { t: "seat", label: "A1" },
      },
      6,
    );
    // Dropped past the bottom-right corner: clamped so the whole L fits.
    const out = moveItem(r, "0,0", { col: 11, row: 5 });
    const moved = ok(out);
    expect(groupKeys(moved.room, "10,4")).toEqual(["10,4", "10,5", "11,5"]);
    expect(moved.key).toBe("10,4");
    expect(moved.announce).toBe(
      "Moved entrance (3 squares) to column 11, row 5.",
    );
    const blocked = planMove(r, "0,0", { col: 4, row: 2 });
    expect(blocked.type).toBe("blocked");
  });

  it("works with the merge and split tools", () => {
    const r = room({
      "0,0": { t: "screen", g: 0 },
      "1,0": { t: "screen", g: 1 },
      "3,0": { t: "screen", g: 2 },
    });
    const first = applyTool(r, "merge", "0,0", null);
    expect(first).toMatchObject({ type: "select", sel: "0,0" });
    const joined = applyTool(r, "merge", "1,0", "0,0");
    if (joined.type !== "update") throw new Error(joined.type);
    expect(groupKeys(joined.room, "1,0")).toEqual(["0,0", "1,0"]);
    expect(joined.sel).toBe("0,0");
    // Not touching: says why and keeps the shape selected.
    const far = applyTool(joined.room, "merge", "3,0", "0,0");
    expect(far).toMatchObject({ type: "select", sel: "0,0" });
    const split = applyTool(joined.room, "split", "1,0", null);
    if (split.type !== "update") throw new Error(split.type);
    expect(groupKeys(split.room, "1,0")).toEqual(["1,0"]);
  });
});

describe("screen links", () => {
  const base = () =>
    room({
      "2,2": { t: "seat", label: "A1", seatId: 10, reservedBy: nia },
      "5,2": { t: "seat", label: "A2", seatId: 11 },
      // A two-square screen above A1's right corner (touches A1 diagonally
      // and by a side at 2,1), and a single screen beside A2.
      "2,1": { t: "screen", g: 1 },
      "3,1": { t: "screen", g: 1 },
      "6,2": { t: "screen", g: 2 },
      "9,9": { t: "screen", g: 3 },
    });

  it("offers the seats touching a screen by a side or a corner", () => {
    const r = base();
    expect(linkCandidates(r, "3,1")).toEqual(["2,2"]);
    expect(linkCandidates(r, "6,2")).toEqual(["5,2"]);
    expect(linkCandidates(r, "9,9")).toEqual([]);
    // Corner only.
    const corner = room({
      "0,0": { t: "seat", label: "A1" },
      "1,1": { t: "screen", g: 0 },
    });
    expect(linkCandidates(corner, "1,1")).toEqual(["0,0"]);
    expect(linkCandidates(corner, "0,0")).toEqual([]);
  });

  it("links, unlinks and saves links by position", () => {
    const r = base();
    const linked = ok(setScreenLink(r, "2,1", "2,2"));
    expect(linkedSeat(linked.room, "3,1")).toBe("2,2");
    expect(linked.announce).toMatch(/^Screen linked to seat A1\./);
    // A seat may have several screens (dual monitors).
    const both = ok(setScreenLink(linked.room, "6,2", "5,2"));
    expect(setScreenLink(both.room, "6,2", "2,2")).toMatchObject({ ok: false });
    expect(screensLinkedTo(both.room, "2,2")).toEqual([1]);
    const body = toSubmit([both.room], false).rooms[0].features;
    expect(body).toEqual([
      { col: 2, row: 1, kind: "screen", group: 0, linkCol: 2, linkRow: 2 },
      { col: 3, row: 1, kind: "screen", group: 0, linkCol: 2, linkRow: 2 },
      { col: 6, row: 2, kind: "screen", group: 1, linkCol: 5, linkRow: 2 },
      { col: 9, row: 9, kind: "screen", group: 2 },
    ]);
    // Round trip through the API shape.
    const [back] = fromLayout({
      rooms: [
        apiRoom({
          gridRows: 10,
          features: body,
          seats: [
            {
              id: 10,
              label: "A1",
              description: null,
              gridCol: 2,
              gridRow: 2,
              x: 0,
              y: 0,
              reservedBy: null,
            },
            {
              id: 11,
              label: "A2",
              description: null,
              gridCol: 5,
              gridRow: 2,
              x: 0,
              y: 0,
              reservedBy: null,
            },
          ],
        }),
      ],
    });
    expect(linkedSeat(back, "2,1")).toBe("2,2");
    expect(linkedSeat(back, "6,2")).toBe("5,2");
    expect(linkedSeat(back, "9,9")).toBeNull();
    const off = ok(setScreenLink(both.room, "3,1", null));
    expect(linkedSeat(off.room, "2,1")).toBeNull();
  });

  it("drops links on load whose seat is gone", () => {
    const [r] = fromLayout({
      rooms: [
        apiRoom({
          features: [
            {
              col: 0,
              row: 0,
              kind: "screen",
              group: 0,
              linkCol: 1,
              linkRow: 1,
            },
          ],
        }),
      ],
    });
    expect(linkedSeat(r, "0,0")).toBeNull();
  });

  it("follows the seat when it moves, and clears with a note when they part", () => {
    const r = ok(setScreenLink(base(), "6,2", "5,2")).room;
    // A2 moves down one: still touches the screen by a corner.
    const near = ok(moveItem(r, "5,2", { col: 5, row: 3 }));
    expect(linkedSeat(near.room, "6,2")).toBe("5,3");
    expect(near.notes).toEqual([]);
    // Far away: the link is cleared and the announcement says so.
    const far = ok(moveItem(r, "5,2", { col: 0, row: 6 }));
    expect(linkedSeat(far.room, "6,2")).toBeNull();
    expect(far.notes).toEqual([
      "The screen at column 7, row 3 no longer touches seat A2, so its link was cleared.",
    ]);
    expect(far.announce).toMatch(/no longer touches seat A2/);
    // Moving the screen away clears it too.
    const moved = ok(moveItem(r, "6,2", { col: 9, row: 5 }));
    expect(linkedSeat(moved.room, "9,5")).toBeNull();
    expect(moved.notes).toHaveLength(1);
  });

  it("keeps links through swaps and renames", () => {
    const r = ok(setScreenLink(base(), "6,2", "5,2")).room;
    const renamed = renameSeat(r, "5,2", "B9");
    expect(linkedSeat(renamed, "6,2")).toBe("5,2");
    expect(cellLabel(renamed, "6,2")).toBe(
      "Screen, linked to seat B9, column 7, row 3",
    );
  });

  it("clears the link when the seat is erased or replaced", () => {
    const r = ok(setScreenLink(base(), "6,2", "5,2")).room;
    const erased = applyTool(r, "erase", "5,2", null);
    if (erased.type !== "update") throw new Error(erased.type);
    expect(linkedSeat(erased.room, "6,2")).toBeNull();
    expect(erased.notes).toEqual([
      "Seat A2 is gone, so the screen at column 7, row 3 is no longer linked to it.",
    ]);
    const replaced = applyTool(r, "entrance", "5,2", null);
    if (replaced.type !== "update") throw new Error(replaced.type);
    expect(linkedSeat(replaced.room, "6,2")).toBeNull();
  });

  it("keeps the link on the parts of a split that still touch the seat", () => {
    const r = room({
      "1,1": { t: "seat", label: "A1" },
      "0,0": { t: "screen", g: 1 },
      "1,0": { t: "screen", g: 1 },
      "2,0": { t: "screen", g: 1 },
      "3,0": { t: "screen", g: 1 },
      "4,0": { t: "screen", g: 1 },
    });
    const linked = ok(setScreenLink(r, "0,0", "1,1")).room;
    // Cutting at 3,0: the left part keeps the link, 4,0 alone never touched A1.
    const out = ok(splitSquare(linked, "3,0"));
    expect(linkedSeat(out.room, "0,0")).toBe("1,1");
    expect(linkedSeat(out.room, "3,0")).toBeNull();
    expect(linkedSeat(out.room, "4,0")).toBeNull();
    const singles = ok(splitAll(linked, "0,0"));
    expect(
      ["0,0", "1,0", "2,0"].map((k) => linkedSeat(singles.room, k)),
    ).toEqual(["1,1", "1,1", "1,1"]);
    expect(singles.announce).toMatch(/3 of them stay linked to seat A1/);
  });

  it("keeps the first screen's link when two linked screens merge", () => {
    const r = room({
      "0,1": { t: "seat", label: "A1" },
      "3,1": { t: "seat", label: "A2" },
      "1,0": { t: "screen", g: 1 },
      "2,0": { t: "screen", g: 2 },
    });
    const a = ok(setScreenLink(r, "1,0", "0,1")).room;
    const b = ok(setScreenLink(a, "2,0", "3,1")).room;
    const merged = ok(mergeShapes(b, "1,0", "2,0"));
    expect(linkedSeat(merged.room, "2,0")).toBe("0,1");
    expect(merged.announce).toMatch(/the link to seat A2 was dropped/);
  });

  it("normalises without notes when nothing was linked before", () => {
    const r = room({
      "0,0": { t: "screen", g: 1 },
      "2,0": { t: "screen", g: 1 },
    });
    const out = normalizeRoom(r);
    expect(g(out.room, "0,0")).not.toBe(g(out.room, "2,0"));
    expect(out.notes).toEqual([]);
  });
});
