import { describe, it, expect } from "vitest";
import {
  applyTool,
  cellKey,
  cellLabel,
  describeDesk,
  describePlan,
  duplicateLabels,
  fromLayout,
  isDuplicateLabel,
  isValidIdentifier,
  legacyCell,
  MAX_DESCRIPTION_LENGTH,
  minRows,
  moveFocus,
  moveGroup,
  moveItem,
  newRoom,
  nextDeskLabel,
  planMove,
  removedReservations,
  renameDesk,
  sanitizeLabel,
  setRows,
  snapshot,
  toSubmit,
  toolForShortcut,
  validateBackgroundFile,
  validateRooms,
  type ApiLayoutRoom,
  type Cell,
  type DeskCell,
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

describe("nextDeskLabel", () => {
  it("starts an empty room at A1", () => {
    expect(nextDeskLabel(room(), 2)).toBe("A1");
  });

  it("continues the row's letter with the lowest free number", () => {
    const r = room({
      "2,2": { t: "desk", label: "A1" },
      "4,2": { t: "desk", label: "A3" },
    });
    expect(nextDeskLabel(r, 2)).toBe("A2");
  });

  it("gives a new row the next letter nobody uses (skipping I and O)", () => {
    const r = room({
      "2,2": { t: "desk", label: "A1" },
      "2,5": { t: "desk", label: "B1" },
    });
    expect(nextDeskLabel(r, 7)).toBe("C1");
    const lots: Record<string, Cell> = {};
    "ABCDEFGH".split("").forEach((l, i) => {
      lots[cellKey(0, i)] = { t: "desk", label: `${l}1` };
    });
    expect(nextDeskLabel(room(lots, 12), 10)).toBe("J1");
  });

  it("ignores numeric-only labels when picking the row letter", () => {
    const r = room({ "0,1": { t: "desk", label: "12" } });
    expect(nextDeskLabel(r, 1)).toBe("A1");
  });

  it("never returns a label longer than 8 characters", () => {
    const r = room({ "0,0": { t: "desk", label: "ABCDEFGH" } });
    const label = nextDeskLabel(r, 0);
    expect(label.length).toBeLessThanOrEqual(8);
    expect(label).toBe("A1");
  });

  it("treats identifiers case-insensitively when numbering", () => {
    const r = room({ "0,0": { t: "desk", label: "a1" } });
    expect(nextDeskLabel(r, 0)).toBe("A2");
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
    expect(isValidIdentifier("Desk-12")).toBe(true);
    expect(isValidIdentifier("ABCDEFGH")).toBe(true);
    expect(isValidIdentifier("ABCDEFGHI")).toBe(false);
    expect(isValidIdentifier("Window seat 12")).toBe(false);
    expect(isValidIdentifier("")).toBe(false);
  });

  it("flags duplicates regardless of case", () => {
    const r = room({
      "0,0": { t: "desk", label: "a1" },
      "1,0": { t: "desk", label: "A1" },
    });
    expect(isDuplicateLabel(r, "0,0")).toBe(true);
    expect(duplicateLabels(r)).toEqual(new Set(["a1", "A1"]));
  });

  it("sets descriptions on desks only, capped at 120 characters", () => {
    const r = room({
      "0,0": { t: "desk", label: "A1" },
      "1,0": { t: "screen" },
    });
    const d = describeDesk(r, "0,0", "Window desk next to the fridge");
    expect(d.cells["0,0"]).toEqual({
      t: "desk",
      label: "A1",
      description: "Window desk next to the fridge",
    });
    expect(
      (describeDesk(r, "0,0", "x".repeat(200)).cells["0,0"] as DeskCell)
        .description,
    ).toHaveLength(MAX_DESCRIPTION_LENGTH);
    // Counted in code points like the API, never cutting a surrogate pair.
    const emoji = (
      describeDesk(r, "0,0", "🎮".repeat(150)).cells["0,0"] as DeskCell
    ).description as string;
    expect(Array.from(emoji)).toHaveLength(MAX_DESCRIPTION_LENGTH);
    expect(emoji.endsWith("🎮")).toBe(true);
    expect(describeDesk(r, "1,0", "nope")).toBe(r);
    // Trimmed, and blank becomes null, in the PUT body.
    const padded = describeDesk(r, "0,0", "  By the door  ");
    expect(toSubmit([padded], false).rooms[0].seats[0].description).toBe(
      "By the door",
    );
    expect(
      toSubmit([describeDesk(r, "0,0", "   ")], false).rooms[0].seats[0]
        .description,
    ).toBeNull();
  });

  it("detects duplicates within a room", () => {
    const r = room({
      "0,0": { t: "desk", label: "A1" },
      "1,0": { t: "desk", label: "A1" },
      "2,0": { t: "desk", label: "A2" },
    });
    expect([...duplicateLabels(r)]).toEqual(["A1"]);
    expect(isDuplicateLabel(r, "0,0")).toBe(true);
    expect(isDuplicateLabel(r, "2,0")).toBe(false);
  });

  it("renames only desks, sanitising the value", () => {
    const r = room({
      "0,0": { t: "desk", label: "A1" },
      "1,0": { t: "screen" },
    });
    expect(renameDesk(r, "0,0", "b12 x9 long").cells["0,0"]).toEqual({
      t: "desk",
      label: "b12x9lon",
    });
    expect(renameDesk(r, "1,0", "Z")).toBe(r);
  });
});

describe("applyTool", () => {
  const base = room({
    "2,2": { t: "desk", label: "A1", seatId: 10, reservedBy: nia },
    "4,2": { t: "desk", label: "A2", seatId: 11 },
    "5,0": { t: "screen" },
  });

  it("select picks desks and clears on anything else", () => {
    expect(applyTool(base, "select", "4,2", null)).toEqual({
      type: "select",
      sel: "4,2",
    });
    expect(applyTool(base, "select", "5,0", "4,2")).toEqual({
      type: "select",
      sel: null,
    });
  });

  it("desk drops an auto-labelled desk and selects it", () => {
    const out = applyTool(base, "desk", "7,2", null);
    expect(out.type).toBe("update");
    if (out.type !== "update") return;
    expect(out.room.cells["7,2"]).toEqual({ t: "desk", label: "A3" });
    expect(out.sel).toBe("7,2");
    expect(out.announce).toMatch(/A3.*column 8, row 3/);
    // Original is untouched.
    expect(base.cells["7,2"]).toBeUndefined();
  });

  it("desk on an existing desk selects it", () => {
    expect(applyTool(base, "desk", "4,2", null)).toEqual({
      type: "select",
      sel: "4,2",
    });
  });

  it("screen toggles and replaces free desks, never reserved ones", () => {
    const off = applyTool(base, "screen", "5,0", null);
    expect(off.type === "update" && off.room.cells["5,0"]).toBeUndefined();
    const over = applyTool(base, "screen", "4,2", "4,2");
    expect(over.type === "update" && over.room.cells["4,2"]).toEqual({
      t: "screen",
    });
    expect(over.type === "update" && over.sel).toBeNull();
    const reserved = applyTool(base, "entrance", "2,2", null);
    expect(reserved.type).toBe("select");
    expect(reserved.type === "select" && reserved.announce).toMatch(/reserved/);
  });

  it("erase clears cells but asks before removing a reserved desk", () => {
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
      ([, c]) => c.t === "desk" && c.label === "L1",
    );
    expect(legacy?.[0]).not.toBe("2,2");
    expect(r.cells["3,0"]).toEqual({ t: "screen" });
    expect(r.cells["5,4"]).toEqual({ t: "entrance" });
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
      "4,2": { t: "desk", label: "A2" },
      "2,2": { t: "desk", label: "A1", seatId: 10, reservedBy: nia },
      "3,0": { t: "screen" },
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
      features: [{ col: 3, row: 0, kind: "screen" }],
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

  it("snapshots ignore keys and cell order", () => {
    const a = room({ "0,0": { t: "screen" }, "1,0": { t: "screen" } });
    const b = {
      ...room({ "1,0": { t: "screen" }, "0,0": { t: "screen" } }),
      key: "x",
    };
    expect(snapshot([a])).toBe(snapshot([b]));
  });
});

describe("rows", () => {
  it("can't shrink below the last occupied row", () => {
    const r = room({ "0,4": { t: "entrance" } });
    expect(minRows(r)).toBe(5);
    expect(setRows(r, 2).rows).toBe(5);
    expect(setRows(r, 99).rows).toBe(50);
    expect(minRows(room())).toBe(1);
  });
});

describe("validation", () => {
  it("reports blank names, blank labels, duplicates and repeated room names", () => {
    const a = room({
      "0,0": { t: "desk", label: "" },
      "1,0": { t: "desk", label: "A1" },
      "2,0": { t: "desk", label: "A1" },
    });
    const b = { ...room(), key: "b", name: "main hall" };
    const c = { ...room(), key: "c", name: "  " };
    const problems = validateRooms([a, b, c]);
    expect(problems).toContain("Main Hall has a desk without a label.");
    expect(problems).toContain("Main Hall: more than one desk is labelled A1.");
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

  it("lists reserved desks that a save would remove", () => {
    const before = [
      room({ "2,2": { t: "desk", label: "A1", seatId: 10, reservedBy: nia } }),
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
    expect(toolForShortcut("d")).toBe("desk");
    expect(toolForShortcut("X")).toBe("erase");
    expect(toolForShortcut("q")).toBeUndefined();
  });

  it("names cells for screen readers", () => {
    expect(cellLabel(undefined, "0,0")).toBe("Empty square, column 1, row 1");
    expect(cellLabel({ t: "desk", label: "A1", reservedBy: nia }, "2,2")).toBe(
      "Desk A1, reserved by NoScope_Nia, column 3, row 3",
    );
    expect(cellLabel({ t: "entrance" }, "5,7")).toBe(
      "Entrance, column 6, row 8",
    );
  });

  it("legacy x/y maps into the grid", () => {
    expect(legacyCell(0.99, 0.99, 8)).toEqual({ col: 11, row: 7 });
    expect(legacyCell(1.5, -1, 8)).toEqual({ col: 11, row: 0 });
    expect(legacyCell(NaN, 0.5, 8)).toEqual({ col: 6, row: 4 });
  });
});

describe("moving desks and features", () => {
  const base = () =>
    room(
      {
        "1,1": {
          t: "desk",
          label: "A1",
          seatId: 10,
          description: "Window desk",
          reservedBy: nia,
        },
        "2,1": { t: "desk", label: "A2", seatId: 11 },
        // A three-square screen strip on the top row, and an entrance.
        "4,0": { t: "screen" },
        "5,0": { t: "screen" },
        "6,0": { t: "screen" },
        "0,5": { t: "entrance" },
      },
      6,
    );

  it("groups a desk alone and a feature with its whole strip", () => {
    const r = base();
    expect(moveGroup(r, "1,1")).toEqual(["1,1"]);
    expect(moveGroup(r, "5,0")).toEqual(["4,0", "5,0", "6,0"]);
    expect(moveGroup(r, "0,5")).toEqual(["0,5"]);
    expect(moveGroup(r, "9,9")).toEqual([]);
  });

  it("moves a reserved desk with its id, identifier, description and reservation", () => {
    const r = base();
    const out = moveItem(r, "1,1", { col: 8, row: 3 });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.key).toBe("8,3");
    expect(out.room.cells["1,1"]).toBeUndefined();
    expect(out.room.cells["8,3"]).toEqual(r.cells["1,1"]);
    expect(out.announce).toBe(
      "Moved desk A1 to column 9, row 4. NoScope_Nia's reservation moves with it.",
    );
    // The save keeps the seat id, so the reservation stays attached.
    const seat = toSubmit([out.room], false).rooms[0].seats.find(
      (s) => s.id === 10,
    );
    expect(seat).toEqual({
      id: 10,
      label: "A1",
      description: "Window desk",
      gridCol: 8,
      gridRow: 3,
    });
    expect(removedReservations([r], [out.room])).toEqual([]);
  });

  it("swaps a desk dropped on another desk", () => {
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
    expect((out.room.cells["2,1"] as DeskCell).label).toBe("A1");
    expect((out.room.cells["1,1"] as DeskCell).label).toBe("A2");
    expect((out.room.cells["1,1"] as DeskCell).seatId).toBe(11);
    expect(out.announce).toMatch(/^Swapped desk A1 with desk A2\./);
  });

  it("won't drop a desk on a feature", () => {
    const r = base();
    const plan = planMove(r, "1,1", { col: 5, row: 0 });
    expect(plan.type).toBe("blocked");
    const out = moveItem(r, "1,1", { col: 5, row: 0 });
    expect(out).toEqual({
      ok: false,
      announce:
        "Can't move it there. The screen is in the way. Desks can only swap places with other desks.",
    });
  });

  it("moves a whole feature strip, clamped inside the grid", () => {
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
      expect(out.room.cells[k]).toEqual({ t: "screen" });
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
      /^column 2, row 2, can't drop here\. The desk A1 at column 2, row 2 is in the way\./,
    );
    expect(moveItem(r, "4,0", { col: 1, row: 1 }).ok).toBe(false);
  });

  it("describes drops for the live region and ignores no-op moves", () => {
    const r = base();
    expect(describePlan(r, planMove(r, "1,1", { col: 3, row: 3 }))).toBe(
      "column 4, row 4, free.",
    );
    expect(describePlan(r, planMove(r, "1,1", { col: 2, row: 1 }))).toBe(
      "column 3, row 2, swaps with desk A2.",
    );
    expect(planMove(r, "1,1", { col: 1, row: 1 })).toEqual({ type: "none" });
    expect(moveItem(r, "1,1", { col: 1, row: 1 }).ok).toBe(false);
    expect(moveItem(r, "9,9", { col: 1, row: 1 }).ok).toBe(false);
  });

  it("names desks with their description", () => {
    expect(cellLabel(base().cells["1,1"], "1,1")).toBe(
      "Desk A1, Window desk, reserved by NoScope_Nia, column 2, row 2",
    );
  });
});
