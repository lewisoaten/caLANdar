/**
 * Pure model for the room editor: API shapes, the grid model, desk labelling,
 * tool behaviour, validation and the save payload. Kept free of React so the
 * rules can be unit tested (see src/__tests__/roomEditorLayout.test.ts).
 */

// ---------------------------------------------------------------------------
// API shapes (`GET/PUT /events/:id/room-layout`)
// ---------------------------------------------------------------------------

export type FeatureKind = "screen" | "entrance";
export type BackgroundStyle = "retro" | "original";

export interface ApiFeature {
  col: number;
  row: number;
  kind: FeatureKind;
}

export interface ApiReservedBy {
  email: string;
  handle: string | null;
  avatarUrl: string;
}

export interface ApiLayoutSeat {
  id: number;
  label: string;
  description: string | null;
  gridCol: number | null;
  gridRow: number | null;
  x: number;
  y: number;
  reservedBy: ApiReservedBy | null;
}

export interface ApiRoom {
  id: number;
  eventId: number;
  name: string;
  description: string | null;
  image: string | null;
  sortOrder: number;
  gridRows: number | null;
  features: ApiFeature[];
  backgroundUrl: string | null;
  backgroundStyle: string;
  backgroundOpacity: number;
}

export interface ApiLayoutRoom extends ApiRoom {
  seats: ApiLayoutSeat[];
}

export interface ApiLayout {
  rooms: ApiLayoutRoom[];
}

export interface LayoutSeatSubmit {
  id?: number;
  label: string;
  description: string | null;
  gridCol: number;
  gridRow: number;
}

export interface LayoutRoomSubmit {
  id?: number;
  name: string;
  description: string | null;
  sortOrder: number;
  gridRows: number;
  features: ApiFeature[];
  backgroundStyle: BackgroundStyle;
  backgroundOpacity: number;
  seats: LayoutSeatSubmit[];
}

export interface LayoutSubmit {
  releaseReserved: boolean;
  rooms: LayoutRoomSubmit[];
}

// ---------------------------------------------------------------------------
// Editor model
// ---------------------------------------------------------------------------

export const GRID_COLS = 12;
/** Rows for rooms saved without a grid (legacy rooms). */
export const DEFAULT_ROWS = 8;
/** Rows for a room added in the editor. */
export const NEW_ROOM_ROWS = 6;
export const MAX_ROWS = 50;
/** Seat identifier: the short code drawn on the desk tile. */
export const MAX_LABEL_LENGTH = 8;
/** Optional free-text seat description, e.g. "Window desk next to the fridge". */
export const MAX_DESCRIPTION_LENGTH = 120;
export const DEFAULT_OPACITY = 60;
export const MIN_OPACITY = 10;
export const MAX_OPACITY = 100;

export type Tool = "select" | "move" | "desk" | "screen" | "entrance" | "erase";

export interface DeskCell {
  t: "desk";
  label: string;
  /** Saved seat id; absent for desks added since the last save. */
  seatId?: number;
  description?: string | null;
  reservedBy?: ApiReservedBy | null;
}

export interface FeatureCell {
  t: FeatureKind;
}

export type Cell = DeskCell | FeatureCell;

export interface EditorRoom {
  /** Stable client-side key (survives the first save of a new room). */
  key: string;
  /** Saved room id; absent until the room is saved. */
  id?: number;
  name: string;
  description: string;
  rows: number;
  /** Cells keyed `"col,row"`. */
  cells: Record<string, Cell>;
  backgroundUrl: string | null;
  /** Floorplan uploaded with the old editor (base64 data URL), if any. */
  legacyImage: string | null;
  backgroundStyle: BackgroundStyle;
  /** Percent, 10-100. */
  backgroundOpacity: number;
}

export const cellKey = (col: number, row: number) => `${col},${row}`;

export const parseKey = (key: string): { col: number; row: number } => {
  const [col, row] = key.split(",").map(Number);
  return { col, row };
};

export const isDesk = (cell: Cell | undefined): cell is DeskCell =>
  !!cell && cell.t === "desk";

export const isReserved = (cell: Cell | undefined): boolean =>
  isDesk(cell) && !!cell.reservedBy;

/** Name to show for whoever reserved a desk. */
export const reserverName = (r: ApiReservedBy | null | undefined) =>
  r ? r.handle?.trim() || r.email : "";

const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, n));

