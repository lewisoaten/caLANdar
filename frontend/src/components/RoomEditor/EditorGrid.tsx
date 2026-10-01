import * as React from "react";
import { useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import TvSharp from "@mui/icons-material/TvSharp";
import DoorFrontSharp from "@mui/icons-material/DoorFrontSharp";
import LinkSharp from "@mui/icons-material/LinkSharp";
import { UserAvatar, colors, effects, fonts, hairline, tint } from "../hl";
import { shapeSquareSx } from "../SeatFloorPlan";
import { labelRun, squareEdges, type GridCell } from "../seatFloorPlanModel";
import {
  GRID_COLS,
  cellKey,
  cellLabel,
  describePlan,
  duplicateLabels,
  groupKeys,
  isFeature,
  itemName,
  moveFocus,
  parseKey,
  planMove,
  reserverName,
  screensLinkedTo,
  toolForShortcut,
  type BackgroundStyle,
  type EditorRoom,
  type FeatureCell,
  type MovePlan,
  type Tool,
} from "./layout";

export interface GridBackground {
  src: string;
  style: BackgroundStyle;
  /** Percent, 10-100. */
  opacity: number;
}

export interface EditorGridProps {
  room: EditorRoom;
  tool: Tool;
  sel: string | null;
  focus: { col: number; row: number };
  onFocusChange: (pos: { col: number; row: number }) => void;
  /** Click / Enter / Space on a cell: apply the current tool. */
  onActivate: (key: string) => void;
  /** Delete / Backspace on a cell: erase it whatever the tool. */
  onErase: (key: string) => void;
  onToolShortcut: (tool: Tool) => void;
  /** Drop the item picked up at `from` with its grabbed cell on `to`. */
  onMove: (from: string, to: { col: number; row: number }) => void;
  /** Say something in the editor's live region. */
  onAnnounce: (text: string) => void;
  /** Merge tool: a drag across squares, to join them into the first one's shape. */
  onMergePath?: (keys: string[]) => void;
  /**
   * Linking a screen to a seat: the seats it may link to are highlighted and
   * activating one calls `onLinkPick` with it; anything else (or Escape)
   * calls it with null to cancel.
   */
  linking?: { screen: string; candidates: string[] } | null;
  onLinkPick?: (seatKey: string | null) => void;
  background: GridBackground | null;
  /** id of the element describing the tool and keyboard help. */
  describedBy?: string;
}

/** Gap between squares (px); merged shapes bridge it. */
const GAP = 3;

/** Pointer travel (px) before a press on an item becomes a drag. */
export const DRAG_THRESHOLD = 4;
/** Touch press (ms) that picks an item up with the Select tool. */
export const LONG_PRESS_MS = 350;

const tile = {
  aspectRatio: "1",
  minWidth: 0,
  minHeight: 0,
  // A fixed square whatever the label: never grow to fit long text.
  overflow: "hidden",
  containerType: "inline-size",
  padding: "2px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "2px",
  position: "relative",
  userSelect: "none",
  transition: "background-color .12s, border-color .12s",
  "&:focus-visible": {
    outline: `2px solid ${colors.cyan}`,
    outlineOffset: "1px",
    zIndex: 1,
  },
} as const;

/** Base of the grid, under placed items so the plan never shows through them. */
const GRID_BASE = "#0a0d15";

/** A tinted fill laid over the opaque grid base (keeps labels readable over a plan). */
const fill = (color: string) => ({
  backgroundColor: GRID_BASE,
  backgroundImage: `linear-gradient(${color}, ${color})`,
});

/**
 * Single-line seat label that always fits its square: the size shrinks with
 * the label length (8 characters fit), anything longer (legacy labels) is
 * cut with an ellipsis. The full text stays in the title / accessible name.
 */
const labelText = (size: number, label: string) => {
  const n = Math.max(4, label.length);
  return {
    display: "block",
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    textAlign: "center",
    fontFamily: fonts.mono,
    fontSize: `clamp(6.5px, calc((100cqi - 3px) / ${(0.62 * n).toFixed(2)}), ${size}px)`,
    fontWeight: 700,
    lineHeight: 1.1,
  } as const;
};

/** Drop preview (valid = cyan, invalid = pink) and the item being moved. */
const previewSx = {
  ok: {
    outline: `2px solid ${colors.cyan}`,
    outlineOffset: "-2px",
    boxShadow: `inset 0 0 0 999px ${tint("cyan", 0.22)}`,
    zIndex: 2,
  },
  bad: {
    outline: `2px solid ${colors.pink}`,
    outlineOffset: "-2px",
    boxShadow: `inset 0 0 0 999px ${tint("pink", 0.22)}`,
    zIndex: 2,
  },
  source: { opacity: 0.45, borderStyle: "dashed" },
} as const;

type Active = { from: string; target: { col: number; row: number } };

/** Screen and entrance shapes of a room: group id -> its squares. */
function shapesOf(room: EditorRoom) {
  const out = new Map<number, GridCell[]>();
  for (const [k, c] of Object.entries(room.cells))
    if (isFeature(c)) out.set(c.g, [...(out.get(c.g) ?? []), parseKey(k)]);
  return out;
}

/** The square of a shape closest to `seat` (a side neighbour before a corner). */
function nearestSquare(cells: GridCell[], seat: GridCell) {
  const d = (c: GridCell) =>
    Math.abs(c.col - seat.col) + Math.abs(c.row - seat.row);
  return [...cells].sort((a, b) => d(a) - d(b))[0];
}

/** A small chain badge in a tile's top-right corner. */
const linkBadge = (
  <Box
    component="span"
    aria-hidden
    data-link-badge
    sx={{
      position: "absolute",
      top: "1px",
      right: "1px",
      display: "flex",
      color: colors.amber,
      "& svg": { fontSize: 11 },
      pointerEvents: "none",
    }}
  >
    <LinkSharp />
  </Box>
);

interface Press {
  pointerId: number;
  key: string;
  x: number;
  y: number;
  touch: boolean;
  /** May turn into a drag (always for mouse/pen; touch after a long press or with Move). */
  armed: boolean;
  timer?: number;
}

function previewFor(plan: MovePlan) {
  const out = new Map<string, "ok" | "bad" | "source">();
  if (plan.type === "none") return out;
  for (const k of plan.from) out.set(k, "source");
  for (const k of plan.to) out.set(k, plan.type === "blocked" ? "bad" : "ok");
  return out;
}

/** Layers that draw the uploaded plan behind the grid. */
function Background({ bg }: { bg: GridBackground }) {
  const layer = {
    position: "absolute",
    inset: "6px",
    zIndex: -1,
    pointerEvents: "none",
  } as const;
  const retro = bg.style === "retro";
  return (
    <>
      <Box
        component="img"
        src={bg.src}
        alt=""
        aria-hidden
        data-testid="room-background"
        sx={{
          ...layer,
          width: "calc(100% - 12px)",
          height: "calc(100% - 12px)",
          objectFit: "fill",
          opacity: bg.opacity / 100,
          filter: retro
            ? "grayscale(1) contrast(1.35) brightness(0.75)"
            : "none",
        }}
      />
      {retro && (
        <>
          <Box
            aria-hidden
            sx={{
              ...layer,
              background: colors.cyan,
              mixBlendMode: "color",
              opacity: 0.85,
            }}
          />
          <Box
            aria-hidden
            sx={{
              ...layer,
              background:
                "repeating-linear-gradient(0deg,rgba(6,7,11,0.35) 0,rgba(6,7,11,0.35) 1px,transparent 1px,transparent 3px)",
            }}
          />
        </>
      )}
    </>
  );
}

/** The 12-column editing grid. Cells are a roving-tabindex ARIA grid. */
export function EditorGrid({
  room,
  tool,
  sel,
  focus,
  onFocusChange,
  onActivate,
  onErase,
  onToolShortcut,
  onMove,
  onAnnounce,
  onMergePath,
  linking = null,
  onLinkPick,
  background,
  describedBy,
}: EditorGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const moveFocusRef = useRef(false);
  const dups = duplicateLabels(room);
  const placing = tool === "seat" || tool === "screen" || tool === "entrance";
  const canDrag = tool === "select" || tool === "move";
  const shapes = shapesOf(room);

  /** Picked up with the keyboard (M) or a tap with the Move tool. */
  const [picked, setPicked] = useState<(Active & { tool: Tool }) | null>(null);
  // A pick-up doesn't survive the item vanishing or the tool changing.
  const carry =
    picked && picked.tool === tool && room.cells[picked.from] ? picked : null;
  const setCarry = (a: Active | null) => setPicked(a && { ...a, tool });
  /** Squares crossed by a Merge drag. */
  const [mergeTrail, setMergeTrail] = useState<string[] | null>(null);
  const mergeRef = useRef<{ pointerId: number; path: string[] } | null>(null);
  /** Being dragged with a pointer. */
  const [drag, setDrag] = useState<Active | null>(null);
  const dragRef = useRef<Active | null>(null);
  const press = useRef<Press | null>(null);
  const suppressClick = useRef(false);

  const active = drag ?? carry;
  const plan = active ? planMove(room, active.from, active.target) : null;
  const preview = plan ? previewFor(plan) : new Map<string, string>();

  const focusCell = (pos: { col: number; row: number }) => {
    moveFocusRef.current = true;
    onFocusChange(pos);
  };

  const pickUp = (key: string) => {
    const cell = room.cells[key];
    if (!cell) return;
    setCarry({ from: key, target: parseKey(key) });
    onAnnounce(
      `Picked up ${itemName(cell, isFeature(cell) ? groupKeys(room, key).length : 1)}. Use the arrow keys to move it, Enter to drop it, Escape to cancel.`,
    );
  };

  const drop = (a: Active) => {
    setCarry(null);
    onMove(a.from, a.target);
  };

  const cancelCarry = () => {
    if (!carry) return;
    const cell = room.cells[carry.from];
    setCarry(null);
    focusCell(parseKey(carry.from));
    onAnnounce(
      cell
        ? `Move cancelled. The ${itemName(cell, isFeature(cell) ? groupKeys(room, carry.from).length : 1)} stays put.`
        : "Move cancelled.",
    );
  };

  // Pointer drag ---------------------------------------------------------------
  const endPress = () => {
    if (press.current?.timer) window.clearTimeout(press.current.timer);
    press.current = null;
  };

  const setDragState = (a: Active | null) => {
    dragRef.current = a;
    setDrag(a);
  };

  const cellAt = (x: number, y: number) => {
    const el = document
      .elementFromPoint?.(x, y)
      ?.closest<HTMLElement>("[data-cell]");
    if (!el || !gridRef.current?.contains(el)) return null;
    return parseKey(el.dataset.cell!);
  };

  const startDrag = (p: Press) => {
    setCarry(null);
    setDragState({ from: p.key, target: parseKey(p.key) });
    try {
      gridRef.current?.setPointerCapture?.(p.pointerId);
    } catch {
      // The pointer may already be gone; the drag still ends on pointerup.
    }
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || e.isPrimary === false) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-cell]");
    const key = el?.dataset.cell;
    if (tool === "merge" && key && isFeature(room.cells[key]) && !linking) {
      // No pointer capture yet: a plain tap must still reach the square as a
      // click. The drag captures once it reaches a second square.
      mergeRef.current = { pointerId: e.pointerId, path: [key] };
      return;
    }
    if (!canDrag || linking) return;
    if (!key || !room.cells[key]) return;
    endPress();
    const touch = e.pointerType === "touch";
    const p: Press = {
      pointerId: e.pointerId,
      key,
      x: e.clientX,
      y: e.clientY,
      touch,
      armed: !touch || tool === "move",
    };
    if (touch && !p.armed)
      p.timer = window.setTimeout(() => {
        if (press.current !== p) return;
        p.armed = true;
        navigator.vibrate?.(10);
        startDrag(p);
      }, LONG_PRESS_MS);
    press.current = p;
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const m = mergeRef.current;
    if (m && e.pointerId === m.pointerId) {
      const at = cellAt(e.clientX, e.clientY);
      if (!at) return;
      const k = cellKey(at.col, at.row);
      if (m.path.includes(k) || !isFeature(room.cells[k])) return;
      if (m.path.length === 1)
        try {
          gridRef.current?.setPointerCapture?.(e.pointerId);
        } catch {
          // Ignore: the merge still ends on pointerup.
        }
      m.path = [...m.path, k];
      setMergeTrail(m.path);
      return;
    }
    const p = press.current;
    if (!p || e.pointerId !== p.pointerId) return;
    if (!dragRef.current) {
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < DRAG_THRESHOLD) return;
      // A touch that moves before the long press is a scroll, not a drag.
      if (!p.armed) return endPress();
      startDrag(p);
    }
    const target = cellAt(e.clientX, e.clientY);
    const cur = dragRef.current;
    if (
      target &&
      cur &&
      (target.col !== cur.target.col || target.row !== cur.target.row)
    )
      setDragState({ ...cur, target });
  };

  const finishDrag = (dropIt: boolean) => {
    const a = dragRef.current;
    endPress();
    if (!a) return;
    setDragState(null);
    // The click that follows a drag must not also select / pick up.
    suppressClick.current = true;
    window.setTimeout(() => {
      suppressClick.current = false;
    }, 0);
    if (dropIt) {
      focusCell(a.target);
      onMove(a.from, a.target);
    } else onAnnounce("Move cancelled.");
  };

  const finishMerge = (apply: boolean) => {
    const m = mergeRef.current;
    mergeRef.current = null;
    setMergeTrail(null);
    if (!m || m.path.length < 2) return;
    suppressClick.current = true;
    window.setTimeout(() => {
      suppressClick.current = false;
    }, 0);
    if (apply) {
      focusCell(parseKey(m.path[m.path.length - 1]));
      onMergePath?.(m.path);
    } else onAnnounce("Merge cancelled.");
  };

  // Once a touch drag has started, stop the page from scrolling under it
  // (React's touch listeners are passive, so this one is added by hand).
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const onTouchMove = (e: TouchEvent) => {
      if (dragRef.current || press.current?.armed || mergeRef.current)
        e.preventDefault();
    };
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => el.removeEventListener("touchmove", onTouchMove);
  }, []);

  useEffect(() => () => endPress(), []);

  const onCellClick = (key: string, pos: { col: number; row: number }) => {
    onFocusChange(pos);
    if (linking) {
      onLinkPick?.(linking.candidates.includes(key) ? key : null);
      return;
    }
    if (tool !== "move") {
      setCarry(null);
      onActivate(key);
      return;
    }
    // Move tool: tap an item to pick it up, then tap where it goes.
    if (carry) {
      if (carry.from === key) cancelCarry();
      else drop({ from: carry.from, target: pos });
    } else if (room.cells[key]) pickUp(key);
  };

  useEffect(() => {
    if (!moveFocusRef.current) return;
    moveFocusRef.current = false;
    gridRef.current
      ?.querySelector<HTMLElement>(
        `[data-cell="${cellKey(focus.col, focus.row)}"]`,
      )
      ?.focus();
  }, [focus]);

  // Picking a seat for a screen: move keyboard focus to the first candidate.
  const linkingScreen = linking?.screen ?? null;
  useEffect(() => {
    if (!linkingScreen) return;
    gridRef.current
      ?.querySelector<HTMLElement>(
        `[data-cell="${cellKey(focus.col, focus.row)}"]`,
      )
      ?.focus();
    // Only when picking starts, not on every focus change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkingScreen]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>(
      "[data-cell]",
    );
    if (!target) return;
    const key = target.dataset.cell!;
    const [col, row] = key.split(",").map(Number);
    const plain = !e.ctrlKey && !e.metaKey && !e.altKey;

    if (drag) {
      if (e.key === "Escape") {
        e.preventDefault();
        finishDrag(false);
      }
      return;
    }

    if (linking) {
      if (e.key === "Escape") {
        e.preventDefault();
        onLinkPick?.(null);
        return;
      }
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onLinkPick?.(linking.candidates.includes(key) ? key : null);
        return;
      }
    }

    if (carry) {
      if (e.key === "Escape") {
        e.preventDefault();
        cancelCarry();
        return;
      }
      if (
        e.key === "Enter" ||
        e.key === " " ||
        (plain && e.key.toLowerCase() === "m")
      ) {
        e.preventDefault();
        drop(carry);
        return;
      }
      const next = moveFocus(
        carry.target,
        e.key,
        room.rows,
        e.ctrlKey || e.metaKey,
      );
      if (next) {
        e.preventDefault();
        const nextCarry = { ...carry, target: next };
        setCarry(nextCarry);
        focusCell(next);
        onAnnounce(describePlan(room, planMove(room, carry.from, next)));
      }
      return;
    }

    if (plain && e.key.toLowerCase() === "m" && room.cells[key]) {
      e.preventDefault();
      pickUp(key);
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (tool === "move") {
        if (room.cells[key]) pickUp(key);
        else
          onAnnounce(
            "Nothing to move here. Pick up a seat, screen or entrance first.",
          );
        return;
      }
      onActivate(key);
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      onErase(key);
      return;
    }
    if (plain && e.key.length === 1) {
      const t = toolForShortcut(e.key);
      if (t) {
        e.preventDefault();
        onToolShortcut(t);
        return;
      }
    }
    const next = moveFocus(
      { col, row },
      e.key,
      room.rows,
      e.ctrlKey || e.metaKey,
    );
    if (next) {
      e.preventDefault();
      moveFocusRef.current = true;
      onFocusChange(next);
    }
  };

  const selCell = sel ? room.cells[sel] : undefined;
  const selGroup =
    isFeature(selCell) && sel ? new Set(groupKeys(room, sel)) : new Set();
  // Merge tool: squares that would join the selected shape.
  const mergeable = new Set<string>();
  if (tool === "merge" && isFeature(selCell)) {
    for (const k of selGroup as Set<string>) {
      const { col, row } = parseKey(k);
      for (const n of [
        cellKey(col - 1, row),
        cellKey(col + 1, row),
        cellKey(col, row - 1),
        cellKey(col, row + 1),
      ]) {
        const c = room.cells[n];
        if (isFeature(c) && c.t === selCell.t && c.g !== selCell.g)
          mergeable.add(n);
      }
    }
  }
  const trail = new Set(mergeTrail ?? []);
  const candidates = new Set(linking?.candidates ?? []);

  // Links: which square of each linked screen shows the badge and connector.
  const links = Object.entries(room.links).flatMap(([g, seatKey]) => {
    const cells = shapes.get(Number(g));
    if (!cells?.length || room.cells[seatKey]?.t !== "seat") return [];
    const seat = parseKey(seatKey);
    const sq = nearestSquare(cells, seat);
    return [{ g: Number(g), seat, square: sq }];
  });
  const badgeSquares = new Set(
    links.map((l) => cellKey(l.square.col, l.square.row)),
  );

  const rows: React.ReactNode[] = [];
  for (let y = 0; y < room.rows; y++) {
    const cells: React.ReactNode[] = [];
    for (let x = 0; x < GRID_COLS; x++) {
      const k = cellKey(x, y);
      const cell = room.cells[k];
      const isFocus = focus.col === x && focus.row === y;
      const dropState = preview.get(k);
      const dropSx: React.CSSProperties = dropState
        ? previewSx[dropState as keyof typeof previewSx]
        : {};
      // Items can be dragged: with Move a touch drags at once (no scrolling
      // from them), with Select a touch scrolls unless held first; with
      // Merge a drag across squares joins them.
      const dragSx: React.CSSProperties =
        cell && canDrag
          ? {
              cursor: drag ? "grabbing" : "grab",
              touchAction: tool === "move" ? "none" : "manipulation",
              WebkitTouchCallout: "none",
            }
          : isFeature(cell) && tool === "merge"
            ? { touchAction: "none", WebkitTouchCallout: "none" }
            : {};
      const candidate = candidates.has(k);
      const hintSx =
        candidate || mergeable.has(k) || trail.has(k)
          ? {
              outline: `2px dashed ${candidate ? colors.amber : colors.cyan}`,
              outlineOffset: "-4px",
              zIndex: 2,
            }
          : {};
      // `key` must be passed directly, not inside a spread (React warns).
      const common = {
        role: "gridcell",
        "data-cell": k,
        "data-drop": dropState,
        "data-candidate": candidate
          ? "link"
          : mergeable.has(k)
            ? "merge"
            : undefined,
        tabIndex: isFocus ? 0 : -1,
        "aria-label": `${cellLabel(room, k)}${candidate ? ", can be linked" : ""}`,
        onClick: () => onCellClick(k, { col: x, row: y }),
      };
      if (!cell) {
        cells.push(
          <Box
            key={k}
            {...common}
            sx={{
              ...tile,
              border: `1px dashed ${tint("cyan", 0.08)}`,
              cursor: placing || carry ? "crosshair" : "default",
              "&:hover": {
                borderColor: tint("cyan", 0.5),
                backgroundColor: tint("cyan", 0.06),
              },
              ...dropSx,
            }}
          />,
        );
      } else if (cell.t === "seat") {
        const selected = sel === k;
        const who = cell.reservedBy;
        const dup = dups.has(cell.label);
        const screened = screensLinkedTo(room, k).length > 0;
        cells.push(
          <Box
            key={k}
            {...common}
            aria-selected={selected}
            aria-label={`${cellLabel(room, k)}${candidate ? ", can be linked" : ""}${dup ? ", duplicate label" : ""}`}
            title={[
              cell.label,
              cell.name?.trim(),
              cell.description?.trim(),
              screened ? "With screen" : "",
              who ? `Reserved by ${reserverName(who)}` : "",
            ]
              .filter(Boolean)
              .join(" · ")}
            sx={{
              ...tile,
              cursor: "pointer",
              ...dragSx,
              ...(selected
                ? {
                    border: `1px solid ${colors.text}`,
                    backgroundColor: colors.cyan,
                    backgroundImage: "none",
                    color: colors.ink,
                    boxShadow: effects.glow,
                  }
                : who
                  ? {
                      border: "1px solid rgba(165,139,255,0.6)",
                      ...fill(tint("violet", 0.16)),
                      color: colors.violetText,
                      "&:hover": { ...fill(tint("violet", 0.3)) },
                    }
                  : {
                      border: `1px solid ${colors.cyan}`,
                      ...fill(tint("cyan", 0.07)),
                      color: colors.cyan,
                      "&:hover": { ...fill(tint("cyan", 0.18)) },
                    }),
              ...(dup && !selected
                ? { borderColor: colors.pink, borderStyle: "dashed" }
                : {}),
              ...(linking && !candidate ? { opacity: 0.55 } : {}),
              ...hintSx,
              ...dropSx,
            }}
          >
            {screened && linkBadge}
            {who && (
              <UserAvatar
                name={reserverName(who)}
                src={who.avatarUrl}
                size={18}
              />
            )}
            <Box
              component="span"
              sx={labelText(who ? 10 : selected ? 11 : 12, cell.label || "?")}
            >
              {cell.label || "?"}
            </Box>
          </Box>,
        );
      } else {
        const screen = cell.t === "screen";
        const Icon = screen ? TvSharp : DoorFrontSharp;
        const squares = shapes.get(cell.g) ?? [{ col: x, row: y }];
        const inSel = selGroup.has(k);
        const border = inSel
          ? colors.text
          : screen
            ? "rgba(165,139,255,0.6)"
            : tint("lime", 0.6);
        cells.push(
          <Box
            key={k}
            {...common}
            aria-selected={inSel}
            data-group={cell.g}
            sx={{
              ...tile,
              overflow: "visible",
              padding: 0,
              cursor: "pointer",
              ...dragSx,
              ...(screen
                ? {
                    ...fill(tint("violet", inSel ? 0.42 : 0.28)),
                    color: colors.violetText,
                  }
                : {
                    ...fill(tint("lime", inSel ? 0.32 : 0.2)),
                    color: colors.lime,
                  }),
              ...shapeSquareSx(
                squareEdges(squares, { col: x, row: y }),
                GAP,
                border,
              ),
              ...(inSel ? { zIndex: 1 } : {}),
              ...(linking
                ? { opacity: linking.screen && selGroup.has(k) ? 1 : 0.55 }
                : {}),
              ...hintSx,
              ...dropSx,
            }}
          >
            {badgeSquares.has(k) && linkBadge}
            {squares.length === 1 && <Icon aria-hidden sx={{ fontSize: 16 }} />}
          </Box>,
        );
      }
    }
    rows.push(
      <Box
        key={y}
        role="row"
        aria-rowindex={y + 1}
        sx={{ display: "contents" }}
      >
        {cells}
      </Box>,
    );
  }

  // Labels of merged shapes ("SCREEN" with its icon on the longest run).
  const labels: React.ReactNode[] = [];
  for (const [g, cells] of shapes) {
    if (cells.length < 2) continue;
    const kind = (
      room.cells[cellKey(cells[0].col, cells[0].row)] as FeatureCell
    ).t;
    const run = labelRun(cells);
    const Icon = kind === "screen" ? TvSharp : DoorFrontSharp;
    labels.push(
      <Box
        key={`label-${g}`}
        aria-hidden
        data-shape-label={kind}
        sx={{
          position: "absolute",
          inset: 0,
          gridColumn: `${run.col + 1} / span ${run.vertical ? 1 : run.span}`,
          gridRow: `${run.row + 1} / span ${run.vertical ? run.span : 1}`,
          zIndex: 3,
          pointerEvents: "none",
          display: "flex",
          flexDirection: run.vertical ? "column" : "row",
          alignItems: "center",
          justifyContent: "center",
          gap: "5px",
          overflow: "hidden",
          color: kind === "screen" ? colors.violetText : colors.lime,
          fontFamily: fonts.mono,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          whiteSpace: "nowrap",
        }}
      >
        <Icon sx={{ fontSize: 16, flex: "none" }} />
        <Box
          component="span"
          sx={{
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            ...(run.vertical ? { writingMode: "vertical-rl" } : {}),
          }}
        >
          {kind === "screen" ? "Screen" : "Entrance"}
        </Box>
      </Box>,
    );
  }

  // Thin connectors between linked screens and their seats.
  const connectors = links.map(({ g, seat, square }) => {
    const dc = seat.col - square.col;
    const dr = seat.row - square.row;
    const angle = dr === 0 ? 0 : dc === 0 ? 90 : dc === dr ? 45 : -45;
    const diagonal = dc !== 0 && dr !== 0;
    return (
      <Box
        key={`link-${g}`}
        aria-hidden
        data-link-connector
        sx={{
          position: "absolute",
          inset: 0,
          gridColumn: `${Math.min(seat.col, square.col) + 1} / span ${Math.abs(dc) + 1}`,
          gridRow: `${Math.min(seat.row, square.row) + 1} / span ${Math.abs(dr) + 1}`,
          zIndex: 3,
          pointerEvents: "none",
          "&::after": {
            content: '""',
            position: "absolute",
            left: "50%",
            top: "50%",
            width: diagonal ? "26px" : "18px",
            height: "2px",
            backgroundColor: colors.amber,
            boxShadow: `0 0 0 1px ${GRID_BASE}`,
            transform: `translate(-50%, -50%) rotate(${angle}deg)`,
          },
        }}
      />
    );
  });

  return (
    <Box sx={{ overflowX: "auto", padding: "12px 14px 14px" }}>
      <Box
        ref={gridRef}
        role="grid"
        aria-label={`${room.name.trim() || "Room"} floor plan, ${GRID_COLS} columns by ${room.rows} rows`}
        aria-describedby={describedBy}
        aria-rowcount={room.rows}
        aria-colcount={GRID_COLS}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => {
          if (e.pointerId === mergeRef.current?.pointerId) finishMerge(true);
          if (e.pointerId === press.current?.pointerId) finishDrag(true);
        }}
        onPointerCancel={(e) => {
          if (e.pointerId === mergeRef.current?.pointerId) finishMerge(false);
          if (e.pointerId === press.current?.pointerId) finishDrag(false);
        }}
        onLostPointerCapture={(e) => {
          // Only the grid's own capture: a touch's implicit capture on the
          // first square is released (and bubbles here) when the grid takes over.
          if (
            e.target === e.currentTarget &&
            e.pointerId === mergeRef.current?.pointerId
          )
            finishMerge(true);
          if (dragRef.current && e.pointerId === press.current?.pointerId)
            finishDrag(true);
        }}
        onClickCapture={(e) => {
          if (!suppressClick.current) return;
          suppressClick.current = false;
          e.stopPropagation();
          e.preventDefault();
        }}
        // Avatars are images: a native image drag would cancel the pointer drag.
        onDragStart={(e) => e.preventDefault()}
        onContextMenu={(e) => {
          // Long-pressing a seat on touch picks it up, not the browser menu.
          if (press.current?.touch || dragRef.current || mergeRef.current)
            e.preventDefault();
        }}
        onBlur={(e) => {
          // Leaving the grid puts a picked-up item back (focus stays put).
          if (
            carry &&
            !e.currentTarget.contains(e.relatedTarget as Node | null)
          ) {
            setCarry(null);
            onAnnounce("Move cancelled.");
          }
        }}
        sx={{
          position: "relative",
          isolation: "isolate",
          minWidth: 528,
          display: "grid",
          gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))`,
          gap: `${GAP}px`,
          padding: "6px",
          backgroundColor: GRID_BASE,
          border: `1px solid ${hairline.soft}`,
        }}
      >
        {background && <Background bg={background} />}
        <Box
          aria-hidden
          sx={{
            position: "absolute",
            inset: 0,
            zIndex: -1,
            pointerEvents: "none",
            backgroundImage: `linear-gradient(${hairline.faint} 1px, transparent 1px), linear-gradient(90deg, ${hairline.faint} 1px, transparent 1px)`,
            backgroundSize: `${100 / GRID_COLS}% ${100 / room.rows}%`,
          }}
        />
        {rows}
        {labels}
        {connectors}
      </Box>
    </Box>
  );
}

export default EditorGrid;
