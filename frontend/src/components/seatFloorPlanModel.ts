/**
 * Pure layout helpers for the graphical floor plan (`SeatFloorPlan`).
 *
 * A room is a grid of `GRID_COLS` (12) columns x `gridRows` rows. Seats have
 * integer `gridCol`/`gridRow`; screens and entrances are room `features`.
 * Seats created by the old free-form editor have no grid cell and are placed
 * from their relative `x`/`y` (see the API contract, section 6).
 */
import type { Room, Seat } from "../types/events";

export const GRID_COLS = 12;
/** Rows used when a (legacy) room has no `gridRows`. Matches the editor default. */
export const DEFAULT_GRID_ROWS = 8;

export type RoomFeatureKind = "screen" | "entrance";

/**
 * One square of a screen or entrance. Squares with the same `group` (and kind)
 * are one shape; a screen may be linked to the seat at `linkCol`/`linkRow`.
 * Squares without a `group` come from rooms saved before groups existed.
 */
export interface RoomFeature {
  col: number;
  row: number;
  kind: RoomFeatureKind | string;
  group?: number | null;
  linkCol?: number | null;
  linkRow?: number | null;
}

export type BackgroundStyle = "retro" | "original";

/** A room with the (optional) grid and background fields of the redesign API. */
export type FloorPlanRoom = Room & {
  gridRows?: number | null;
  features?: RoomFeature[] | null;
  backgroundUrl?: string | null;
  backgroundStyle?: BackgroundStyle | string | null;
  backgroundOpacity?: number | null;
};

/** A seat with the (optional) grid cell of the redesign API. */
export type FloorPlanSeat = Seat & {
  gridCol?: number | null;
  gridRow?: number | null;
};

export interface GridCell {
  col: number;
  row: number;
}

/** A screen or entrance: one or more squares joined by their sides. */
export interface FeatureGroup {
  /** Shape id (the saved `group`, or a fresh one for legacy squares). */
  id: number;
  kind: RoomFeatureKind;
  /** Squares in reading order. */
  cells: GridCell[];
  /** Screens only: the cell of the seat this screen belongs to. */
  link: GridCell | null;
}

export interface RoomLayout {
  rows: number;
  /** Seat id -> grid cell. Every seat passed in gets a cell. */
  cells: Map<number, GridCell>;
  groups: FeatureGroup[];
}

const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));

const isInt = (n: unknown): n is number =>
  typeof n === "number" && Number.isInteger(n);

const key = (col: number, row: number) => `${col},${row}`;

const isFeatureKind = (k: unknown): k is RoomFeatureKind =>
  k === "screen" || k === "entrance";

/** Cell for a legacy seat from its relative position (contract formula). */
export function legacyCell(x: number, y: number, rows: number): GridCell {
  const safe = (v: number) => (Number.isFinite(v) ? clamp(v, 0, 1) : 0.5);
  return {
    col: Math.min(GRID_COLS - 1, Math.floor(safe(x) * GRID_COLS)),
    row: Math.min(rows - 1, Math.floor(safe(y) * rows)),
  };
}

/** Number of grid rows to draw for a room so every seat and feature fits. */
export function gridRowsFor(
  room: FloorPlanRoom,
  seats: FloorPlanSeat[],
): number {
  let rows =
    isInt(room.gridRows) && room.gridRows > 0
      ? room.gridRows
      : DEFAULT_GRID_ROWS;
  for (const s of seats) {
    if (isInt(s.gridCol) && isInt(s.gridRow) && s.gridRow >= rows) {
      rows = s.gridRow + 1;
    }
  }
  for (const f of room.features ?? []) {
    if (isInt(f.row) && f.row >= rows) rows = f.row + 1;
  }
  const featureCount = (room.features ?? []).length;
  while (rows * GRID_COLS < seats.length + featureCount) rows++;
  return rows;
}

/** Nearest free cell to `want` (by distance, then same row, then reading order). */
function nearestFree(
  want: GridCell,
  rows: number,
  taken: Set<string>,
): GridCell | null {
  let best: GridCell | null = null;
  let bestScore = Infinity;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      if (taken.has(key(col, row))) continue;
      const dr = Math.abs(row - want.row);
      const dc = Math.abs(col - want.col);
      // Prefer staying on the same row (seats are laid out in rows).
      const score = (dr * 1.5 + dc) * 1000 + row * GRID_COLS + col;
      if (score < bestScore) {
        bestScore = score;
        best = { col, row };
      }
    }
  }
  return best;
}