/** Grid cell for a desk placed with the legacy (x/y) editor. */
export function legacyCell(x: number, y: number, rows: number) {
  const safe = (v: number) => (Number.isFinite(v) ? v : 0.5);
  return {
    col: clamp(Math.floor(safe(x) * GRID_COLS), 0, GRID_COLS - 1),
    row: clamp(Math.floor(safe(y) * rows), 0, rows - 1),
  };
}

/** Nearest free cell to (col,row) by grid distance, or null if the grid is full. */
export function nearestFreeCell(
  cells: Record<string, Cell>,
  col: number,
  row: number,
  rows: number,
) {
  let best: { col: number; row: number; d: number } | null = null;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < GRID_COLS; c++) {
      if (cells[cellKey(c, r)]) continue;
      const d = Math.abs(c - col) + Math.abs(r - row);
      if (!best || d < best.d) best = { col: c, row: r, d };
    }
  return best && { col: best.col, row: best.row };
}

const toStyle = (s: string | null | undefined): BackgroundStyle =>
  s === "original" ? "original" : "retro";

const toPercent = (opacity: number | null | undefined) =>
  opacity == null || !Number.isFinite(opacity)
    ? DEFAULT_OPACITY
    : clamp(Math.round(opacity * 100), MIN_OPACITY, MAX_OPACITY);

/** Build the editor model from the API layout. */
export function fromLayout(layout: ApiLayout, keys: string[] = []) {
  return layout.rooms.map((room, index): EditorRoom => {
    let rows = clamp(room.gridRows ?? DEFAULT_ROWS, 1, MAX_ROWS);
    // Rows must fit everything that is already placed.
    for (const s of room.seats)
      if (s.gridRow != null) rows = Math.max(rows, s.gridRow + 1);
    for (const f of room.features) rows = Math.max(rows, f.row + 1);
    rows = Math.min(rows, MAX_ROWS);

    const cells: Record<string, Cell> = {};
    // Desks first (they matter more than features if anything collides),
    // grid-placed desks before legacy ones so they keep their exact cells.
    const seats = [...room.seats].sort(
      (a, b) => Number(a.gridCol == null) - Number(b.gridCol == null),
    );
    for (const seat of seats) {
      let pos =
        seat.gridCol != null && seat.gridRow != null
          ? {
              col: clamp(seat.gridCol, 0, GRID_COLS - 1),
              row: clamp(seat.gridRow, 0, rows - 1),
            }
          : legacyCell(seat.x, seat.y, rows);
      if (cells[cellKey(pos.col, pos.row)]) {
        let free = nearestFreeCell(cells, pos.col, pos.row, rows);
        while (!free && rows < MAX_ROWS) {
          rows += 1;
          free = nearestFreeCell(cells, pos.col, pos.row, rows);
        }
        if (!free) continue;
        pos = free;
      }
      cells[cellKey(pos.col, pos.row)] = {
        t: "desk",
        label: seat.label,
        seatId: seat.id,
        description: seat.description,
        reservedBy: seat.reservedBy,
      };
    }
    for (const f of room.features) {
      if (f.kind !== "screen" && f.kind !== "entrance") continue;
      if (f.col < 0 || f.col >= GRID_COLS || f.row < 0 || f.row >= rows)
        continue;
      const k = cellKey(f.col, f.row);
      if (!cells[k]) cells[k] = { t: f.kind };
    }
    return {
      key: keys[index] ?? `room-${room.id}`,
      id: room.id,
      name: room.name,
      description: room.description ?? "",
      rows,
      cells,
      backgroundUrl: room.backgroundUrl,
      legacyImage: room.image && !room.backgroundUrl ? room.image : null,
      backgroundStyle: toStyle(room.backgroundStyle),
      backgroundOpacity: toPercent(room.backgroundOpacity),
    };
  });
}

const byPosition = (a: [string, Cell], b: [string, Cell]) => {
  const pa = parseKey(a[0]);
  const pb = parseKey(b[0]);
  return pa.row - pb.row || pa.col - pb.col;
};

