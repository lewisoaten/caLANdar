import { describe, it, expect } from "vitest";
import {
  cellLabel,
  cleanSeatName,
  convertAllLegacySeats,
  convertLegacySeat,
  duplicateLabels,
  fromLayout,
  identifierBase,
  isLegacyLabel,
  legacySeatKeys,
  MAX_NAME_LENGTH,
  nameSeat,
  toSubmit,
  uniqueIdentifier,
  validateRooms,
  type Cell,
  type EditorRoom,
  type SeatCell,
} from "../components/RoomEditor/layout";

const room = (cells: Record<string, Cell> = {}, rows = 8): EditorRoom => ({
  key: "r1",
  id: 1,
  name: "Lounge",
  description: "",
  rows,
  cells,
  links: {},
  backgroundUrl: null,
  legacyImage: null,
  backgroundStyle: "retro",
  backgroundOpacity: 60,
});

const seat = (label: string, over: Partial<SeatCell> = {}): SeatCell => ({
  t: "seat",
  label,
  ...over,
});

const seatAt = (r: EditorRoom, key: string) => r.cells[key] as SeatCell;

describe("legacy labels", () => {
  it("flags labels that are not valid identifiers, but not blank ones", () => {
    expect(isLegacyLabel("WALL SOFA (S)")).toBe(true);
    expect(isLegacyLabel("WINDOW SEAT 12")).toBe(true);
    expect(isLegacyLabel("ABCDEFGHI")).toBe(true);
    expect(isLegacyLabel("Sofa!")).toBe(true);
    expect(isLegacyLabel("A1")).toBe(false);
    expect(isLegacyLabel("Dk-1.b_")).toBe(false);
    expect(isLegacyLabel("")).toBe(false);
  });

  it("lists legacy seats in reading order", () => {
    const r = room({
      "5,1": seat("WINDOW SEAT 12"),
      "0,0": seat("A1"),
      "3,0": seat("WALL SOFA (S)"),
    });
    expect(legacySeatKeys(r)).toEqual(["3,0", "5,1"]);
  });

  it("cleans a label into a name", () => {
    expect(cleanSeatName("  WALL   SOFA\t(S) ")).toBe("WALL SOFA (S)");
    expect(cleanSeatName("x".repeat(80))).toHaveLength(MAX_NAME_LENGTH);
    // Clipped by code point: never half an emoji.
    const emoji = cleanSeatName("🎮".repeat(70));
    expect(Array.from(emoji)).toHaveLength(MAX_NAME_LENGTH);
    expect(emoji).toBe("🎮".repeat(MAX_NAME_LENGTH));
  });
});

describe("identifier codes", () => {
  it("takes the initials of words, keeping numbers whole", () => {
    expect(identifierBase("WALL SOFA (S)")).toBe("WS");
    expect(identifierBase("WINDOW SEAT 12")).toBe("WS12");
    expect(identifierBase("bean bag corner")).toBe("BBC");
    expect(identifierBase("Desk-12/b")).toBe("D12B");
  });

  it("uses the first two letters of a single word", () => {
    expect(identifierBase("Sofa")).toBe("SO");
    expect(identifierBase("(Sofa)")).toBe("SO");
    expect(identifierBase("X")).toBe("X");
  });

  it("only uses bracketed text when there is nothing else", () => {
    expect(identifierBase("(S)")).toBe("S");
    expect(identifierBase("[Back] Row 3")).toBe("R3");
  });

  it("folds accents and drops other scripts, emoji and punctuation", () => {
    expect(identifierBase("Fenêtre Été")).toBe("FE");
    expect(identifierBase("Ölsofa 2")).toBe("O2");
    expect(identifierBase("🎮🎮🎮")).toBe("");
    expect(identifierBase("!!! --- ???")).toBe("");
    expect(identifierBase("窓側の席")).toBe("");
  });

  it("caps very long labels at 8 characters", () => {
    const long =
      "The very long sofa next to the kitchen window by the big plant pot";
    expect(identifierBase(long)).toBe("TVLSNTTK");
    expect(identifierBase("SEAT 1234567890")).toBe("S1234567");
  });

  it("makes codes unique ignoring case by appending 2, 3, ...", () => {
    expect(uniqueIdentifier("WS", new Set())).toBe("WS");
    expect(uniqueIdentifier("WS", new Set(["ws"]))).toBe("WS2");
    expect(uniqueIdentifier("WS", new Set(["ws", "ws2"]))).toBe("WS3");
    // Shortened to fit the suffix in 8 characters.
    expect(uniqueIdentifier("TVLSNTTK", new Set(["tvlsnttk"]))).toBe(
      "TVLSNTT2",
    );
    expect(uniqueIdentifier("", new Set())).toBeNull();
  });
});

