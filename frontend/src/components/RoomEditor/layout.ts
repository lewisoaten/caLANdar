/**
 * Pure model for the room editor: API shapes, the grid model, seat labelling,
 * screen / entrance shapes and links, tool behaviour, validation and the save
 * payload. Kept free of React so the rules can be unit tested (see
 * src/__tests__/roomEditorLayout.test.ts).
 */
import {
  connectedParts,
  deriveFeatureGroups,
  touchesAny,
  type GridCell,
} from "../seatFloorPlanModel";

// ---------------------------------------------------------------------------
// API shapes (`GET/PUT /events/:id/room-layout`)
// ---------------------------------------------------------------------------

export type FeatureKind = "screen" | "entrance";
export type BackgroundStyle = "retro" | "original";

export interface ApiFeature {
  col: number;
  row: number;
  kind: FeatureKind;
  /** Squares with the same group are one shape (absent on legacy rooms). */
  group?: number;
  /** Screens only: the cell of the seat this screen belongs to. */
  linkCol?: number;
  linkRow?: number;
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
/** Seat identifier: the short code drawn on the seat tile. */
export const MAX_LABEL_LENGTH = 8;
/** Length in Unicode code points, as the API counts (`chars()`), not UTF-16 units. */
export const codePointLength = (text: string) => Array.from(text).length;

/** At most `max` code points of `text`, never cutting a surrogate pair. */
export const clipCodePoints = (text: string, max: number) =>
  Array.from(text).slice(0, max).join("");

/** Optional free-text seat description, e.g. "Window seat next to the fridge". */
export const MAX_DESCRIPTION_LENGTH = 120;
export const DEFAULT_OPACITY = 60;
export const MIN_OPACITY = 10;
export const MAX_OPACITY = 100;

export type Tool =
  | "select"
  | "move"
  | "seat"
  | "screen"
  | "entrance"
  | "merge"
  | "split"
  | "erase";

export interface SeatCell {
  t: "seat";
  label: string;
  /** Saved seat id; absent for seats added since the last save. */
  seatId?: number;
  description?: string | null;
  reservedBy?: ApiReservedBy | null;
}

/** One square of a screen or entrance; squares with the same `g` are one shape. */
export interface FeatureCell {
  t: FeatureKind;
  g: number;
}

export type Cell = SeatCell | FeatureCell;

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
  /**
   * Screen links: screen group id -> the cell key of its seat. A screen links
   * to at most one seat; a seat may have several screens.
   */
  links: Record<string, string>;
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

export const isSeat = (cell: Cell | undefined): cell is SeatCell =>
  !!cell && cell.t === "seat";

export const isFeature = (cell: Cell | undefined): cell is FeatureCell =>
  !!cell && cell.t !== "seat";

export const isReserved = (cell: Cell | undefined): boolean =>
  isSeat(cell) && !!cell.reservedBy;

/** Name to show for whoever reserved a seat. */
export const reserverName = (r: ApiReservedBy | null | undefined) =>
  r ? r.handle?.trim() || r.email : "";

const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, n));

/** Grid cell for a seat placed with the legacy (x/y) editor. */
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
    // Seats first (they matter more than features if anything collides),
    // grid-placed seats before legacy ones so they keep their exact cells.
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
        t: "seat",
        label: seat.label,
        seatId: seat.id,
        description: seat.description,
        reservedBy: seat.reservedBy,
      };
    }
    // Legacy rooms (no `group`) get one shape per horizontal run, as the
    // seat map has always drawn them.
    const links: Record<string, string> = {};
    for (const g of deriveFeatureGroups(room.features, rows)) {
      for (const c of g.cells) {
        const k = cellKey(c.col, c.row);
        if (!cells[k]) cells[k] = { t: g.kind, g: g.id };
      }
      if (g.kind === "screen" && g.link)
        links[String(g.id)] = cellKey(g.link.col, g.link.row);
    }
    const loaded: EditorRoom = {
      key: keys[index] ?? `room-${room.id}`,
      id: room.id,
      name: room.name,
      description: room.description ?? "",
      rows,
      cells,
      links,
      backgroundUrl: room.backgroundUrl,
      legacyImage: room.image && !room.backgroundUrl ? room.image : null,
      backgroundStyle: toStyle(room.backgroundStyle),
      backgroundOpacity: toPercent(room.backgroundOpacity),
    };
    // Squares a seat displaced may have split a shape; stale links go.
    return normalizeRoom(loaded).room;
  });
}

const byPosition = (a: [string, Cell], b: [string, Cell]) => {
  const pa = parseKey(a[0]);
  const pb = parseKey(b[0]);
  return pa.row - pb.row || pa.col - pb.col;
};

const byKeyPosition = (a: string, b: string) => {
  const pa = parseKey(a);
  const pb = parseKey(b);
  return pa.row - pb.row || pa.col - pb.col;
};

