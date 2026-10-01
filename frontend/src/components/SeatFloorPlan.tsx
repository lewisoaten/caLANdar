import * as React from "react";
import Box from "@mui/material/Box";
import type { SxProps, Theme } from "@mui/material/styles";
import TvSharp from "@mui/icons-material/TvSharp";
import DoorFrontSharp from "@mui/icons-material/DoorFrontSharp";
import { UserAvatar, colors, effects, fonts, srOnly, tint } from "./hl";
import { displayCallsign } from "../utils/callsign";
import { seatHeading, seatSpokenName } from "../utils/seatName";
import {
  GRID_COLS,
  joinNames,
  labelRun,
  layoutRoom,
  nextSeatInDirection,
  roomBackground,
  screenSeatLinks,
  sortByCell,
  squareEdges,
  type ArrowKey,
  type FeatureGroup,
  type FloorPlanRoom,
  type FloorPlanSeat,
  type SquareEdges,
} from "./seatFloorPlanModel";

/** How a seat is drawn: yours (lime), free (cyan outline), taken (violet), selected (cyan + glow). */
export type SeatState = "mine" | "free" | "taken" | "selected";

export interface SeatOccupant {
  name: string | null;
  avatarUrl?: string | null;
}

/** A seat on the plan with how to draw it. */
export interface SeatTile {
  seat: FloorPlanSeat;
  state: SeatState;
  /**
   * People on this seat. For `taken` seats they are shown on the tile; for
   * `mine` the first one is you; on `free` seats they share it at other times.
   */
  occupants?: SeatOccupant[];
  /** Second line on the tile (defaults per state: YOU / name / SELECTED / FREE). */
  sub?: string;
  /** Accessible name override (defaults to label + state). */
  ariaLabel?: string;
  /** Not selectable. `taken` seats are always disabled. */
  disabled?: boolean;
}

export interface SeatFloorPlanProps {
  room: FloorPlanRoom;
  /** The room's seats and their state. */
  seats?: SeatTile[];
  /** Called when a selectable seat is activated (click, Enter or Space). */
  onSeatSelect?: (seat: FloorPlanSeat) => void;
  /** Accessible name for the plan, e.g. "Main Hall floor plan". */
  label: string;
  /**
   * Free/selected seats toggle a selection: expose it with `aria-pressed`.
   * Turn off for read-only plans.
   */
  selectable?: boolean;
  /** Minimum cell edge in px; below it the plan scrolls sideways. */
  minCellSize?: number;
  sx?: SxProps<Theme>;
}

const who = (o: SeatOccupant) => displayCallsign(o.name);

const GAP = 4;
const PAD = 6;

/**
 * Default accessible name of a seat. `withScreen` adds that a screen is
 * linked to it ("A1, with screen, taken by Nia").
 */
export function seatAriaLabel(tile: SeatTile, withScreen = false): string {
  const { seat, state, occupants = [] } = tile;
  const names = joinNames(occupants.map(who));
  // "S1, Wall sofa (S), Window seat next to the fridge, free"
  const name = `${seatSpokenName(seat)}${withScreen ? ", with screen" : ""}`;
  switch (state) {
    case "mine":
      return `${name}, your seat`;
    case "taken":
      return `${name}, taken${names ? ` by ${names}` : ""}`;
    case "selected":
      return `${name}, selected`;
    default:
      return `${name}, free${names ? `, shared with ${names} at other times` : ""}`;
  }
}

