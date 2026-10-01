import * as React from "react";
import Box from "@mui/material/Box";
import type { SxProps, Theme } from "@mui/material/styles";
import TvSharp from "@mui/icons-material/TvSharp";
import DoorFrontSharp from "@mui/icons-material/DoorFrontSharp";
import { UserAvatar, colors, effects, fonts, srOnly, tint } from "./hl";
import { displayCallsign } from "../utils/callsign";
import {
  GRID_COLS,
  joinNames,
  layoutRoom,
  nextDeskInDirection,
  roomBackground,
  sortByCell,
  type ArrowKey,
  type FeatureStrip,
  type FloorPlanRoom,
  type FloorPlanSeat,
} from "./seatFloorPlanModel";

/** How a desk is drawn: yours (lime), free (cyan outline), taken (violet), selected (cyan + glow). */
export type DeskState = "mine" | "free" | "taken" | "selected";

export interface DeskOccupant {
  name: string | null;
  avatarUrl?: string | null;
}

export interface FloorPlanDesk {
  seat: FloorPlanSeat;
  state: DeskState;
  /**
   * People on this desk. For `taken` desks they are shown on the tile; for
   * `mine` the first one is you; on `free` desks they share it at other times.
   */
  occupants?: DeskOccupant[];
  /** Second line on the tile (defaults per state: YOU / name / SELECTED / FREE). */
  sub?: string;
  /** Accessible name override (defaults to label + state). */
  ariaLabel?: string;
  /** Not selectable. `taken` desks are always disabled. */
  disabled?: boolean;
}

export interface SeatFloorPlanProps {
  room: FloorPlanRoom;
  desks: FloorPlanDesk[];
  /** Called when a selectable desk is activated (click, Enter or Space). */
  onDeskSelect?: (seat: FloorPlanSeat) => void;
  /** Accessible name for the plan, e.g. "Main Hall floor plan". */
  label: string;
  /**
   * Free/selected desks toggle a selection: expose it with `aria-pressed`.
   * Turn off for read-only plans.
   */
  selectable?: boolean;
  /** Minimum cell edge in px; below it the plan scrolls sideways. */
  minCellSize?: number;
  sx?: SxProps<Theme>;
}

const who = (o: DeskOccupant) => displayCallsign(o.name);

const GAP = 4;
const PAD = 6;