/** The `PUT /room-layout` body for the editor state. */
export function toSubmit(
  rooms: EditorRoom[],
  releaseReserved: boolean,
): LayoutSubmit {
  return {
    releaseReserved,
    rooms: rooms.map((room, index) => {
      const entries = Object.entries(room.cells).sort(byPosition);
      const seats: LayoutSeatSubmit[] = [];
      const features: ApiFeature[] = [];
      for (const [k, cell] of entries) {
        const { col, row } = parseKey(k);
        if (cell.t === "desk")
          seats.push({
            ...(cell.seatId != null ? { id: cell.seatId } : {}),
            label: cell.label,
            description: cell.description?.trim() || null,
            gridCol: col,
            gridRow: row,
          });
        else features.push({ col, row, kind: cell.t });
      }
      return {
        ...(room.id != null ? { id: room.id } : {}),
        name: room.name.trim(),
        description: room.description.trim() || null,
        sortOrder: index,
        gridRows: room.rows,
        features,
        backgroundStyle: room.backgroundStyle,
        backgroundOpacity: room.backgroundOpacity / 100,
        seats,
      };
    }),
  };
}

/** Serialised editor state, for dirty checks. */
export const snapshot = (rooms: EditorRoom[]) =>
  JSON.stringify(
    rooms.map(({ key: _key, ...room }) => ({
      ...room,
      cells: Object.entries(room.cells).sort(byPosition),
    })),
  );

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

/** Row letters for new rows (I and O are skipped: they read as 1 and 0). */
export const ROW_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ".split("");

/** Characters a seat identifier may use. */
const IDENTIFIER_CHARS = /[^A-Za-z0-9._-]/g;

/** Keep A-Z, a-z, 0-9, `-`, `_` and `.` only, max 8 characters. */
export const sanitizeLabel = (value: string) =>
  value.replace(IDENTIFIER_CHARS, "").slice(0, MAX_LABEL_LENGTH);

/**
 * Whether `label` is a valid identifier today. Labels saved before the limits
 * (e.g. "Window seat 12") stay as they are until someone edits them.
 */
export const isValidIdentifier = (label: string) =>
  label.length > 0 &&
  label.length <= MAX_LABEL_LENGTH &&
  !/[^A-Za-z0-9._-]/.test(label);

/** Identifiers are unique per room regardless of case ("a1" clashes with "A1"). */
const labelId = (label: string) => label.toLowerCase();

const labelPrefix = (label: string) => label.replace(/\d+$/, "");

/**
 * Label for a desk dropped on `row`: the row's existing letter prefix (or the
 * next letter no desk in the room uses yet) plus the lowest free number.
 */
export function nextDeskLabel(room: EditorRoom, row: number): string {
  const desks = Object.entries(room.cells).filter(
    (e): e is [string, DeskCell] => e[1].t === "desk",
  );
  const used = new Set(desks.map(([, c]) => labelId(c.label)));
  const withNumber = (prefix: string) => {
    let n = 1;
    while (used.has(labelId(prefix + n))) n++;
    const label = prefix + n;
    return label.length <= MAX_LABEL_LENGTH ? label : null;
  };

  const sameRow = desks
    .filter(([k]) => parseKey(k).row === row)
    .sort(byPosition)
    .map(([, c]) => labelPrefix(c.label))
    .find((p) => /^[A-Z]+$/.test(p));
  if (sameRow) {
    const label = withNumber(sameRow);
    if (label) return label;
  }

  const prefixes = new Set(desks.map(([, c]) => labelPrefix(c.label)));
  const letter = ROW_LETTERS.find((l) => !prefixes.has(l));
  if (letter) return withNumber(letter) ?? letter;
  // Every letter is taken: fall back to the first letter with a free number.
  for (const l of ROW_LETTERS) {
    const label = withNumber(l);
    if (label) return label;
  }
  // Pathological (every short label in use is impossible on a 600-cell grid).
  return "Z";
}

/** Labels used by more than one desk in the room (ignoring case). */
export function duplicateLabels(room: EditorRoom): Set<string> {
  const count = new Map<string, number>();
  const desks = Object.values(room.cells).filter(
    (c): c is DeskCell => c.t === "desk",
  );
  for (const d of desks)
    count.set(labelId(d.label), (count.get(labelId(d.label)) ?? 0) + 1);
  const dup = new Set<string>();
  for (const d of desks)
    if ((count.get(labelId(d.label)) ?? 0) > 1) dup.add(d.label);
  return dup;
}

export function isDuplicateLabel(room: EditorRoom, key: string) {
  const cell = room.cells[key];
  if (!isDesk(cell) || !cell.label) return false;
  return Object.entries(room.cells).some(
    ([k, c]) =>
      k !== key && c.t === "desk" && labelId(c.label) === labelId(cell.label),
  );
}