/** Tooltip of a seat: name and identifier, description and who sits there. */
export function seatTitle(tile: SeatTile, withScreen = false): string {
  const occupants = tile.occupants ?? [];
  return [
    seatHeading(tile.seat),
    tile.seat.description?.trim(),
    withScreen ? "With screen" : "",
    tile.state === "taken" && occupants.length > 0
      ? joinNames(occupants.map(who))
      : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Seat label size: the usual `clamp(10px, 1.6cqi, 16px)`, shrunk for longer
 * identifiers so up to 8 characters fit one cell (the plan is the `cqi`
 * container; a cell is about 100cqi / 12 wide). Longer legacy labels get an
 * ellipsis; the full text is in the title and accessible name.
 */
export function labelFontSize(label: string, withAvatar = false): string {
  const n = Math.max(4, label.length);
  const room = withAvatar ? "100cqi / 12 - 36px" : "100cqi / 12 - 13px";
  return `clamp(7px, min(1.6cqi, calc((${room}) / ${(0.62 * n).toFixed(2)})), 16px)`;
}

/** Default second line of a seat tile. */
export function seatSubLabel(tile: SeatTile): string {
  const occupants = tile.occupants ?? [];
  switch (tile.state) {
    case "mine":
      return "YOU";
    case "selected":
      return "SELECTED";
    case "taken":
      if (occupants.length === 0) return "TAKEN";
      return occupants.length > 1
        ? `${who(occupants[0])} +${occupants.length - 1}`
        : who(occupants[0]);
    default:
      return occupants.length > 0 ? "SHARED" : "FREE";
  }
}

/** Base of the plan, under seats and features so a background never shows through them. */
const GRID_BASE = "#0a0d15";

/**
 * A tinted fill laid over the opaque grid base: keeps seat labels readable
 * (>= 4.5:1) over any background plan, e.g. the cyan "retro" treatment.
 * Same treatment as the room editor's tiles.
 */
const fill = (color: string) => ({
  backgroundColor: GRID_BASE,
  backgroundImage: `linear-gradient(${color}, ${color})`,
});

const tileStyles: Record<SeatState, Record<string, unknown>> = {
  mine: {
    border: `1px solid ${colors.lime}`,
    backgroundColor: colors.lime,
    color: colors.ink,
    boxShadow: `0 0 24px -4px ${tint("lime", 0.7)}`,
  },
  selected: {
    border: `1px solid ${colors.text}`,
    backgroundColor: colors.cyan,
    color: colors.ink,
    boxShadow: effects.glow,
  },
  taken: {
    border: "1px solid rgba(165,139,255,0.5)",
    ...fill(tint("violet", 0.18)),
    color: colors.violetText,
  },
  free: {
    border: `1px solid ${colors.cyan}`,
    ...fill(tint("cyan", 0.06)),
    color: colors.cyan,
  },
};

/**
 * Styles for one square of a screen / entrance shape (see `squareEdges`):
 * outline on the outer edges only, and bridges (`::before` right, `::after`
 * down) that fill the grid gap towards the shape's other squares, so an L or
 * a 2x2 block reads as one piece. The square's background must be set too;
 * the bridges inherit it. Shared with the room editor.
 */
export function shapeSquareSx(
  edges: SquareEdges,
  gap: number,
  border: string,
  style: "solid" | "dashed" = "solid",
) {
  const side = (on: boolean) => `1px ${style} ${on ? border : "transparent"}`;
  const bridge = {
    content: '""',
    position: "absolute",
    boxSizing: "border-box",
    background: "inherit",
  } as const;
  return {
    position: "relative",
    boxSizing: "border-box",
    borderTop: side(edges.top),
    borderRight: side(edges.right),
    borderBottom: side(edges.bottom),
    borderLeft: side(edges.left),
    ...(edges.bridgeRight
      ? {
          "&::before": {
            ...bridge,
            left: "calc(100% + 1px)",
            top: "-1px",
            width: `${gap}px`,
            height: "calc(100% + 2px)",
            borderTop: side(edges.bridgeRight.top),
            borderBottom: side(edges.bridgeRight.bottom),
          },
        }
      : {}),
    ...(edges.bridgeDown
      ? {
          "&::after": {
            ...bridge,
            top: "calc(100% + 1px)",
            left: "-1px",
            width: edges.bridgeDown.wide
              ? `calc(100% + 2px + ${gap}px)`
              : "calc(100% + 2px)",
            height: `${gap}px`,
            borderLeft: side(edges.bridgeDown.left),
            borderRight: side(edges.bridgeDown.right),
          },
        }
      : {}),
  } as const;
}

/** How a screen is drawn: plain (not linked) or the state of its seat. */
export type ScreenLook = "plain" | SeatState;

interface ShapeStyle {
  border: string;
  style: "solid" | "dashed";
  fill: Record<string, string>;
  color: string;
}

const screenStyles: Record<ScreenLook, ShapeStyle> = {
  plain: {
    border: "rgba(165,139,255,0.5)",
    style: "solid",
    fill: fill(tint("violet", 0.12)),
    color: colors.violetText,
  },
  // Linked to a free seat: an empty violet outline, the screen is up for grabs.
  free: {
    border: colors.violetLight,
    style: "dashed",
    fill: fill(tint("violet", 0.04)),
    color: colors.textMuted,
  },
  // Clearly fuller than a plain screen, like the seat it belongs to.
  taken: {
    border: colors.violetLight,
    style: "solid",
    fill: fill(tint("violet", 0.36)),
    color: colors.text,
  },
  mine: {
    border: colors.lime,
    style: "solid",
    fill: { backgroundColor: colors.lime, backgroundImage: "none" },
    color: colors.ink,
  },
  selected: {
    border: colors.text,
    style: "solid",
    fill: { backgroundColor: colors.cyan, backgroundImage: "none" },
    color: colors.ink,
  },
};

const entranceStyle: ShapeStyle = {
  border: tint("lime", 0.6),
  style: "solid",
  fill: fill(tint("lime", 0.12)),
  color: colors.lime,
};

export const FEATURE_NAMES = {
  screen: "Screen",
  entrance: "Entrance",
} as const;

/** Grid squares of one screen / entrance, drawn as one shape. */
function FeatureShape({
  group,
  look,
  occupant,
}: {
  group: FeatureGroup;
  look: ScreenLook;
  /** Shown on a taken / your screen when it has room (2+ squares). */
  occupant?: SeatOccupant;
}) {
  const screen = group.kind === "screen";
  const st = screen ? screenStyles[look] : entranceStyle;
  const name = FEATURE_NAMES[group.kind];
  const Icon = screen ? TvSharp : DoorFrontSharp;
  const run = labelRun(group.cells);
  const big = group.cells.length >= 2;
  return (
    <>
      {group.cells.map((c) => (
        <Box
          key={`${c.col},${c.row}`}
          aria-hidden="true"
          data-feature={group.kind}
          data-square={`${c.col},${c.row}`}
          data-look={screen ? look : undefined}
          sx={{
            gridColumn: c.col + 1,
            gridRow: c.row + 1,
            minWidth: 0,
            ...st.fill,
            ...shapeSquareSx(
              squareEdges(group.cells, c),
              GAP,
              st.border,
              st.style,
            ),
          }}
        />
      ))}
      <Box
        data-feature-label={group.kind}
        sx={{
          gridColumn: `${run.col + 1} / span ${run.vertical ? 1 : run.span}`,
          gridRow: `${run.row + 1} / span ${run.vertical ? run.span : 1}`,
          zIndex: 1,
          minWidth: 0,
          minHeight: 0,
          pointerEvents: "none",
          display: "flex",
          flexDirection: run.vertical ? "column" : "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 0.75,
          overflow: "hidden",
          color: st.color,
          fontFamily: fonts.mono,
          fontSize: "clamp(9px, 1.1cqi, 11px)",
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          whiteSpace: "nowrap",
          "& svg": { fontSize: "clamp(14px, 1.8cqi, 20px)", flex: "none" },
        }}
      >
        {big && occupant && (look === "taken" || look === "mine") && (
          <UserAvatar
            name={occupant.name}
            src={occupant.avatarUrl}
            size={18}
            sx={{
              flex: "none",
              width: "clamp(14px, 1.8cqi, 20px)",
              height: "clamp(14px, 1.8cqi, 20px)",
              fontSize: "clamp(7px, 0.8cqi, 9px)",
            }}
          />
        )}
        <Icon aria-hidden="true" />
        {big ? (
          <Box
            component="span"
            sx={{
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              ...(run.vertical ? { writingMode: "vertical-rl" } : {}),
            }}
          >
            {name}
          </Box>
        ) : (
          <Box component="span" sx={srOnly}>
            {name}
          </Box>
        )}
      </Box>
    </>
  );
}

function BackgroundLayers({ room }: { room: FloorPlanRoom }) {
  const bg = roomBackground(room);
  if (!bg) return null;
  const inset = {
    position: "absolute",
    top: PAD,
    left: PAD,
    right: PAD,
    bottom: PAD,
    zIndex: -1,
    pointerEvents: "none",
  } as const;
  return (
    <>
      <Box
        component="img"
        src={bg.url}
        alt=""
        aria-hidden="true"
        sx={{
          ...inset,
          width: `calc(100% - ${PAD * 2}px)`,
          height: `calc(100% - ${PAD * 2}px)`,
          objectFit: "fill",
          display: "block",
          opacity: bg.opacity,
          filter:
            bg.style === "retro"
              ? "grayscale(1) contrast(1.35) brightness(0.75)"
              : undefined,
        }}
      />
      {bg.style === "retro" && (
        <>
          <Box
            aria-hidden="true"
            sx={{
              ...inset,
              backgroundColor: colors.cyan,
              mixBlendMode: "color",
              opacity: 0.85,
            }}
          />
          <Box
            aria-hidden="true"
            sx={{
              ...inset,
              background:
                "repeating-linear-gradient(0deg,rgba(6,7,11,0.35) 0,rgba(6,7,11,0.35) 1px,transparent 1px,transparent 3px)",
            }}
          />
        </>
      )}
    </>
  );
}

/**
 * A room drawn as a graphical floor plan: grid backdrop, optional background
 * plan, screen/entrance shapes and one button per seat. Seats follow their
 * grid cell (legacy seats are placed from x/y). Tab moves through selectable
 * seats in reading order; the arrow keys jump to the nearest seat in that
 * direction. Scrolls sideways when narrower than `minCellSize` per column.
 * A screen linked to a seat shows that seat's state (free, taken, yours);
 * screens are decorative, the linked seat's name says "with screen".
 */
const NO_SEATS: SeatTile[] = [];

export function SeatFloorPlan({
  room,
  seats: tiles = NO_SEATS,
  onSeatSelect,
  label,
  selectable = true,
  minCellSize = 44,
  sx,
}: SeatFloorPlanProps) {
  const seats = React.useMemo(() => tiles.map((d) => d.seat), [tiles]);
  const layout = React.useMemo(() => layoutRoom(room, seats), [room, seats]);
  const ordered = React.useMemo(
    () =>
      sortByCell(
        tiles.map((d) => ({ ...d, id: d.seat.id })),
        layout.cells,
      ),
    [tiles, layout],
  );
  const links = React.useMemo(() => screenSeatLinks(layout), [layout]);
  const withScreen = React.useMemo(() => new Set(links.values()), [links]);
  const buttons = React.useRef(new Map<number, HTMLButtonElement>());

  const isEnabled = (d: SeatTile) =>
    d.state !== "taken" && !d.disabled && Boolean(onSeatSelect);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!e.key.startsWith("Arrow")) return;
    const target = e.target as HTMLElement;
    const id = Number(target.dataset?.seatId);
    if (!Number.isFinite(id)) return;
    const nav = ordered
      .filter((d) => isEnabled(d) || d.seat.id === id)
      .map((d) => ({ id: d.seat.id, ...layout.cells.get(d.seat.id)! }));
    const next = nextSeatInDirection(nav, id, e.key as ArrowKey);
    e.preventDefault();
    if (next !== null) buttons.current.get(next)?.focus();
  };

  // On narrow screens the plan scrolls: bring your seat (or the pick) into view.
  const scroller = React.useRef<HTMLDivElement | null>(null);
  const focusId =
    tiles.find((d) => d.state === "mine")?.seat.id ??
    tiles.find((d) => d.state === "selected")?.seat.id;
  React.useEffect(() => {
    const el = scroller.current;
    if (!el || focusId === undefined || el.scrollWidth <= el.clientWidth)
      return;
    const btn = buttons.current.get(focusId);
    if (!btn) return;
    el.scrollLeft = btn.offsetLeft + btn.offsetWidth / 2 - el.clientWidth / 2;
    // Only when the room (or the highlighted seat) changes, not on every render.
  }, [room.id, focusId]);

  // A plan that scrolls but has no selectable seat would trap keyboard users
  // out of the overflow: make the scroller itself a focusable region then.
  const [scrollable, setScrollable] = React.useState(false);
  React.useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => setScrollable(el.scrollWidth > el.clientWidth + 1);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, []);
  const hasFocusableSeat = ordered.some(isEnabled);
  const focusableScroller = scrollable && !hasFocusableSeat;

  const minWidth = GRID_COLS * minCellSize + (GRID_COLS - 1) * GAP + PAD * 2;
  const tileById = new Map(tiles.map((d) => [d.seat.id, d]));

  return (
    <Box
      ref={scroller}
      role={focusableScroller ? "region" : "group"}
      aria-label={label}
      tabIndex={focusableScroller ? 0 : undefined}
      onKeyDown={handleKeyDown}
      sx={[
        {
          overflowX: "auto",
          overflowY: "hidden",
          // Keep the focus ring of edge seats visible inside the scroller.
          p: "3px",
          m: "-3px",
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Box sx={{ containerType: "inline-size", minWidth }}>
        <Box
          sx={{
            position: "relative",
            isolation: "isolate",
            display: "grid",
            gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${layout.rows}, minmax(0, 1fr))`,
            aspectRatio: `${GRID_COLS} / ${layout.rows}`,
            gap: `${GAP}px`,
            p: `${PAD}px`,
            backgroundColor: GRID_BASE,
            border: `1px solid ${tint("cyan", 0.12)}`,
          }}
        >
          <BackgroundLayers room={room} />
          <Box
            aria-hidden="true"
            sx={{
              // Lines sit in the middle of the gaps between cells.
              position: "absolute",
              inset: `${PAD - GAP / 2}px`,
              zIndex: -1,
              pointerEvents: "none",
              backgroundImage: `linear-gradient(${tint("cyan", 0.07)} 1px,transparent 1px),linear-gradient(90deg,${tint("cyan", 0.07)} 1px,transparent 1px)`,
              backgroundSize: `calc(100% / ${GRID_COLS}) calc(100% / ${layout.rows})`,
            }}
          />
          {layout.groups.map((g) => {
            const seatId = links.get(g.id);
            const tile =
              seatId === undefined ? undefined : tileById.get(seatId);
            return (
              <FeatureShape
                key={`${g.kind}-${g.id}`}
                group={g}
                look={tile ? tile.state : "plain"}
                occupant={tile?.occupants?.[0]}
              />
            );
          })}
          {ordered.map((tile) => {
            const cell = layout.cells.get(tile.seat.id);
            if (!cell) return null;
            const enabled = isEnabled(tile);
            const occupants = tile.occupants ?? [];
            const screened = withScreen.has(tile.seat.id);
            // Long identifiers need the whole width: the occupant's name is
            // still on the second line.
            const avatarOf =
              (tile.state === "taken" || tile.state === "mine") &&
              tile.seat.label.length <= 5
                ? occupants[0]
                : undefined;
            const sub = tile.sub ?? seatSubLabel(tile);
            const pressable =
              selectable &&
              (tile.state === "free" || tile.state === "selected");
            return (
              <Box
                key={tile.seat.id}
                component="button"
                type="button"
                ref={(el: HTMLButtonElement | null) => {
                  if (el) buttons.current.set(tile.seat.id, el);
                  else buttons.current.delete(tile.seat.id);
                }}
                data-seat-id={tile.seat.id}
                data-state={tile.state}
                data-screen={screened ? "linked" : undefined}
                disabled={tile.state === "taken" || tile.disabled}
                aria-pressed={pressable ? tile.state === "selected" : undefined}
                aria-label={tile.ariaLabel ?? seatAriaLabel(tile, screened)}
                title={seatTitle(tile, screened)}
                onClick={enabled ? () => onSeatSelect?.(tile.seat) : undefined}
                sx={{
                  gridColumn: cell.col + 1,
                  gridRow: cell.row + 1,
                  minWidth: 0,
                  minHeight: 0,
                  m: 0,
                  p: "2px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "2px",
                  overflow: "hidden",
                  borderRadius: 0,
                  fontFamily: fonts.ui,
                  cursor: enabled
                    ? "pointer"
                    : tile.state === "taken"
                      ? "not-allowed"
                      : "default",
                  transition:
                    "background-color .15s ease, box-shadow .15s ease",
                  ...tileStyles[tile.state],
                  // Not pickable right now: dashed outline rather than fading
                  // the tile, which would let a background plan show through.
                  ...(tile.state === "free" && tile.disabled
                    ? { borderStyle: "dashed" }
                    : {}),
                  "&:hover":
                    enabled && tile.state === "free"
                      ? fill(tint("cyan", 0.16))
                      : {},
                  "&:focus-visible": {
                    outline: `2px solid ${colors.cyan}`,
                    outlineOffset: "2px",
                    zIndex: 1,
                  },
                  "@media (prefers-reduced-motion: reduce)": {
                    transition: "none",
                  },
                }}
              >
                <Box
                  component="span"
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    maxWidth: "100%",
                    minWidth: 0,
                  }}
                >
                  {avatarOf && (
                    <UserAvatar
                      name={avatarOf.name}
                      src={avatarOf.avatarUrl}
                      size={20}
                      sx={{
                        width: "clamp(14px, 2cqi, 24px)",
                        height: "clamp(14px, 2cqi, 24px)",
                        fontSize: "clamp(7px, 0.8cqi, 9px)",
                      }}
                    />
                  )}
                  <Box
                    component="span"
                    sx={{
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      fontFamily: fonts.mono,
                      fontSize: labelFontSize(
                        tile.seat.label,
                        Boolean(avatarOf),
                      ),
                      fontWeight: 700,
                      lineHeight: 1.1,
                    }}
                  >
                    {tile.seat.label}
                  </Box>
                </Box>
                <Box
                  component="span"
                  aria-hidden="true"
                  sx={{
                    maxWidth: "100%",
                    fontSize: "clamp(9px, 1.1cqi, 12px)",
                    lineHeight: 1.2,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {sub}
                </Box>
              </Box>
            );
          })}
        </Box>
      </Box>
    </Box>
  );
}

/** Whether a room has a screen linked to one of `seats` (to show the legend entry). */
export function hasLinkedScreens(
  room: FloorPlanRoom,
  seats: FloorPlanSeat[],
): boolean {
  return screenSeatLinks(layoutRoom(room, seats)).size > 0;
}

export type LegendKey =
  | SeatState
  | "screen"
  | "entrance"
  /** A screen linked to a seat: dashed while the seat is free, filled when taken. */
  | "linkedScreen";

const legendSwatch: Record<LegendKey, Record<string, unknown>> = {
  mine: { backgroundColor: colors.lime },
  selected: { backgroundColor: colors.cyan },
  free: { border: `1px solid ${colors.cyan}` },
  taken: {
    backgroundColor: tint("violet", 0.25),
    border: "1px solid rgba(165,139,255,0.5)",
  },
  screen: { backgroundColor: tint("violet", 0.4) },
  linkedScreen: {
    // Half free (dashed outline), half taken (filled).
    border: `1px dashed ${colors.violetLight}`,
    backgroundImage: `linear-gradient(90deg, transparent 50%, ${tint("violet", 0.45)} 50%)`,
  },
  entrance: {
    backgroundColor: tint("lime", 0.3),
    border: `1px solid ${tint("lime", 0.6)}`,
  },
};

const legendDefaults: Record<LegendKey, string> = {
  mine: "Your seat",
  selected: "Selected",
  free: "Free",
  taken: "Taken",
  screen: "Screen",
  linkedScreen: "Screen: free / taken with its seat",
  entrance: "Entrance",
};

export interface FloorPlanLegendProps {
  items: Array<LegendKey | { key: LegendKey; label: string }>;
  size?: "md" | "sm";
  sx?: SxProps<Theme>;
}

/** Colour key for the floor plan (swatches are backed by text, never colour alone). */
export function FloorPlanLegend({
  items,
  size = "md",
  sx,
}: FloorPlanLegendProps) {
  const sw = size === "md" ? 14 : 12;
  return (
    <Box
      component="ul"
      aria-label="Legend"
      sx={[
        {
          listStyle: "none",
          m: 0,
          p: 0,
          display: "flex",
          flexWrap: "wrap",
          gap: size === "md" ? "8px 18px" : "6px 16px",
          fontSize: size === "md" ? 13 : 12,
          color: colors.textMuted,
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {items.map((item) => {
        const k = typeof item === "string" ? item : item.key;
        const text = typeof item === "string" ? legendDefaults[k] : item.label;
        return (
          <Box
            component="li"
            key={k}
            sx={{ display: "flex", alignItems: "center", gap: 1 }}
          >
            <Box
              component="span"
              aria-hidden="true"
              sx={{
                width: sw,
                height: sw,
                flex: "none",
                boxSizing: "border-box",
                ...legendSwatch[k],
              }}
            />
            {text}
          </Box>
        );
      })}
    </Box>
  );
}

export default SeatFloorPlan;