/**
 * The `PUT /room-layout` body for the editor state. Every feature square is
 * sent with an explicit group (numbered 0.. in reading order), so squares
 * that merely touch stay separate shapes.
 */
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
      const ids = new Map<number, number>();
      for (const [k, cell] of entries) {
        const { col, row } = parseKey(k);
        if (cell.t === "seat") {
          seats.push({
            ...(cell.seatId != null ? { id: cell.seatId } : {}),
            label: cell.label,
            description: cell.description?.trim() || null,
            gridCol: col,
            gridRow: row,
          });
          continue;
        }
        if (!ids.has(cell.g)) ids.set(cell.g, ids.size);
        const link = room.links[String(cell.g)];
        const at = link && cell.t === "screen" ? parseKey(link) : null;
        features.push({
          col,
          row,
          kind: cell.t,
          group: ids.get(cell.g)!,
          ...(at ? { linkCol: at.col, linkRow: at.row } : {}),
        });
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

/**
 * Serialised editor state, for dirty checks. Shapes are compared by which
 * squares belong together, not by their (internal) group numbers.
 */
export const snapshot = (rooms: EditorRoom[]) =>
  JSON.stringify(
    rooms.map(({ key: _key, cells, links, ...room }) => {
      const ids = new Map<number, number>();
      const ordered = Object.entries(cells)
        .sort(byPosition)
        .map(([k, c]): [string, Cell] => {
          if (c.t === "seat") return [k, c];
          if (!ids.has(c.g)) ids.set(c.g, ids.size);
          return [k, { t: c.t, g: ids.get(c.g)! }];
        });
      const linked = Object.entries(links)
        .filter(([g]) => ids.has(Number(g)))
        .map(([g, seat]) => [ids.get(Number(g))!, seat] as const)
        .sort((a, b) => a[0] - b[0]);
      return { ...room, cells: ordered, links: linked };
    }),
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

const seatEntries = (room: EditorRoom) =>
  Object.entries(room.cells).filter(
    (e): e is [string, SeatCell] => e[1].t === "seat",
  );

/**
 * Label for a seat dropped on `row`: the row's existing letter prefix (or the
 * next letter no seat in the room uses yet) plus the lowest free number.
 */
export function nextSeatLabel(room: EditorRoom, row: number): string {
  const seats = seatEntries(room);
  const used = new Set(seats.map(([, c]) => labelId(c.label)));
  const withNumber = (prefix: string) => {
    let n = 1;
    while (used.has(labelId(prefix + n))) n++;
    const label = prefix + n;
    return label.length <= MAX_LABEL_LENGTH ? label : null;
  };

  const sameRow = seats
    .filter(([k]) => parseKey(k).row === row)
    .sort(byPosition)
    .map(([, c]) => labelPrefix(c.label))
    .find((p) => /^[A-Z]+$/.test(p));
  if (sameRow) {
    const label = withNumber(sameRow);
    if (label) return label;
  }

  const prefixes = new Set(seats.map(([, c]) => labelPrefix(c.label)));
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

/** Labels used by more than one seat in the room (ignoring case). */
export function duplicateLabels(room: EditorRoom): Set<string> {
  const count = new Map<string, number>();
  const seats = seatEntries(room).map(([, c]) => c);
  for (const d of seats)
    count.set(labelId(d.label), (count.get(labelId(d.label)) ?? 0) + 1);
  const dup = new Set<string>();
  for (const d of seats)
    if ((count.get(labelId(d.label)) ?? 0) > 1) dup.add(d.label);
  return dup;
}

export function isDuplicateLabel(room: EditorRoom, key: string) {
  const cell = room.cells[key];
  if (!isSeat(cell) || !cell.label) return false;
  return Object.entries(room.cells).some(
    ([k, c]) =>
      k !== key && c.t === "seat" && labelId(c.label) === labelId(cell.label),
  );
}

// ---------------------------------------------------------------------------
// Screen and entrance shapes
// ---------------------------------------------------------------------------

const FEATURE_NAMES: Record<FeatureKind, string> = {
  screen: "Screen",
  entrance: "Entrance",
};

const where = (key: string) => {
  const { col, row } = parseKey(key);
  return `column ${col + 1}, row ${row + 1}`;
};

const toCell = (key: string): GridCell => parseKey(key);

/** Keys of every square in the shape `key` belongs to (reading order). */
export function groupKeys(room: EditorRoom, key: string): string[] {
  const cell = room.cells[key];
  if (!isFeature(cell)) return [];
  return Object.entries(room.cells)
    .filter(([, c]) => isFeature(c) && c.g === cell.g && c.t === cell.t)
    .map(([k]) => k)
    .sort(byKeyPosition);
}

/** Next unused group id in the room. */
export function nextGroupId(room: EditorRoom): number {
  let max = -1;
  for (const c of Object.values(room.cells))
    if (isFeature(c)) max = Math.max(max, c.g);
  return max + 1;
}

/** Seat label at `key`, for messages ("A1", or "the seat" if unknown). */
const seatName = (room: EditorRoom, key: string) => {
  const c = room.cells[key];
  return isSeat(c) ? `seat ${c.label || "(no label)"}` : "the seat";
};

/** The seat `key`'s screen shape is linked to, or null. */
export function linkedSeat(room: EditorRoom, key: string): string | null {
  const cell = room.cells[key];
  if (!isFeature(cell) || cell.t !== "screen") return null;
  return room.links[String(cell.g)] ?? null;
}

/** Group ids of the screens linked to the seat at `seatKey`. */
export function screensLinkedTo(room: EditorRoom, seatKey: string): number[] {
  return Object.entries(room.links)
    .filter(([, s]) => s === seatKey)
    .map(([g]) => Number(g))
    .sort((a, b) => a - b);
}

/** First square of each screen linked to the seat at `seatKey`. */
export function screenKeysLinkedTo(room: EditorRoom, seatKey: string) {
  const groups = new Set(screensLinkedTo(room, seatKey));
  const first = new Map<number, string>();
  for (const [k, c] of Object.entries(room.cells).sort(byPosition))
    if (isFeature(c) && c.t === "screen" && groups.has(c.g) && !first.has(c.g))
      first.set(c.g, k);
  return [...first.values()];
}

/** Seats (cell keys) touching the shape of `key` by a side or a corner. */
export function linkCandidates(room: EditorRoom, key: string): string[] {
  const keys = groupKeys(room, key);
  if (!keys.length || room.cells[key]?.t !== "screen") return [];
  const cells = keys.map(toCell);
  return seatEntries(room)
    .map(([k]) => k)
    .filter((k) => touchesAny(cells, toCell(k)))
    .sort(byKeyPosition);
}

export interface Normalized {
  room: EditorRoom;
  /** Sentences about links that had to be cleared. */
  notes: string[];
}

/**
 * Restore the shape and link rules after an edit:
 * - a shape is joined by sides: when an edit cuts it in two, every part
 *   becomes its own shape (the part with the first square keeps the id);
 *   parts keep the screen's link if they still touch the seat;
 * - a link must point at a seat that touches the screen (side or corner),
 *   otherwise it is cleared (`notes` explains why, compared to `before`).
 */
export function normalizeRoom(
  room: EditorRoom,
  before: EditorRoom = room,
): Normalized {
  const cells = { ...room.cells };
  const links: Record<string, string> = {};
  const byGroup = new Map<string, string[]>();
  for (const [k, c] of Object.entries(cells))
    if (isFeature(c)) {
      const id = `${c.g}:${c.t}`;
      byGroup.set(id, [...(byGroup.get(id) ?? []), k]);
    }
  let next = nextGroupId(room);
  const used = new Set<number>();
  const groupsOf = new Map<number, string[]>();
  const shapes = [...byGroup.values()]
    .map((keys) => keys.sort(byKeyPosition))
    .sort((a, b) => byKeyPosition(a[0], b[0]));
  for (const keys of shapes) {
    const first = cells[keys[0]] as FeatureCell;
    const link = room.links[String(first.g)];
    for (const part of connectedParts(keys.map(toCell))) {
      const partKeys = part.map((c) => cellKey(c.col, c.row));
      const id = used.has(first.g) ? next++ : first.g;
      used.add(id);
      for (const k of partKeys) cells[k] = { t: first.t, g: id };
      groupsOf.set(id, partKeys);
      if (link && first.t === "screen") links[String(id)] = link;
    }
  }

  const notes: string[] = [];
  const noted = new Set<string>();
  for (const [g, seatKey] of Object.entries(links)) {
    const keys = groupsOf.get(Number(g)) ?? [];
    const seatCell = cells[seatKey];
    if (touchesAny(keys.map(toCell), toCell(seatKey)) && isSeat(seatCell))
      continue;
    delete links[g];
    // Only explain links that existed before this edit.
    const earlier = new Set([Number(g)]);
    for (const k of keys) {
      const c = before.cells[k];
      if (isFeature(c)) earlier.add(c.g);
    }
    if (![...earlier].some((bg) => before.links[String(bg)] != null)) continue;
    const name = isSeat(seatCell)
      ? seatName(room, seatKey)
      : seatName(before, seatKey);
    const id = `${name}|${isSeat(seatCell) ? "far" : "gone"}`;
    if (noted.has(id)) continue;
    noted.add(id);
    notes.push(
      isSeat(seatCell)
        ? `The screen at ${where(keys[0])} no longer touches ${name}, so its link was cleared.`
        : `${name[0].toUpperCase()}${name.slice(1)} is gone, so the screen at ${where(keys[0])} is no longer linked to it.`,
    );
  }
  return { room: { ...room, cells, links }, notes };
}

/** Run an edit, then restore the shape and link rules (see `normalizeRoom`). */
function edited(before: EditorRoom, after: EditorRoom) {
  return normalizeRoom(after, before);
}

const withNotes = (text: string, notes: string[]) => [text, ...notes].join(" ");

export type MergeResult =
  | { ok: true; room: EditorRoom; announce: string; notes: string[] }
  | { ok: false; announce: string };

/** Whether the square `key` touches (by a side) any square of `group`. */
const sideTouches = (groupKeyList: string[], key: string) => {
  const set = new Set(groupKeyList);
  const { col, row } = parseKey(key);
  return [
    cellKey(col - 1, row),
    cellKey(col + 1, row),
    cellKey(col, row - 1),
    cellKey(col, row + 1),
  ].some((k) => set.has(k));
};

const shapeName = (kind: FeatureKind, squares: number) =>
  `${FEATURE_NAMES[kind].toLowerCase()}${squares > 1 ? ` (${squares} squares)` : ""}`;

/**
 * Join the shape of `targetKey` into the shape of `fromKey`. Both must be the
 * same kind and the target must touch the shape by a side. If both screens
 * were linked to different seats, the first one's link is kept.
 */
export function mergeShapes(
  room: EditorRoom,
  fromKey: string,
  targetKey: string,
): MergeResult {
  const from = room.cells[fromKey];
  const target = room.cells[targetKey];
  if (!isFeature(from))
    return { ok: false, announce: "Pick a screen or entrance square first." };
  if (!isFeature(target))
    return {
      ok: false,
      announce: `Only ${FEATURE_NAMES[from.t].toLowerCase()} squares can join this ${FEATURE_NAMES[from.t].toLowerCase()}.`,
    };
  if (target.t !== from.t)
    return {
      ok: false,
      announce: `A ${FEATURE_NAMES[target.t].toLowerCase()} can't join a ${FEATURE_NAMES[from.t].toLowerCase()}.`,
    };
  if (target.g === from.g)
    return {
      ok: false,
      announce: `That square is already part of this ${FEATURE_NAMES[from.t].toLowerCase()}.`,
    };
  const fromKeys = groupKeys(room, fromKey);
  if (!sideTouches(fromKeys, targetKey))
    return {
      ok: false,
      announce: `That square doesn't touch this ${FEATURE_NAMES[from.t].toLowerCase()} by a side.`,
    };
  const targetKeys = groupKeys(room, targetKey);
  const cells = { ...room.cells };
  for (const k of targetKeys) cells[k] = { t: from.t, g: from.g };
  const links = { ...room.links };
  const kept = links[String(from.g)];
  const other = links[String(target.g)];
  delete links[String(target.g)];
  const notes: string[] = [];
  if (!kept && other) links[String(from.g)] = other;
  else if (kept && other && kept !== other)
    notes.push(
      `It stays linked to ${seatName(room, kept)}; the link to ${seatName(room, other)} was dropped.`,
    );
  const out = edited(room, { ...room, cells, links });
  const total = fromKeys.length + targetKeys.length;
  notes.push(...out.notes);
  return {
    ok: true,
    room: out.room,
    notes,
    announce: withNotes(`Merged into one ${shapeName(from.t, total)}.`, notes),
  };
}

/** Merge `keys` one after another into the shape of `keys[0]` (a drag). */
export function mergePath(room: EditorRoom, keys: string[]): MergeResult {
  if (keys.length < 2 || !isFeature(room.cells[keys[0]]))
    return { ok: false, announce: "Nothing to merge." };
  let cur = room;
  const notes: string[] = [];
  let merged = 0;
  let pending = keys.slice(1);
  // A square later in the path may only touch the shape once earlier ones joined.
  let progress = true;
  while (pending.length && progress) {
    progress = false;
    const rest: string[] = [];
    for (const k of pending) {
      const r = mergeShapes(cur, keys[0], k);
      if (r.ok) {
        cur = r.room;
        merged++;
        progress = true;
        notes.push(...r.notes);
      } else rest.push(k);
    }
    pending = rest;
  }
  if (!merged)
    return {
      ok: false,
      announce: mergeShapes(room, keys[0], keys[1]).announce,
    };
  const kind = (room.cells[keys[0]] as FeatureCell).t;
  return {
    ok: true,
    room: cur,
    notes,
    announce: withNotes(
      `Merged into one ${shapeName(kind, groupKeys(cur, keys[0]).length)}.`,
      notes,
    ),
  };
}

/**
 * Join every touching square of the same type into the shape of `key` (side
 * panel "Merge with adjacent squares"), repeatedly, so a whole connected run
 * becomes one shape.
 */
export function mergeAdjacent(room: EditorRoom, key: string): MergeResult {
  const cell = room.cells[key];
  if (!isFeature(cell)) return { ok: false, announce: "Nothing to merge." };
  let cur = room;
  const notes: string[] = [];
  let merged = 0;
  for (;;) {
    const keys = groupKeys(cur, key);
    const next = Object.entries(cur.cells).find(
      ([k, c]) =>
        isFeature(c) &&
        c.t === cell.t &&
        c.g !== (cur.cells[key] as FeatureCell).g &&
        sideTouches(keys, k),
    );
    if (!next) break;
    const r = mergeShapes(cur, key, next[0]);
    if (!r.ok) break;
    cur = r.room;
    merged++;
    notes.push(...r.notes);
  }
  if (!merged)
    return {
      ok: false,
      announce: `No other ${FEATURE_NAMES[cell.t].toLowerCase()} squares touch this one.`,
    };
  return {
    ok: true,
    room: cur,
    notes,
    announce: withNotes(
      `Merged into one ${shapeName(cell.t, groupKeys(cur, key).length)}.`,
      notes,
    ),
  };
}

/** Whether the shape of `key` touches another shape of the same type by a side. */
export function canMergeAdjacent(room: EditorRoom, key: string) {
  const cell = room.cells[key];
  if (!isFeature(cell)) return false;
  const keys = groupKeys(room, key);
  return Object.entries(room.cells).some(
    ([k, c]) =>
      isFeature(c) && c.t === cell.t && c.g !== cell.g && sideTouches(keys, k),
  );
}

/**
 * Detach the square `key` from its shape. If that cuts the rest in two, each
 * part becomes its own shape. Every part (the detached square included) keeps
 * the screen's link while it still touches the seat.
 */
export function splitSquare(room: EditorRoom, key: string): MergeResult {
  const cell = room.cells[key];
  if (!isFeature(cell))
    return {
      ok: false,
      announce: "Pick a screen or entrance square to split.",
    };
  const keys = groupKeys(room, key);
  if (keys.length < 2)
    return {
      ok: false,
      announce: `This ${FEATURE_NAMES[cell.t].toLowerCase()} is already a single square.`,
    };
  const id = nextGroupId(room);
  const cells = { ...room.cells, [key]: { t: cell.t, g: id } };
  const links = { ...room.links };
  const link = links[String(cell.g)];
  if (link && touchesAny([toCell(key)], toCell(link))) links[String(id)] = link;
  const out = edited(room, { ...room, cells, links });
  const parts = new Set(
    keys
      .filter((k) => k !== key)
      .map((k) => (out.room.cells[k] as FeatureCell).g),
  ).size;
  return {
    ok: true,
    room: out.room,
    notes: out.notes,
    announce: withNotes(
      `Split off the square at ${where(key)}.${parts > 1 ? ` The rest is now ${parts} separate ${FEATURE_NAMES[cell.t].toLowerCase()}s.` : ""}`,
      out.notes,
    ),
  };
}

/** Split the shape of `key` into single squares (side panel). */
export function splitAll(room: EditorRoom, key: string): MergeResult {
  const cell = room.cells[key];
  if (!isFeature(cell)) return { ok: false, announce: "Nothing to split." };
  const keys = groupKeys(room, key);
  if (keys.length < 2)
    return {
      ok: false,
      announce: `This ${FEATURE_NAMES[cell.t].toLowerCase()} is already a single square.`,
    };
  const cells = { ...room.cells };
  const links = { ...room.links };
  const link = links[String(cell.g)];
  delete links[String(cell.g)];
  let id = nextGroupId(room);
  let linked = 0;
  keys.forEach((k, i) => {
    const g = i === 0 ? cell.g : id++;
    cells[k] = { t: cell.t, g };
    if (link && touchesAny([toCell(k)], toCell(link))) {
      links[String(g)] = link;
      linked++;
    }
  });
  const out = edited(room, { ...room, cells, links });
  const name = FEATURE_NAMES[cell.t].toLowerCase();
  return {
    ok: true,
    room: out.room,
    notes: out.notes,
    announce: withNotes(
      `Split into ${keys.length} single-square ${name}s.${link ? ` ${linked === 0 ? "None of them touches" : `${linked} of them stay${linked === 1 ? "s" : ""} linked to`} ${seatName(room, link)}.` : ""}`,
      out.notes,
    ),
  };
}

/** Link the screen of `key` to the seat at `seatKey`, or unlink it (null). */
export function setScreenLink(
  room: EditorRoom,
  key: string,
  seatKey: string | null,
): MergeResult {
  const cell = room.cells[key];
  if (!isFeature(cell) || cell.t !== "screen")
    return { ok: false, announce: "Only screens can be linked to a seat." };
  const links = { ...room.links };
  const old = links[String(cell.g)];
  if (seatKey == null) {
    if (!old) return { ok: false, announce: "This screen isn't linked." };
    delete links[String(cell.g)];
    return {
      ok: true,
      room: { ...room, links },
      notes: [],
      announce: `Screen unlinked from ${seatName(room, old)}.`,
    };
  }
  if (!linkCandidates(room, key).includes(seatKey))
    return {
      ok: false,
      announce: isSeat(room.cells[seatKey])
        ? `${seatName(room, seatKey)} doesn't touch this screen. Pick a seat next to it (side or corner).`
        : "Pick a seat next to the screen (side or corner).",
    };
  if (old === seatKey)
    return {
      ok: false,
      announce: `The screen is already linked to ${seatName(room, seatKey)}.`,
    };
  links[String(cell.g)] = seatKey;
  return {
    ok: true,
    room: { ...room, links },
    notes: [],
    announce: `Screen linked to ${seatName(room, seatKey)}. It shows as taken when that seat is reserved.`,
  };
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

/** Clear one square (a seat, or one square of a screen / entrance). */
export const removeCell = (room: EditorRoom, key: string) =>
  edited(
    room,
    withCells(room, (cells) => {
      delete cells[key];
    }),
  ).room;

/** Remove a whole screen / entrance shape (or a seat). */
export function removeShape(room: EditorRoom, key: string) {
  const keys = isFeature(room.cells[key]) ? groupKeys(room, key) : [key];
  return edited(
    room,
    withCells(room, (cells) => {
      for (const k of keys) delete cells[k];
    }),
  );
}

export const renameSeat = (room: EditorRoom, key: string, value: string) => {
  const cell = room.cells[key];
  if (!isSeat(cell)) return room;
  return withCells(room, (cells) => {
    cells[key] = { ...cell, label: sanitizeLabel(value) };
  });
};

/** Set a seat's description (kept as typed, capped; trimmed on save). */
export const describeSeat = (room: EditorRoom, key: string, value: string) => {
  const cell = room.cells[key];
  if (!isSeat(cell)) return room;
  return withCells(room, (cells) => {
    cells[key] = {
      ...cell,
      description: clipCodePoints(value, MAX_DESCRIPTION_LENGTH),
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

export function seatStats(room: EditorRoom) {
  let seats = 0;
  let reserved = 0;
  for (const cell of Object.values(room.cells))
    if (cell.t === "seat") {
      seats++;
      if (cell.reservedBy) reserved++;
    }
  return { seats, reserved };
}

export const hasReservations = (room: EditorRoom) =>
  seatStats(room).reserved > 0;

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
    links: {},
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
  seat: "Seat",
  screen: "Screen",
  entrance: "Entrance",
  merge: "Merge",
  split: "Split",
  erase: "Erase",
};

export const TOOL_HINTS: Record<Tool, string> = {
  select:
    "Tap a seat, screen or entrance to edit it. Drag items to move them (on touch, press and hold first).",
  move: "Tap a seat, screen or entrance, then tap where it goes, or drag it. A seat dropped on another seat swaps places; screens and entrances move as a whole and need empty squares.",
  seat: "Tap empty squares to drop seats. Identifiers fill in automatically.",
  screen:
    "Tap squares to place screens, one square each. Use Merge to join squares into one screen.",
  entrance:
    "Tap squares to mark the way in, one square each. Use Merge to join squares into one entrance.",
  merge:
    "Tap a screen or entrance square, then a square of the same type touching it by a side, or drag across them, to join them into one shape (L shapes too).",
  split:
    "Tap a square of a merged screen or entrance to detach it. Parts that no longer touch become separate shapes.",
  erase: "Tap anything to clear it. Reserved seats ask first.",
};

/** Keyboard shortcuts for the tools (while the toolbar or grid has focus). */
export const TOOL_SHORTCUTS: Record<Tool, string> = {
  select: "V",
  move: "M",
  seat: "D",
  screen: "S",
  entrance: "E",
  merge: "G",
  split: "U",
  erase: "X",
};

export const TOOLS: Tool[] = [
  "select",
  "move",
  "seat",
  "screen",
  "entrance",
  "merge",
  "split",
  "erase",
];

export const toolForShortcut = (key: string): Tool | undefined =>
  TOOLS.find((t) => TOOL_SHORTCUTS[t] === key.toUpperCase());

/** Accessible name of a grid cell. */
export function cellLabel(room: EditorRoom, key: string) {
  const cell = room.cells[key];
  if (!cell) return `Empty square, ${where(key)}`;
  if (cell.t === "seat") {
    const who = cell.reservedBy
      ? `, reserved by ${reserverName(cell.reservedBy)}`
      : "";
    const about = cell.description?.trim()
      ? `, ${cell.description.trim()}`
      : "";
    const screens = screensLinkedTo(room, key).length;
    const linked =
      screens === 0
        ? ""
        : screens === 1
          ? ", with screen"
          : `, with ${screens} screens`;
    return `Seat ${cell.label || "(no label)"}${about}${linked}${who}, ${where(key)}`;
  }
  const squares = groupKeys(room, key).length;
  const size = squares > 1 ? `, ${squares} squares` : "";
  const link = linkedSeat(room, key);
  const linked = link ? `, linked to ${seatName(room, link)}` : "";
  return `${FEATURE_NAMES[cell.t]}${size}${linked}, ${where(key)}`;
}

export type ToolOutcome =
  /** Change the selection only. */
  | { type: "select"; sel: string | null; announce?: string }
  /** The room changed (`notes`: screen links the change cleared). */
  | {
      type: "update";
      room: EditorRoom;
      sel: string | null;
      announce: string;
      notes?: string[];
    }
  /** Removing a reserved seat: ask first. */
  | { type: "confirm"; key: string }
  | { type: "noop" };

/**
 * What using `tool` on the cell `key` does:
 * - Select: select a seat, screen or entrance (or clear the selection).
 * - Seat: drop an auto-labelled seat (replacing a feature); on a seat, select it.
 * - Screen / Entrance: toggle a single square of that type (replacing a free
 *   seat); reserved seats are never overwritten, they are selected instead.
 * - Merge: the first square picked (the selection) grows: picking a touching
 *   square of the same type joins its shape; anything else is picked instead.
 * - Split: detach the square from its shape.
 * - Erase: clear the cell; reserved seats ask for confirmation.
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
    return cell ? { type: "select", sel: key } : { type: "select", sel: null };

  if (tool === "erase") {
    if (!cell) return { type: "noop" };
    if (isReserved(cell)) return { type: "confirm", key };
    const out = edited(
      room,
      withCells(room, (cells) => {
        delete cells[key];
      }),
    );
    const selGone = sel != null && !out.room.cells[sel];
    return {
      type: "update",
      room: out.room,
      sel: sel === key || selGone ? null : sel,
      notes: out.notes,
      announce: withNotes(
        cell.t === "seat"
          ? `Removed seat ${cell.label}.`
          : `Cleared ${FEATURE_NAMES[cell.t].toLowerCase()} square at ${place}.`,
        out.notes,
      ),
    };
  }

  if (tool === "seat") {
    if (isSeat(cell)) return { type: "select", sel: key };
    const label = nextSeatLabel(room, parseKey(key).row);
    const out = edited(
      room,
      withCells(room, (cells) => {
        cells[key] = { t: "seat", label };
      }),
    );
    return {
      type: "update",
      room: out.room,
      sel: key,
      notes: out.notes,
      announce: withNotes(`Placed seat ${label} at ${place}.`, out.notes),
    };
  }

  if (tool === "merge") {
    if (!isFeature(cell))
      return {
        type: "select",
        sel: null,
        announce: cell
          ? "Seats can't be merged. Pick a screen or entrance square."
          : "Pick a screen or entrance square to merge.",
      };
    const from = sel ? room.cells[sel] : undefined;
    if (sel && isFeature(from) && from.g !== cell.g) {
      const r = mergeShapes(room, sel, key);
      if (r.ok)
        return {
          type: "update",
          room: r.room,
          sel,
          announce: r.announce,
          notes: r.notes,
        };
      if (from.t === cell.t)
        return { type: "select", sel, announce: r.announce };
    }
    const n = groupKeys(room, key).length;
    return {
      type: "select",
      sel: key,
      announce: `Merging from the ${shapeName(cell.t, n)} at ${place}. Pick a ${FEATURE_NAMES[cell.t].toLowerCase()} square touching it by a side to join it.`,
    };
  }

  if (tool === "split") {
    if (!isFeature(cell))
      return {
        type: "select",
        sel: isSeat(cell) ? key : null,
        announce: "Pick a square of a merged screen or entrance to split it.",
      };
    const r = splitSquare(room, key);
    return r.ok
      ? {
          type: "update",
          room: r.room,
          sel: key,
          announce: r.announce,
          notes: r.notes,
        }
      : { type: "select", sel: key, announce: r.announce };
  }

  // screen / entrance
  if (isSeat(cell) && cell.reservedBy)
    return {
      type: "select",
      sel: key,
      announce: `Seat ${cell.label} is reserved. Remove it first to place a ${FEATURE_NAMES[tool].toLowerCase()} here.`,
    };
  if (cell && cell.t === tool) {
    const out = edited(
      room,
      withCells(room, (cells) => {
        delete cells[key];
      }),
    );
    return {
      type: "update",
      room: out.room,
      sel: sel && out.room.cells[sel] ? sel : null,
      notes: out.notes,
      announce: withNotes(
        `Cleared ${FEATURE_NAMES[tool].toLowerCase()} square at ${place}.`,
        out.notes,
      ),
    };
  }
  const out = edited(
    room,
    withCells(room, (cells) => {
      cells[key] = { t: tool, g: nextGroupId(room) };
    }),
  );
  return {
    type: "update",
    room: out.room,
    sel: sel === key || (sel && !out.room.cells[sel]) ? null : sel,
    notes: out.notes,
    announce: withNotes(
      `${FEATURE_NAMES[tool]} placed at ${place}${isSeat(cell) ? `, replacing seat ${cell.label}` : ""}.`,
      out.notes,
    ),
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
// Moving seats and features
// ---------------------------------------------------------------------------

/**
 * Cells that move together with `key`: a seat on its own, or every square of
 * the screen / entrance shape it belongs to. Empty for an empty cell.
 */
export function moveGroup(room: EditorRoom, key: string): string[] {
  const cell = room.cells[key];
  if (!cell) return [];
  if (cell.t === "seat") return [key];
  return groupKeys(room, key);
}

export type MovePlan =
  /** Nothing to move, or it would land where it already is. */
  | { type: "none" }
  | { type: "move"; from: string[]; to: string[] }
  /** Seat dropped on another seat: they trade places. */
  | { type: "swap"; from: string[]; to: string[]; other: string }
  | { type: "blocked"; from: string[]; to: string[]; reason: string };

/** "seat A1", "screen", "entrance (3 squares)". */
export const itemName = (cell: Cell, squares = 1) =>
  cell.t === "seat"
    ? `seat ${cell.label || "(no label)"}`
    : shapeName(cell.t, squares);

/**
 * What dropping the item at `fromKey` on `target` would do. The grabbed cell
 * lands on `target`; a shape keeps its form and is clamped so it stays inside
 * the grid. Seats swap with seats; anything else in the way blocks the move.
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
  const cells = group.map(parseKey);
  const cols = cells.map((p) => p.col);
  const rows = cells.map((p) => p.row);
  const dc = clamp(
    target.col - origin.col,
    -Math.min(...cols),
    GRID_COLS - 1 - Math.max(...cols),
  );
  const dr = clamp(
    target.row - origin.row,
    -Math.min(...rows),
    room.rows - 1 - Math.max(...rows),
  );
  if (dc === 0 && dr === 0) return { type: "none" };
  const to = cells.map((p) => cellKey(p.col + dc, p.row + dr));

  if (cell.t === "seat") {
    const other = room.cells[to[0]];
    if (!other) return { type: "move", from: group, to };
    if (other.t === "seat")
      return { type: "swap", from: group, to, other: to[0] };
    return {
      type: "blocked",
      from: group,
      to,
      reason: `The ${itemName(other, groupKeys(room, to[0]).length)} is in the way. Seats can only swap places with other seats.`,
    };
  }

  const inGroup = new Set(group);
  const clash = to.find((k) => !inGroup.has(k) && room.cells[k]);
  if (clash)
    return {
      type: "blocked",
      from: group,
      to,
      reason: `The ${itemName(room.cells[clash], groupKeys(room, clash).length)} at ${where(clash)} is in the way. Screens and entrances need empty squares.`,
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
  | {
      ok: true;
      room: EditorRoom;
      key: string;
      announce: string;
      notes: string[];
    }
  | { ok: false; announce: string };

/**
 * Move the item at `fromKey` to `target` (see `planMove`). Seats keep their
 * seat id, identifier, description and reservation: the reservation follows
 * the seat, and so do screen links (cleared, with a note, if the screen and
 * seat no longer touch). `key` is where the grabbed cell ended up.
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
  const moved = withCells(room, (cells) => {
    const other = plan.type === "swap" ? cells[plan.other] : undefined;
    for (const k of plan.from) delete cells[k];
    plan.to.forEach((k, i) => {
      cells[k] = moving[i];
    });
    if (other) cells[plan.from[0]] = other;
  });
  // Links follow their seat.
  if (cell.t === "seat") {
    const links: Record<string, string> = {};
    for (const [g, s] of Object.entries(room.links))
      links[g] =
        s === plan.from[0]
          ? plan.to[0]
          : plan.type === "swap" && s === plan.other
            ? plan.from[0]
            : s;
    moved.links = links;
  }
  const out = edited(room, moved);
  const key = plan.to[plan.from.indexOf(fromKey)];
  const at = where(plan.to[0]);
  const follows =
    isSeat(cell) && cell.reservedBy
      ? ` ${reserverName(cell.reservedBy)}'s reservation moves with it.`
      : "";
  let announce: string;
  if (plan.type === "swap") {
    const other = room.cells[plan.other] as SeatCell;
    announce = `Swapped ${itemName(cell)} with ${itemName(other)}. ${(cell as SeatCell).label} is now at ${at}.${follows}`;
  } else if (isSeat(cell))
    announce = `Moved ${itemName(cell)} to ${at}.${follows}`;
  else announce = `Moved ${itemName(cell, plan.from.length)} to ${at}.`;
  return {
    ok: true,
    room: out.room,
    key,
    notes: out.notes,
    announce: withNotes(announce, out.notes),
  };
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
    const seats = seatEntries(room).map(([, c]) => c);
    const blank = seats.filter((d) => !d.label).length;
    if (blank)
      problems.push(
        `${label} has ${blank === 1 ? "a seat" : `${blank} seats`} without a label.`,
      );
    const reported = new Set<string>();
    for (const dup of duplicateLabels(room)) {
      if (reported.has(labelId(dup))) continue;
      reported.add(labelId(dup));
      problems.push(`${label}: more than one seat is labelled ${dup}.`);
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

/** Reserved seats in `before` whose seat is gone from `after`. */
export function removedReservations(
  before: EditorRoom[],
  after: EditorRoom[],
): RemovedReservation[] {
  const kept = new Set<number>();
  for (const room of after)
    for (const cell of Object.values(room.cells))
      if (cell.t === "seat" && cell.seatId != null) kept.add(cell.seatId);
  const out: RemovedReservation[] = [];
  for (const room of before)
    for (const cell of Object.values(room.cells))
      if (
        cell.t === "seat" &&
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
