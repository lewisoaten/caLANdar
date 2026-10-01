import * as React from "react";
import { useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import TvSharp from "@mui/icons-material/TvSharp";
import DoorFrontSharp from "@mui/icons-material/DoorFrontSharp";
import { UserAvatar, colors, effects, fonts, hairline, tint } from "../hl";
import {
  GRID_COLS,
  cellKey,
  cellLabel,
  describePlan,
  duplicateLabels,
  itemName,
  moveFocus,
  parseKey,
  planMove,
  reserverName,
  toolForShortcut,
  type BackgroundStyle,
  type EditorRoom,
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
  background: GridBackground | null;
  /** id of the element describing the tool and keyboard help. */
  describedBy?: string;
}

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
 * Single-line desk label that always fits its square: the size shrinks with
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
  background,
  describedBy,
}: EditorGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const moveFocusRef = useRef(false);
  const dups = duplicateLabels(room);
  const placing = tool !== "select" && tool !== "move";
  const canDrag = tool === "select" || tool === "move";

  /** Picked up with the keyboard (M) or a tap with the Move tool. */
  const [picked, setCarry] = useState<Active | null>(null);
  // A pick-up doesn't survive the item vanishing or the tool changing.
  const carry = picked && canDrag && room.cells[picked.from] ? picked : null;
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
      `Picked up ${itemName(cell)}. Use the arrow keys to move it, Enter to drop it, Escape to cancel.`,
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
        ? `Move cancelled. The ${itemName(cell)} stays put.`
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
    if (!canDrag || e.button !== 0 || e.isPrimary === false) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-cell]");
    const key = el?.dataset.cell;
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

  // Once a touch drag has started, stop the page from scrolling under it
  // (React's touch listeners are passive, so this one is added by hand).
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const onTouchMove = (e: TouchEvent) => {
      if (dragRef.current || press.current?.armed) e.preventDefault();
    };
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => el.removeEventListener("touchmove", onTouchMove);
  }, []);

  useEffect(() => () => endPress(), []);

  const onCellClick = (key: string, pos: { col: number; row: number }) => {
    onFocusChange(pos);
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
            "Nothing to move here. Pick up a desk, screen or entrance first.",
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
      // from them), with Select a touch scrolls unless held first.
      const dragSx: React.CSSProperties =
        cell && canDrag
          ? {
              cursor: drag ? "grabbing" : "grab",
              touchAction: tool === "move" ? "none" : "manipulation",
              WebkitTouchCallout: "none",
            }
          : {};
      // `key` must be passed directly, not inside a spread (React warns).
      const common = {
        role: "gridcell",
        "data-cell": k,
        "data-drop": dropState,
        tabIndex: isFocus ? 0 : -1,
        "aria-label": cellLabel(cell, k),
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
      } else if (cell.t === "desk") {
        const selected = sel === k;
        const who = cell.reservedBy;
        const dup = dups.has(cell.label);
        cells.push(
          <Box
            key={k}
            {...common}
            aria-selected={selected}
            aria-label={`${cellLabel(cell, k)}${dup ? ", duplicate label" : ""}`}
            title={[
              cell.label,
              cell.description?.trim(),
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
              ...dropSx,
            }}
          >
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
        cells.push(
          <Box
            key={k}
            {...common}
            sx={{
              ...tile,
              padding: 0,
              cursor: "pointer",
              ...dragSx,
              ...(screen
                ? {
                    border: "1px solid rgba(165,139,255,0.5)",
                    ...fill(tint("violet", 0.28)),
                    color: colors.violetText,
                  }
                : {
                    border: `1px solid ${tint("lime", 0.6)}`,
                    ...fill(tint("lime", 0.2)),
                    color: colors.lime,
                  }),
              ...dropSx,
            }}
          >
            <Icon aria-hidden sx={{ fontSize: 16 }} />
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
          if (e.pointerId === press.current?.pointerId) finishDrag(true);
        }}
        onPointerCancel={(e) => {
          if (e.pointerId === press.current?.pointerId) finishDrag(false);
        }}
        onLostPointerCapture={(e) => {
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
          // Long-pressing a desk on touch picks it up, not the browser menu.
          if (press.current?.touch || dragRef.current) e.preventDefault();
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
          gap: "3px",
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
      </Box>
    </Box>
  );
}

export default EditorGrid;
