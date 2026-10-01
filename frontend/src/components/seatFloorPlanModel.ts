/**
 * Pure layout helpers for the graphical floor plan (`SeatFloorPlan`).
 *
 * A room is a grid of `GRID_COLS` (12) columns x `gridRows` rows. Desks are
 * seats with integer `gridCol`/`gridRow`; screens and entrances are room
 * `features`. Seats created by the old free-form editor have no grid cell and
 * are placed from their relative `x`/`y` (see the API contract, section 6).
 */
import type { Room, Seat } from "../types/events";

export const GRID_COLS = 12;
/** Rows used when a (legacy) room has no `gridRows`. Matches the editor default. */
export const DEFAULT_GRID_ROWS = 8;

export type RoomFeatureKind = "screen" | "entrance";

export interface RoomFeature {
  col: number;
  row: number;
  kind: RoomFeatureKind | string;
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

/** A horizontal run of identical feature cells, drawn as one strip. */
export interface FeatureStrip {
  kind: RoomFeatureKind;
  row: number;
  col: number;
  span: number;
}

export interface RoomLayout {
  rows: number;
  /** Seat id -> grid cell. Every seat passed in gets a cell. */
  cells: Map<number, GridCell>;
  strips: FeatureStrip[];
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

/** Number of grid rows to draw for a room so every desk and feature fits. */
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

/** Merge adjacent same-kind feature cells on a row into strips. */
export function featureStrips(
  features: RoomFeature[] | null | undefined,
  rows: number,
): FeatureStrip[] {
  const byCell = new Map<string, RoomFeatureKind>();
  for (const f of features ?? []) {
    if (!isFeatureKind(f.kind) || !isInt(f.col) || !isInt(f.row)) continue;
    if (f.col < 0 || f.col >= GRID_COLS || f.row < 0 || f.row >= rows) continue;
    byCell.set(key(f.col, f.row), f.kind);
  }
  const strips: FeatureStrip[] = [];
  for (let row = 0; row < rows; row++) {
    let col = 0;
    while (col < GRID_COLS) {
      const kind = byCell.get(key(col, row));
      if (!kind) {
        col++;
        continue;
      }
      let span = 1;
      while (
        col + span < GRID_COLS &&
        byCell.get(key(col + span, row)) === kind
      ) {
        span++;
      }
      strips.push({ kind, row, col, span });
      col += span;
    }
  }
  return strips;
}

/**
 * Lay out a room: grid size, one cell per seat and the feature strips.
 * Seats with a valid, unique grid cell keep it; the rest (legacy seats, or
 * duplicates) go to the nearest free cell to where they belong.
 */
export function layoutRoom(
  room: FloorPlanRoom,
  seats: FloorPlanSeat[],
): RoomLayout {
  const rows = gridRowsFor(room, seats);
  const strips = featureStrips(room.features, rows);
  const taken = new Set<string>();
  for (const s of strips) {
    for (let c = s.col; c < s.col + s.span; c++) taken.add(key(c, s.row));
  }

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

  return { rows, cells, strips };
}

export type ArrowKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";

export interface NavDesk extends GridCell {
  id: number;
}

/**
 * The desk to move focus to when pressing an arrow key on `fromId`: the
 * closest desk in that direction (primary axis first, then the cross axis).
 * `null` when there is none.
 */
export function nextDeskInDirection(
  desks: NavDesk[],
  fromId: number,
  direction: ArrowKey,
): number | null {
  const from = desks.find((d) => d.id === fromId);
  if (!from) return null;
  let best: number | null = null;
  let bestScore = Infinity;
  for (const d of desks) {
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

/** Order seats by their cell in reading order (the desks' tab order). */
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
export const OWN_DESK_DEFAULT = "Bring my own desk";

/** The configured unspecified-seat label, or "Bring my own desk" for the default/empty one. */
export const ownDeskLabel = (label: string | null | undefined) =>
  label && label.trim() && label.trim().toLowerCase() !== "unspecified seat"
    ? label.trim()
    : OWN_DESK_DEFAULT;