describe("converting legacy labels to names", () => {
  it("'Use as name' moves the label to the name and generates an identifier", () => {
    const r = room({ "2,1": seat("WALL SOFA (S)", { seatId: 7 }) });
    const out = convertLegacySeat(r, "2,1");
    expect(out.count).toBe(1);
    expect(seatAt(out.room, "2,1")).toEqual({
      t: "seat",
      seatId: 7,
      label: "WS",
      name: "WALL SOFA (S)",
    });
    expect(out.announce).toBe(
      "“WALL SOFA (S)” is now the name; the identifier is WS.",
    );
    // The original room is untouched.
    expect(seatAt(r, "2,1").label).toBe("WALL SOFA (S)");
  });

  it("keeps a name the seat already has", () => {
    const r = room({
      "0,0": seat("WALL SOFA (S)", { name: "Sofa by the wall" }),
    });
    const out = convertLegacySeat(r, "0,0");
    expect(seatAt(out.room, "0,0")).toMatchObject({
      label: "WS",
      name: "Sofa by the wall",
    });
  });

  it("does nothing for a valid identifier", () => {
    const r = room({ "0,0": seat("A1") });
    const out = convertLegacySeat(r, "0,0");
    expect(out.count).toBe(0);
    expect(out.room).toBe(r);
  });

  it("converts all legacy seats, avoiding every other identifier", () => {
    const r = room({
      "0,0": seat("WS"),
      "1,0": seat("WALL SOFA (S)"),
      "2,0": seat("WALL SOFA (N)"),
      "3,0": seat("ws3"),
      "4,0": seat("WINDOW SEAT 12"),
      "5,0": seat("A1", { name: "Kept" }),
    });
    const out = convertAllLegacySeats(r);
    expect(out.count).toBe(3);
    expect(out.announce).toBe(
      "Converted 3 seat labels to names with short identifiers.",
    );
    const labels = Object.values(out.room.cells).map((c) =>
      c.t === "seat" ? c.label : "",
    );
    expect(labels).toEqual(["WS", "WS2", "WS4", "ws3", "WS12", "A1"]);
    expect(seatAt(out.room, "1,0").name).toBe("WALL SOFA (S)");
    expect(seatAt(out.room, "2,0").name).toBe("WALL SOFA (N)");
    expect(seatAt(out.room, "5,0")).toEqual(seat("A1", { name: "Kept" }));
    expect(duplicateLabels(out.room).size).toBe(0);
    expect(legacySeatKeys(out.room)).toEqual([]);
  });

  it("falls back to the auto-labeller when a label has no usable characters", () => {
    const r = room({
      "0,0": seat("A1"),
      "1,0": seat("🎮 🎮"),
      "2,0": seat("窓側の席"),
    });
    const out = convertAllLegacySeats(r);
    expect(seatAt(out.room, "1,0")).toMatchObject({
      label: "A2",
      name: "🎮 🎮",
    });
    expect(seatAt(out.room, "2,0")).toMatchObject({
      label: "A3",
      name: "窓側の席",
    });
  });

  it("clips very long labels to a 60 character name", () => {
    const long = `${"Long ".repeat(20)}sofa`;
    const out = convertLegacySeat(room({ "0,0": seat(long) }), "0,0");
    const name = seatAt(out.room, "0,0").name ?? "";
    expect(Array.from(name).length).toBeLessThanOrEqual(MAX_NAME_LENGTH);
    expect(name.startsWith("Long Long")).toBe(true);
    expect(name.endsWith(" ")).toBe(false);
  });

  it("is a no-op for a room without legacy labels", () => {
    const r = room({ "0,0": seat("A1") });
    expect(convertAllLegacySeats(r)).toEqual({
      room: r,
      count: 0,
      announce: "Nothing to convert.",
    });
  });
});

describe("seat names in the editor model", () => {
  it("caps names by code point and replaces control characters", () => {
    const r = room({ "0,0": seat("A1") });
    expect(seatAt(nameSeat(r, "0,0", "Wall\nsofa\t(S)"), "0,0").name).toBe(
      "Wall sofa (S)",
    );
    const long = seatAt(nameSeat(r, "0,0", "é".repeat(70)), "0,0").name ?? "";
    expect(Array.from(long)).toHaveLength(MAX_NAME_LENGTH);
    // Not a seat: unchanged.
    expect(nameSeat(r, "5,5", "x")).toBe(r);
  });

  it("loads names and sends them trimmed (blank as null) on save", () => {
    const [loaded] = fromLayout({
      rooms: [
        {
          id: 1,
          eventId: 9,
          name: "Lounge",
          description: null,
          image: null,
          sortOrder: 0,
          gridRows: 4,
          features: [],
          backgroundUrl: null,
          backgroundStyle: "retro",
          backgroundOpacity: 0.6,
          seats: [
            {
              id: 1,
              label: "WS",
              name: "Wall sofa (S)",
              description: null,
              gridCol: 0,
              gridRow: 0,
              x: 0,
              y: 0,
              reservedBy: null,
            },
            {
              // An older API without `name`.
              id: 2,
              label: "A2",
              description: null,
              gridCol: 1,
              gridRow: 0,
              x: 0,
              y: 0,
              reservedBy: null,
            },
          ],
        },
      ],
    });
    expect(seatAt(loaded, "0,0").name).toBe("Wall sofa (S)");
    expect(seatAt(loaded, "1,0").name).toBeNull();
    const edited = nameSeat(loaded, "1,0", "   ");
    const seats = toSubmit([nameSeat(edited, "0,0", "  Wall sofa (S) ")], false)
      .rooms[0].seats;
    expect(seats).toEqual([
      {
        id: 1,
        label: "WS",
        name: "Wall sofa (S)",
        description: null,
        gridCol: 0,
        gridRow: 0,
      },
      {
        id: 2,
        label: "A2",
        name: null,
        description: null,
        gridCol: 1,
        gridRow: 0,
      },
    ]);
  });

  it("sends an unconverted legacy label back unchanged", () => {
    const r = room({ "0,0": seat("WALL SOFA (S)", { seatId: 3 }) });
    expect(toSubmit([r], false).rooms[0].seats[0]).toMatchObject({
      id: 3,
      label: "WALL SOFA (S)",
      name: null,
    });
    // Legacy labels don't block saving.
    expect(validateRooms([r])).toEqual([]);
  });

  it("reads the name in the cell's accessible name", () => {
    const r = room({
      "0,0": seat("WS", { name: "Wall sofa (S)", description: "By the TV" }),
    });
    expect(cellLabel(r, "0,0")).toBe(
      "Seat WS, Wall sofa (S), By the TV, column 1, row 1",
    );
  });
});
