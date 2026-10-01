import * as React from "react";
import { useEffect, useRef } from "react";
import Box from "@mui/material/Box";
import type { SxProps, Theme } from "@mui/material/styles";
import TvSharp from "@mui/icons-material/TvSharp";
import DoorFrontSharp from "@mui/icons-material/DoorFrontSharp";
import { UserAvatar, colors, effects, fonts, hairline, tint } from "../hl";
import {
  GRID_COLS,
  cellKey,
  cellLabel,
  duplicateLabels,
  moveFocus,
  reserverName,
  toolForShortcut,
  type BackgroundStyle,
  type EditorRoom,
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
  background: GridBackground | null;
  /** id of the element describing the tool and keyboard help. */
  describedBy?: string;
}

const tile: SxProps<Theme> = {
  aspectRatio: "1",
  minWidth: 0,
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
};

/** Base of the grid, under placed items so the plan never shows through them. */
const GRID_BASE = "#0a0d15";

/** A tinted fill laid over the opaque grid base (keeps labels readable over a plan). */
const fill = (color: string) => ({
  backgroundColor: GRID_BASE,
  backgroundImage: `linear-gradient(${color}, ${color})`,
});

const labelText = (size: number) => ({
  fontFamily: fonts.mono,
  fontSize: size,
  fontWeight: 700,
  lineHeight: 1,
});

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
  background,
  describedBy,
}: EditorGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const moveFocusRef = useRef(false);
  const dups = duplicateLabels(room);
  const placing = tool !== "select";

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
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onActivate(key);
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      onErase(key);
      return;
    }
    if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1) {
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
      // `key` must be passed directly, not inside a spread (React warns).
      const common = {
        role: "gridcell",
        "data-cell": k,
        tabIndex: isFocus ? 0 : -1,
        "aria-label": cellLabel(cell, k),
        onClick: () => {
          onFocusChange({ col: x, row: y });
          onActivate(k);
        },
      };
      if (!cell) {
        cells.push(
          <Box
            key={k}
            {...common}
            sx={{
              ...tile,
              border: `1px dashed ${tint("cyan", 0.08)}`,
              cursor: placing ? "crosshair" : "default",
              "&:hover": {
                borderColor: tint("cyan", 0.5),
                backgroundColor: tint("cyan", 0.06),
              },
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
            title={who ? reserverName(who) : undefined}
            sx={{
              ...tile,
              cursor: "pointer",
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
            }}
          >
            {who && (
              <UserAvatar
                name={reserverName(who)}
                src={who.avatarUrl}
                size={18}
              />
            )}
            <Box component="span" sx={labelText(who ? 10 : selected ? 11 : 12)}>
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