// ---------------------------------------------------------------------------
// Room edits (all return new objects)
// ---------------------------------------------------------------------------

const withCells = (
  room: EditorRoom,
  edit: (cells: Record<string, Cell>) => void,
): EditorRoom => {
  const cells = { ...room.cells };
  edit(cells);
  return { ...room, cells };
};

export const removeCell = (room: EditorRoom, key: string) =>
  withCells(room, (cells) => {
    delete cells[key];
  });

export const renameDesk = (room: EditorRoom, key: string, value: string) => {
  const cell = room.cells[key];
  if (!isDesk(cell)) return room;
  return withCells(room, (cells) => {
    cells[key] = { ...cell, label: sanitizeLabel(value) };
  });
};

/** Set a desk's description (kept as typed, capped; trimmed on save). */
export const describeDesk = (room: EditorRoom, key: string, value: string) => {
  const cell = room.cells[key];
  if (!isDesk(cell)) return room;
  return withCells(room, (cells) => {
    cells[key] = {
      ...cell,
      description: value.slice(0, MAX_DESCRIPTION_LENGTH),
    };
  });
};

/** Smallest row count that still fits everything placed in the room. */
export function minRows(room: EditorRoom) {
  let max = 0;
  for (const k of Object.keys(room.cells))
    max = Math.max(max, parseKey(k).row + 1);
  return Math.max(1, max);
}

export const setRows = (room: EditorRoom, rows: number): EditorRoom => ({
  ...room,
  rows: clamp(Math.round(rows), minRows(room), MAX_ROWS),
});

export function deskStats(room: EditorRoom) {
  let desks = 0;
  let reserved = 0;
  for (const cell of Object.values(room.cells))
    if (cell.t === "desk") {
      desks++;
      if (cell.reservedBy) reserved++;
    }
  return { desks, reserved };
}

export const hasReservations = (room: EditorRoom) =>
  deskStats(room).reserved > 0;