const byReading = (a: GridCell, b: GridCell) => a.row - b.row || a.col - b.col;

/** Split cells into the shapes they form when joined by sides (not corners). */
export function connectedParts(cells: GridCell[]): GridCell[][] {
  const left = new Map(cells.map((c) => [key(c.col, c.row), c]));
  const parts: GridCell[][] = [];
  for (const start of [...cells].sort(byReading)) {
    if (!left.has(key(start.col, start.row))) continue;
    left.delete(key(start.col, start.row));
    const part: GridCell[] = [start];
    for (let i = 0; i < part.length; i++) {
      const { col, row } = part[i];
      for (const [c, r] of [
        [col - 1, row],
        [col + 1, row],
        [col, row - 1],
        [col, row + 1],
      ]) {
        const next = left.get(key(c, r));
        if (!next) continue;
        left.delete(key(c, r));
        part.push(next);
      }
    }
    parts.push(part.sort(byReading));
  }
  return parts;
}

/** Whether two cells touch by a side or a corner. */
export const touches = (a: GridCell, b: GridCell) =>
  Math.abs(a.col - b.col) <= 1 &&
  Math.abs(a.row - b.row) <= 1 &&
  !(a.col === b.col && a.row === b.row);

/** Whether `target` touches any square of `cells` (side or corner). */
export const touchesAny = (cells: GridCell[], target: GridCell) =>
  cells.some((c) => touches(c, target));

/**
 * The room's screens and entrances as shapes. Squares sharing a `group` and
 * kind are one shape (split again if they are not joined by sides). Squares
 * without a `group` (rooms saved before groups) keep the old look: each
 * horizontal run of the same kind is one shape. Unknown kinds, bad cells and
 * cells outside `rows` (when given) are ignored; a cell listed twice counts
 * once. Groups come back in reading order of their first square.
 */
export function deriveFeatureGroups(
  features: RoomFeature[] | null | undefined,
  rows?: number,
): FeatureGroup[] {
  const seen = new Set<string>();
  const explicit = new Map<
    string,
    {
      kind: RoomFeatureKind;
      id: number;
      cells: GridCell[];
      link: GridCell | null;
    }
  >();
  const legacy = new Map<string, RoomFeatureKind>();
  for (const f of features ?? []) {
    if (!isFeatureKind(f.kind) || !isInt(f.col) || !isInt(f.row)) continue;
    if (f.col < 0 || f.col >= GRID_COLS || f.row < 0) continue;
    if (rows !== undefined && f.row >= rows) continue;
    const k = key(f.col, f.row);
    if (seen.has(k)) continue;
    seen.add(k);
    if (isInt(f.group) && f.group >= 0) {
      const bucket = `${f.group}:${f.kind}`;
      let g = explicit.get(bucket);
      if (!g) {
        g = { kind: f.kind, id: f.group, cells: [], link: null };
        explicit.set(bucket, g);
      }
      g.cells.push({ col: f.col, row: f.row });
      if (
        !g.link &&
        f.kind === "screen" &&
        isInt(f.linkCol) &&
        isInt(f.linkRow)
      )
        g.link = { col: f.linkCol, row: f.linkRow };
    } else legacy.set(k, f.kind);
  }

  const out: FeatureGroup[] = [];
  const used = new Set<number>();
  let nextId = 0;
  for (const g of explicit.values()) nextId = Math.max(nextId, g.id + 1);
  const fresh = () => nextId++;

  for (const g of explicit.values())
    for (const cells of connectedParts(g.cells)) {
      const id = used.has(g.id) ? fresh() : g.id;
      used.add(id);
      out.push({ id, kind: g.kind, cells, link: g.link });
    }

  const cells = [...legacy.keys()]
    .map((k) => {
      const [col, row] = k.split(",").map(Number);
      return { col, row };
    })
    .sort(byReading);
  const done = new Set<string>();
  for (const start of cells) {
    if (done.has(key(start.col, start.row))) continue;
    const kind = legacy.get(key(start.col, start.row))!;
    const run: GridCell[] = [];
    for (
      let col = start.col;
      col < GRID_COLS && legacy.get(key(col, start.row)) === kind;
      col++
    ) {
      run.push({ col, row: start.row });
      done.add(key(col, start.row));
    }
    out.push({ id: fresh(), kind, cells: run, link: null });
  }

  return out.sort((a, b) => byReading(a.cells[0], b.cells[0]) || a.id - b.id);
}