/** Default accessible name of a desk. */
export function deskAriaLabel(desk: FloorPlanDesk): string {
  const { seat, state, occupants = [] } = desk;
  const names = joinNames(occupants.map(who));
  // "A1, Window desk next to the fridge, free"
  const about = seat.description?.trim();
  const name = about ? `${seat.label}, ${about}` : seat.label;
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

/** Tooltip of a desk: identifier, description and who sits there. */
export function deskTitle(desk: FloorPlanDesk): string {
  const occupants = desk.occupants ?? [];
  return [
    desk.seat.label,
    desk.seat.description?.trim(),
    desk.state === "taken" && occupants.length > 0
      ? joinNames(occupants.map(who))
      : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Desk label size: the usual `clamp(10px, 1.6cqi, 16px)`, shrunk for longer
 * identifiers so up to 8 characters fit one cell (the plan is the `cqi`
 * container; a cell is about 100cqi / 12 wide). Longer legacy labels get an
 * ellipsis; the full text is in the title and accessible name.
 */
export function labelFontSize(label: string, withAvatar = false): string {
  const n = Math.max(4, label.length);
  const room = withAvatar ? "100cqi / 12 - 36px" : "100cqi / 12 - 13px";
  return `clamp(7px, min(1.6cqi, calc((${room}) / ${(0.62 * n).toFixed(2)})), 16px)`;
}

/** Default second line of a desk tile. */
export function deskSubLabel(desk: FloorPlanDesk): string {
  const occupants = desk.occupants ?? [];
  switch (desk.state) {
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

/** Base of the plan, under desks and strips so a background never shows through them. */
const GRID_BASE = "#0a0d15";

/**
 * A tinted fill laid over the opaque grid base: keeps desk labels readable
 * (>= 4.5:1) over any background plan, e.g. the cyan "retro" treatment.
 * Same treatment as the room editor's tiles.
 */
const fill = (color: string) => ({
  backgroundColor: GRID_BASE,
  backgroundImage: `linear-gradient(${color}, ${color})`,
});

const tileStyles: Record<DeskState, Record<string, unknown>> = {
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

function Strip({ strip }: { strip: FeatureStrip }) {
  const screen = strip.kind === "screen";
  const name = screen ? "Screen" : "Entrance";
  const Icon = screen ? TvSharp : DoorFrontSharp;
  return (
    <Box
      sx={{
        gridColumn: `${strip.col + 1} / span ${strip.span}`,
        gridRow: strip.row + 1,
        minWidth: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 0.75,
        overflow: "hidden",
        border: `1px solid ${screen ? "rgba(165,139,255,0.5)" : tint("lime", 0.6)}`,
        ...fill(screen ? tint("violet", 0.12) : tint("lime", 0.12)),
        color: screen ? colors.violetText : colors.lime,
        fontFamily: fonts.mono,
        fontSize: "clamp(9px, 1.1cqi, 11px)",
        letterSpacing: "0.2em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
        "& svg": { fontSize: "clamp(14px, 1.8cqi, 20px)", flex: "none" },
      }}
    >
      {strip.span >= 3 || strip.span === 1 ? <Icon aria-hidden="true" /> : null}
      {strip.span >= 2 ? (
        <span>{name}</span>
      ) : (
        <Box component="span" sx={srOnly}>
          {name}
        </Box>
      )}
    </Box>
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
 * plan, screen/entrance strips and one button per desk. Desks follow their
 * grid cell (legacy seats are placed from x/y). Tab moves through selectable
 * desks in reading order; the arrow keys jump to the nearest desk in that
 * direction. Scrolls sideways when narrower than `minCellSize` per column.
 */
export function SeatFloorPlan({
  room,
  desks,
  onDeskSelect,
  label,
  selectable = true,
  minCellSize = 44,
  sx,
}: SeatFloorPlanProps) {
  const seats = React.useMemo(() => desks.map((d) => d.seat), [desks]);
  const layout = React.useMemo(() => layoutRoom(room, seats), [room, seats]);
  const ordered = React.useMemo(
    () =>
      sortByCell(
        desks.map((d) => ({ ...d, id: d.seat.id })),
        layout.cells,
      ),
    [desks, layout],
  );
  const buttons = React.useRef(new Map<number, HTMLButtonElement>());

  const isEnabled = (d: FloorPlanDesk) =>
    d.state !== "taken" && !d.disabled && Boolean(onDeskSelect);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!e.key.startsWith("Arrow")) return;
    const target = e.target as HTMLElement;
    const id = Number(target.dataset?.seatId);
    if (!Number.isFinite(id)) return;
    const nav = ordered
      .filter((d) => isEnabled(d) || d.seat.id === id)
      .map((d) => ({ id: d.seat.id, ...layout.cells.get(d.seat.id)! }));
    const next = nextDeskInDirection(nav, id, e.key as ArrowKey);
    e.preventDefault();
    if (next !== null) buttons.current.get(next)?.focus();
  };

  // On narrow screens the plan scrolls: bring your desk (or the pick) into view.
  const scroller = React.useRef<HTMLDivElement | null>(null);
  const focusId =
    desks.find((d) => d.state === "mine")?.seat.id ??
    desks.find((d) => d.state === "selected")?.seat.id;
  React.useEffect(() => {
    const el = scroller.current;
    if (!el || focusId === undefined || el.scrollWidth <= el.clientWidth)
      return;
    const btn = buttons.current.get(focusId);
    if (!btn) return;
    el.scrollLeft = btn.offsetLeft + btn.offsetWidth / 2 - el.clientWidth / 2;
    // Only when the room (or the highlighted desk) changes, not on every render.
  }, [room.id, focusId]);

  // A plan that scrolls but has no selectable desk would trap keyboard users
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
  const hasFocusableDesk = ordered.some(isEnabled);
  const focusableScroller = scrollable && !hasFocusableDesk;

  const minWidth = GRID_COLS * minCellSize + (GRID_COLS - 1) * GAP + PAD * 2;

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
          // Keep the focus ring of edge desks visible inside the scroller.
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
          {layout.strips.map((s) => (
            <Strip key={`${s.kind}-${s.row}-${s.col}`} strip={s} />
          ))}
          {ordered.map((desk) => {
            const cell = layout.cells.get(desk.seat.id);
            if (!cell) return null;
            const enabled = isEnabled(desk);
            const occupants = desk.occupants ?? [];
            // Long identifiers need the whole width: the occupant's name is
            // still on the second line.
            const avatarOf =
              (desk.state === "taken" || desk.state === "mine") &&
              desk.seat.label.length <= 5
                ? occupants[0]
                : undefined;
            const sub = desk.sub ?? deskSubLabel(desk);
            const pressable =
              selectable &&
              (desk.state === "free" || desk.state === "selected");
            return (
              <Box
                key={desk.seat.id}
                component="button"
                type="button"
                ref={(el: HTMLButtonElement | null) => {
                  if (el) buttons.current.set(desk.seat.id, el);
                  else buttons.current.delete(desk.seat.id);
                }}
                data-seat-id={desk.seat.id}
                data-state={desk.state}
                disabled={desk.state === "taken" || desk.disabled}
                aria-pressed={pressable ? desk.state === "selected" : undefined}
                aria-label={desk.ariaLabel ?? deskAriaLabel(desk)}
                title={deskTitle(desk)}
                onClick={enabled ? () => onDeskSelect?.(desk.seat) : undefined}
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
                    : desk.state === "taken"
                      ? "not-allowed"
                      : "default",
                  transition:
                    "background-color .15s ease, box-shadow .15s ease",
                  ...tileStyles[desk.state],
                  // Not pickable right now: dashed outline rather than fading
                  // the tile, which would let a background plan show through.
                  ...(desk.state === "free" && desk.disabled
                    ? { borderStyle: "dashed" }
                    : {}),
                  "&:hover":
                    enabled && desk.state === "free"
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
                        desk.seat.label,
                        Boolean(avatarOf),
                      ),
                      fontWeight: 700,
                      lineHeight: 1.1,
                    }}
                  >
                    {desk.seat.label}
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

export type LegendKey = DeskState | "screen" | "entrance";

const legendSwatch: Record<LegendKey, Record<string, unknown>> = {
  mine: { backgroundColor: colors.lime },
  selected: { backgroundColor: colors.cyan },
  free: { border: `1px solid ${colors.cyan}` },
  taken: {
    backgroundColor: tint("violet", 0.25),
    border: "1px solid rgba(165,139,255,0.5)",
  },
  screen: { backgroundColor: tint("violet", 0.4) },
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