export function newRoom(rooms: EditorRoom[], key: string): EditorRoom {
  const names = new Set(rooms.map((r) => r.name.trim().toLowerCase()));
  let n = rooms.length + 1;
  while (names.has(`new room ${n}`)) n++;
  return {
    key,
    name: `New room ${n}`,
    description: "",
    rows: NEW_ROOM_ROWS,
    cells: {},
    backgroundUrl: null,
    legacyImage: null,
    backgroundStyle: "retro",
    backgroundOpacity: DEFAULT_OPACITY,
  };
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export const TOOL_LABELS: Record<Tool, string> = {
  select: "Select",
  move: "Move",
  desk: "Desk",
  screen: "Screen",
  entrance: "Entrance",
  erase: "Erase",
};

export const TOOL_HINTS: Record<Tool, string> = {
  select:
    "Tap a desk to rename or remove it. Drag desks, screens and entrances to move them (on touch, press and hold first).",
  move: "Tap a desk, screen or entrance, then tap where it goes, or drag it. A desk dropped on another desk swaps places; screens and entrances need empty squares.",
  desk: "Tap empty squares to drop desks. Labels fill in automatically.",
  screen: "Tap squares to mark a screen, projector or feature wall.",
  entrance: "Tap squares to mark the way in.",
  erase: "Tap anything to clear it. Reserved desks ask first.",
};

/** Keyboard shortcuts for the tools (while the toolbar or grid has focus). */
export const TOOL_SHORTCUTS: Record<Tool, string> = {
  select: "V",
  move: "M",
  desk: "D",
  screen: "S",
  entrance: "E",
  erase: "X",
};

export const TOOLS: Tool[] = [
  "select",
  "move",
  "desk",
  "screen",
  "entrance",
  "erase",
];

export const toolForShortcut = (key: string): Tool | undefined =>
  TOOLS.find((t) => TOOL_SHORTCUTS[t] === key.toUpperCase());

const FEATURE_NAMES: Record<FeatureKind, string> = {
  screen: "Screen",
  entrance: "Entrance",
};

const where = (key: string) => {
  const { col, row } = parseKey(key);
  return `column ${col + 1}, row ${row + 1}`;
};

/** Accessible name of a grid cell. */
export function cellLabel(cell: Cell | undefined, key: string) {
  if (!cell) return `Empty square, ${where(key)}`;
  if (cell.t === "desk") {
    const who = cell.reservedBy
      ? `, reserved by ${reserverName(cell.reservedBy)}`
      : "";
    const about = cell.description?.trim()
      ? `, ${cell.description.trim()}`
      : "";
    return `Desk ${cell.label || "(no label)"}${about}${who}, ${where(key)}`;
  }
  return `${FEATURE_NAMES[cell.t]}, ${where(key)}`;
}

export type ToolOutcome =
  /** Change the selection only. */
  | { type: "select"; sel: string | null; announce?: string }
  /** The room changed. */
  | { type: "update"; room: EditorRoom; sel: string | null; announce: string }
  /** Removing a reserved desk: ask first. */
  | { type: "confirm"; key: string }
  | { type: "noop" };

/**
 * What using `tool` on the cell `key` does (mirrors the prototype):
 * - Select: select a desk (or clear the selection).
 * - Desk: drop an auto-labelled desk (replacing a feature); on a desk, select it.
 * - Screen / Entrance: toggle that feature (replacing a free desk); reserved
 *   desks are never overwritten, they are selected instead.
 * - Erase: clear the cell; reserved desks ask for confirmation.
 */
export function applyTool(
  room: EditorRoom,
  tool: Exclude<Tool, "move">,
  key: string,
  sel: string | null,
): ToolOutcome {
  const cell = room.cells[key];
  const place = where(key);

  if (tool === "select")
    return isDesk(cell)
      ? { type: "select", sel: key }
      : { type: "select", sel: null };

  if (tool === "erase") {
    if (!cell) return { type: "noop" };
    if (isReserved(cell)) return { type: "confirm", key };
    return {
      type: "update",
      room: removeCell(room, key),
      sel: sel === key ? null : sel,
      announce:
        cell.t === "desk"
          ? `Removed desk ${cell.label}`
          : `Cleared ${FEATURE_NAMES[cell.t].toLowerCase()} at ${place}`,
    };
  }

  if (tool === "desk") {
    if (isDesk(cell)) return { type: "select", sel: key };
    const label = nextDeskLabel(room, parseKey(key).row);
    return {
      type: "update",
      room: withCells(room, (cells) => {
        cells[key] = { t: "desk", label };
      }),
      sel: key,
      announce: `Added desk ${label} at ${place}`,
    };
  }

  // screen / entrance
  if (isDesk(cell) && cell.reservedBy)
    return {
      type: "select",
      sel: key,
      announce: `Desk ${cell.label} is reserved. Remove it first to place a ${FEATURE_NAMES[tool].toLowerCase()} here.`,
    };
  if (cell && cell.t === tool)
    return {
      type: "update",
      room: removeCell(room, key),
      sel,
      announce: `Cleared ${FEATURE_NAMES[tool].toLowerCase()} at ${place}`,
    };
  return {
    type: "update",
    room: withCells(room, (cells) => {
      cells[key] = { t: tool };
    }),
    sel: sel === key ? null : sel,
    announce: `${FEATURE_NAMES[tool]} placed at ${place}${isDesk(cell) ? `, replacing desk ${cell.label}` : ""}`,
  };
}

/**
 * Where focus goes for a grid navigation key, or null if the key is not a
 * navigation key. Arrows move one cell; Home/End go to the row's ends;
 * Ctrl+Home/End to the grid's corners; PageUp/PageDown to the column's ends.
 */
export function moveFocus(
  pos: { col: number; row: number },
  key: string,
  rows: number,
  ctrl = false,
): { col: number; row: number } | null {
  const last = { col: GRID_COLS - 1, row: rows - 1 };
  switch (key) {
    case "ArrowLeft":
      return { ...pos, col: Math.max(0, pos.col - 1) };
    case "ArrowRight":
      return { ...pos, col: Math.min(last.col, pos.col + 1) };
    case "ArrowUp":
      return { ...pos, row: Math.max(0, pos.row - 1) };
    case "ArrowDown":
      return { ...pos, row: Math.min(last.row, pos.row + 1) };
    case "Home":
      return ctrl ? { col: 0, row: 0 } : { ...pos, col: 0 };
    case "End":
      return ctrl ? last : { ...pos, col: last.col };
    case "PageUp":
      return { ...pos, row: 0 };
    case "PageDown":
      return { ...pos, row: last.row };
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Moving desks and features
// ---------------------------------------------------------------------------

/**
 * Cells that move together with `key`: a desk on its own, or the whole
 * horizontal strip of same-kind feature cells it belongs to (the seat map
 * draws such a run as one screen / entrance). Empty for an empty cell.
 */
export function moveGroup(room: EditorRoom, key: string): string[] {
  const cell = room.cells[key];
  if (!cell) return [];
  if (cell.t === "desk") return [key];
  const { col, row } = parseKey(key);
  const same = (c: number) => room.cells[cellKey(c, row)]?.t === cell.t;
  let start = col;
  while (start > 0 && same(start - 1)) start--;
  let end = col;
  while (end < GRID_COLS - 1 && same(end + 1)) end++;
  const out: string[] = [];
  for (let c = start; c <= end; c++) out.push(cellKey(c, row));
  return out;
}

export type MovePlan =
  /** Nothing to move, or it would land where it already is. */
  | { type: "none" }
  | { type: "move"; from: string[]; to: string[] }
  /** Desk dropped on another desk: they trade places. */
  | { type: "swap"; from: string[]; to: string[]; other: string }
  | { type: "blocked"; from: string[]; to: string[]; reason: string };

/** "desk A1", "screen", "entrance". */
export const itemName = (cell: Cell) =>
  cell.t === "desk"
    ? `desk ${cell.label || "(no label)"}`
    : FEATURE_NAMES[cell.t].toLowerCase();

/**
 * What dropping the item at `fromKey` on `target` would do. The grabbed cell
 * lands on `target`; a feature strip keeps its shape and is clamped so it
 * stays inside the grid. Desks swap with desks; anything else in the way
 * blocks the move.
 */
export function planMove(
  room: EditorRoom,
  fromKey: string,
  target: { col: number; row: number },
): MovePlan {
  const group = moveGroup(room, fromKey);
  const cell = room.cells[fromKey];
  if (!cell || !group.length) return { type: "none" };
  const origin = parseKey(fromKey);
  const cols = group.map((k) => parseKey(k).col);
  const dc = clamp(
    target.col - origin.col,
    -Math.min(...cols),
    GRID_COLS - 1 - Math.max(...cols),
  );
  const dr = clamp(
    target.row - origin.row,
    -origin.row,
    room.rows - 1 - origin.row,
  );
  if (dc === 0 && dr === 0) return { type: "none" };
  const to = group.map((k) => {
    const p = parseKey(k);
    return cellKey(p.col + dc, p.row + dr);
  });

  if (cell.t === "desk") {
    const other = room.cells[to[0]];
    if (!other) return { type: "move", from: group, to };
    if (other.t === "desk")
      return { type: "swap", from: group, to, other: to[0] };
    return {
      type: "blocked",
      from: group,
      to,
      reason: `The ${itemName(other)} is in the way. Desks can only swap places with other desks.`,
    };
  }

  const inGroup = new Set(group);
  const clash = to.find((k) => !inGroup.has(k) && room.cells[k]);
  if (clash)
    return {
      type: "blocked",
      from: group,
      to,
      reason: `The ${itemName(room.cells[clash])} at ${where(clash)} is in the way. Screens and entrances need empty squares.`,
    };
  return { type: "move", from: group, to };
}

/** Short spoken description of a planned drop, for the live region. */
export function describePlan(room: EditorRoom, plan: MovePlan): string {
  if (plan.type === "none") return "Back where it started.";
  const at = where(plan.to[0]);
  if (plan.type === "move") return `${at}, free.`;
  if (plan.type === "swap")
    return `${at}, swaps with ${itemName(room.cells[plan.other])}.`;
  return `${at}, can't drop here. ${plan.reason}`;
}

export type MoveResult =
  | { ok: true; room: EditorRoom; key: string; announce: string }
  | { ok: false; announce: string };

/**
 * Move the item at `fromKey` to `target` (see `planMove`). Desks keep their
 * seat id, identifier, description and reservation: the reservation follows
 * the desk. `key` is where the grabbed cell ended up.
 */
export function moveItem(
  room: EditorRoom,
  fromKey: string,
  target: { col: number; row: number },
): MoveResult {
  const cell = room.cells[fromKey];
  const plan = planMove(room, fromKey, target);
  if (!cell || plan.type === "none")
    return { ok: false, announce: cell ? "Not moved." : "Nothing to move." };
  if (plan.type === "blocked")
    return { ok: false, announce: `Can't move it there. ${plan.reason}` };

  const moving = plan.from.map((k) => room.cells[k]);
  const next = withCells(room, (cells) => {
    const other = plan.type === "swap" ? cells[plan.other] : undefined;
    for (const k of plan.from) delete cells[k];
    plan.to.forEach((k, i) => {
      cells[k] = moving[i];
    });
    if (other) cells[plan.from[0]] = other;
  });
  const key = plan.to[plan.from.indexOf(fromKey)];
  const at = where(plan.to[0]);
  const follows =
    isDesk(cell) && cell.reservedBy
      ? ` ${reserverName(cell.reservedBy)}'s reservation moves with it.`
      : "";
  let announce: string;
  if (plan.type === "swap") {
    const other = room.cells[plan.other] as DeskCell;
    announce = `Swapped ${itemName(cell)} with ${itemName(other)}. ${(cell as DeskCell).label} is now at ${at}.${follows}`;
  } else if (isDesk(cell))
    announce = `Moved ${itemName(cell)} to ${at}.${follows}`;
  else
    announce = `Moved ${itemName(cell)}${plan.from.length > 1 ? ` (${plan.from.length} squares)` : ""} to ${at}.`;
  return { ok: true, room: next, key, announce };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Problems that block saving, as sentences. */
export function validateRooms(rooms: EditorRoom[]): string[] {
  const problems: string[] = [];
  const names = new Map<string, number>();
  rooms.forEach((room, i) => {
    const name = room.name.trim();
    const label = name || `Room ${i + 1}`;
    if (!name) problems.push(`${label} needs a name.`);
    else
      names.set(name.toLowerCase(), (names.get(name.toLowerCase()) ?? 0) + 1);
    const desks = Object.values(room.cells).filter(
      (c): c is DeskCell => c.t === "desk",
    );
    const blank = desks.filter((d) => !d.label).length;
    if (blank)
      problems.push(
        `${label} has ${blank === 1 ? "a desk" : `${blank} desks`} without a label.`,
      );
    const reported = new Set<string>();
    for (const dup of duplicateLabels(room)) {
      if (reported.has(labelId(dup))) continue;
      reported.add(labelId(dup));
      problems.push(`${label}: more than one desk is labelled ${dup}.`);
    }
  });
  for (const [name, count] of names)
    if (count > 1) {
      const room = rooms.find((r) => r.name.trim().toLowerCase() === name);
      problems.push(
        `${count} rooms are called “${room?.name.trim()}”. Give each room its own name.`,
      );
    }
  return problems;
}

export interface RemovedReservation {
  room: string;
  label: string;
  who: string;
}

/** Reserved desks in `before` whose seat is gone from `after`. */
export function removedReservations(
  before: EditorRoom[],
  after: EditorRoom[],
): RemovedReservation[] {
  const kept = new Set<number>();
  for (const room of after)
    for (const cell of Object.values(room.cells))
      if (cell.t === "desk" && cell.seatId != null) kept.add(cell.seatId);
  const out: RemovedReservation[] = [];
  for (const room of before)
    for (const cell of Object.values(room.cells))
      if (
        cell.t === "desk" &&
        cell.reservedBy &&
        cell.seatId != null &&
        !kept.has(cell.seatId)
      )
        out.push({
          room: room.name,
          label: cell.label,
          who: reserverName(cell.reservedBy),
        });
  return out;
}

// ---------------------------------------------------------------------------
// Background images
// ---------------------------------------------------------------------------

export const BACKGROUND_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;
export const MAX_BACKGROUND_BYTES = 5 * 1024 * 1024;

const formatMb = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

/** Why a background file can't be uploaded, or null if it is fine. */
export function validateBackgroundFile(file: {
  name: string;
  type: string;
  size: number;
}): string | null {
  if (!(BACKGROUND_TYPES as readonly string[]).includes(file.type))
    return `“${file.name}” isn't a supported image. Use a PNG, JPEG, WebP or GIF (SVG isn't supported).`;
  if (file.size === 0) return `“${file.name}” is empty.`;
  if (file.size > MAX_BACKGROUND_BYTES)
    return `“${file.name}” is ${formatMb(file.size)}. Background plans must be 5 MB or smaller.`;
  return null;
}