/** The longest straight run of squares in a shape (where its label goes). */
export interface LabelRun {
  col: number;
  row: number;
  span: number;
  vertical: boolean;
}

/**
 * Where a shape's label sits: its longest horizontal run (the first one in
 * reading order on a tie), or its longest vertical run when that is longer
 * (a door drawn down a wall).
 */
export function labelRun(cells: GridCell[]): LabelRun {
  const set = new Set(cells.map((c) => key(c.col, c.row)));
  let best: LabelRun = { ...cells[0], span: 1, vertical: false };
  for (const c of [...cells].sort(byReading)) {
    if (!set.has(key(c.col - 1, c.row))) {
      let span = 1;
      while (set.has(key(c.col + span, c.row))) span++;
      if (span > best.span) best = { ...c, span, vertical: false };
    }
  }
  for (const c of [...cells].sort(byReading)) {
    if (!set.has(key(c.col, c.row - 1))) {
      let span = 1;
      while (set.has(key(c.col, c.row + span))) span++;
      if (span > best.span) best = { ...c, span, vertical: true };
    }
  }
  return best;
}

/**
 * How one square of a shape is drawn so the shape reads as one piece: an
 * outline only on its outer edges, plus bridges over the grid gap towards
 * neighbouring squares of the same shape. A bridge down widens over the gap
 * corner only when the 2x2 block is complete, so L shapes keep a clean inner
 * corner. `bridgeRight`/`bridgeDown` say which of the bridge's edges are part
 * of the outline.
 */
export interface SquareEdges {
  top: boolean;
  right: boolean;
  bottom: boolean;
  left: boolean;
  bridgeRight: { top: boolean; bottom: boolean } | null;
  bridgeDown: { left: boolean; right: boolean; wide: boolean } | null;
}

export function squareEdges(cells: GridCell[], cell: GridCell): SquareEdges {
  const set = new Set(cells.map((c) => key(c.col, c.row)));
  const has = (dc: number, dr: number) =>
    set.has(key(cell.col + dc, cell.row + dr));
  const right = has(1, 0);
  const down = has(0, 1);
  const wide = right && down && has(1, 1);
  return {
    top: !has(0, -1),
    right: !right,
    bottom: !down,
    left: !has(-1, 0),
    bridgeRight: right
      ? { top: !(has(0, -1) && has(1, -1)), bottom: !(down && has(1, 1)) }
      : null,
    bridgeDown: down
      ? { left: !(has(-1, 0) && has(-1, 1)), right: !wide, wide }
      : null,
  };
}

/**
 * Lay out a room: grid size, one cell per seat and the feature shapes.
 * Seats with a valid, unique grid cell keep it; the rest (legacy seats, or
 * duplicates) go to the nearest free cell to where they belong.
 */
export function layoutRoom(
  room: FloorPlanRoom,
  seats: FloorPlanSeat[],
): RoomLayout {
  const rows = gridRowsFor(room, seats);
  const groups = deriveFeatureGroups(room.features, rows);
  const taken = new Set<string>();
  for (const g of groups) for (const c of g.cells) taken.add(key(c.col, c.row));

  const cells = new Map<number, GridCell>();
  const pending: FloorPlanSeat[] = [];

  for (const seat of seats) {
    const { gridCol, gridRow } = seat;
    if (
      isInt(gridCol) &&
      isInt(gridRow) &&
      gridCol >= 0 &&
      gridCol < GRID_COLS &&
      gridRow >= 0 &&
      gridRow < rows &&
      !taken.has(key(gridCol, gridRow))
    ) {
      cells.set(seat.id, { col: gridCol, row: gridRow });
      taken.add(key(gridCol, gridRow));
    } else {
      pending.push(seat);
    }
  }

  // Legacy seats in a stable order: top-to-bottom, left-to-right.
  pending.sort((a, b) => a.y - b.y || a.x - b.x || a.id - b.id);
  for (const seat of pending) {
    const want =
      isInt(seat.gridCol) && isInt(seat.gridRow)
        ? {
            col: clamp(seat.gridCol, 0, GRID_COLS - 1),
            row: clamp(seat.gridRow, 0, rows - 1),
          }
        : legacyCell(seat.x, seat.y, rows);
    const cell = taken.has(key(want.col, want.row))
      ? nearestFree(want, rows, taken)
      : want;
    if (!cell) continue; // cannot happen: gridRowsFor leaves room for all
    cells.set(seat.id, cell);
    taken.add(key(cell.col, cell.row));
  }

  return { rows, cells, groups };
}

/**
 * Linked screens resolved to seats: screen group id -> seat id, for links
 * that point at a seat's cell and touch the screen. Stale links (no seat
 * there any more, or no longer next to it) are ignored.
 */
export function screenSeatLinks(layout: RoomLayout): Map<number, number> {
  const seatAt = new Map<string, number>();
  for (const [id, c] of layout.cells) seatAt.set(key(c.col, c.row), id);
  const out = new Map<number, number>();
  for (const g of layout.groups) {
    if (g.kind !== "screen" || !g.link) continue;
    const seatId = seatAt.get(key(g.link.col, g.link.row));
    if (seatId !== undefined && touchesAny(g.cells, g.link))
      out.set(g.id, seatId);
  }
  return out;
}

export type ArrowKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";

export interface NavSeat extends GridCell {
  id: number;
}

/**
 * The seat to move focus to when pressing an arrow key on `fromId`: the
 * closest seat in that direction (primary axis first, then the cross axis).
 * `null` when there is none.
 */
export function nextSeatInDirection(
  seats: NavSeat[],
  fromId: number,
  direction: ArrowKey,
): number | null {
  const from = seats.find((d) => d.id === fromId);
  if (!from) return null;
  let best: number | null = null;
  let bestScore = Infinity;
  for (const d of seats) {
    if (d.id === fromId) continue;
    const dx = d.col - from.col;
    const dy = d.row - from.row;
    let primary: number;
    let cross: number;
    switch (direction) {
      case "ArrowRight":
        primary = dx;
        cross = Math.abs(dy);
        break;
      case "ArrowLeft":
        primary = -dx;
        cross = Math.abs(dy);
        break;
      case "ArrowDown":
        primary = dy;
        cross = Math.abs(dx);
        break;
      case "ArrowUp":
        primary = -dy;
        cross = Math.abs(dx);
        break;
    }
    if (primary <= 0) continue;
    // Stay on the same row/column when possible.
    const score = cross * 100 + primary;
    if (score < bestScore) {
      bestScore = score;
      best = d.id;
    }
  }
  return best;
}

export interface RoomBackground {
  url: string;
  style: BackgroundStyle;
  /** 0.1-1 */
  opacity: number;
}

/**
 * The image drawn behind a room's grid: the uploaded background plan, or the
 * legacy floorplan image. Legacy images default to the original look.
 */
export function roomBackground(room: FloorPlanRoom): RoomBackground | null {
  const uploaded = room.backgroundUrl || null;
  const url = uploaded ?? room.image ?? null;
  if (!url) return null;
  const style: BackgroundStyle =
    room.backgroundStyle === "original" || room.backgroundStyle === "retro"
      ? room.backgroundStyle
      : uploaded
        ? "retro"
        : "original";
  const raw = room.backgroundOpacity;
  const opacity =
    typeof raw === "number" && Number.isFinite(raw) ? clamp(raw, 0.1, 1) : 0.6;
  return { url, style, opacity };
}

/** `RM-01`-style code for the n-th room (0-based). */
export const roomCode = (index: number) =>
  `RM-${String(index + 1).padStart(2, "0")}`;

/** Order rooms as the API does (sortOrder, then id). */
export const sortRooms = <T extends Pick<Room, "sortOrder" | "id">>(
  rooms: T[],
): T[] => [...rooms].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);

/** Order seats by their cell in reading order (the seats' tab order). */
export function sortByCell<T extends { id: number }>(
  items: T[],
  cells: Map<number, GridCell>,
): T[] {
  const pos = (id: number) => {
    const c = cells.get(id);
    return c ? c.row * GRID_COLS + c.col : Number.MAX_SAFE_INTEGER;
  };
  return [...items].sort((a, b) => pos(a.id) - pos(b.id) || a.id - b.id);
}

/** "A", "A and B", "A, B and C". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Wording used for the "unspecified seat" option when the event keeps the default label. */
export const OWN_SEAT_DEFAULT = "Bring my own seat";

/** The configured unspecified-seat label, or "Bring my own seat" for the default/empty one. */
export const ownSeatLabel = (label: string | null | undefined) =>
  label && label.trim() && label.trim().toLowerCase() !== "unspecified seat"
    ? label.trim()
    : OWN_SEAT_DEFAULT;
