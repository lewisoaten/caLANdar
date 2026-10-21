/**
 * The floor, grouped by lobby (README §1c right): seats in their rooms, drawn
 * like the seat map (grid backdrop, background plan, screens and entrances);
 * neighbouring seats in the same lobby share one coloured, labelled group.
 * Idle seats are dashed, AFK seats faded. The wall-board shows one room at a
 * time, sized to its panel, and cycles through them.
 */
import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import Box from "@mui/material/Box";
import { keyframes } from "@mui/material/styles";
import { Panel } from "../hl/Panel";
import { UserAvatar } from "../hl/UserAvatar";
import { colors, tint } from "../hl/tokens";
import type { LiveState } from "../../live/store";
import type { FloorRoom } from "../../live/types";
import { floorGroups, personFor } from "../../live/selectors";
import {
  BackgroundLayers,
  FeatureShape,
  GAP,
  GRID_BASE,
  PAD,
} from "../SeatFloorPlan";
import {
  GRID_COLS,
  layoutRoom,
  type FloorPlanRoom,
  type FloorPlanSeat,
} from "../seatFloorPlanModel";
import { Mono } from "./liveUi";

const CELL = 34;
/** How long the wall-board shows each room. */
export const ROOM_CYCLE_MS = 15_000;
/** Room for the lobby label above the top row. */
const LABEL_SPACE = 14;
/** Height of the wall-board's room name line, with its gap. */
const TV_HEADER = 30;
/** The room grid's border, each side. */
const BORDER = 1;
/** Smallest seat that still reads; tighter panels scale the whole plan instead. */
const MIN_CELL = 12;
/** Room under the wall-board's plan for the bar counting down to the next room. */
const BAR_SPACE = 6;

const fill = keyframes`from { transform: scaleX(0); } to { transform: scaleX(1); }`;

type Group = ReturnType<typeof floorGroups>[number];

/** Rooms in the API's order, skipping any without seats. */
export function floorRooms(state: LiveState): FloorRoom[] {
  return [...state.floor.rooms]
    .filter((r) => state.floor.seats.some((s) => s.roomId === r.id))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
}

/** Rendered size (px) of a 12-column room of `rows` rows at `cell` px per seat. */
export function roomExtent(
  cell: number,
  rows: number,
): { width: number; height: number } {
  const frame = PAD * 2 + BORDER * 2;
  return {
    width: GRID_COLS * cell + GAP * (GRID_COLS - 1) + frame,
    height: LABEL_SPACE + rows * cell + GAP * (rows - 1) + frame,
  };
}

/** Largest cell (px) that fits a 12-column room of `rows` rows in `width`×`height`. */
export function fitCell(width: number, height: number, rows: number): number {
  const frame = PAD * 2 + BORDER * 2;
  const across = (width - frame - GAP * (GRID_COLS - 1)) / GRID_COLS;
  const r = Math.max(1, rows);
  const down = (height - LABEL_SPACE - frame - GAP * (r - 1)) / r;
  return Math.max(MIN_CELL, Math.floor(Math.min(across, down)));
}

/**
 * How to show a room in a `width`×`height` panel: the fitted cell, and a
 * scale (at most 1) for a room too big even at the smallest cell, so every
 * row stays on screen.
 */
export function fitRoom(
  width: number,
  height: number,
  rows: number,
): { cell: number; scale: number } {
  const cell = fitCell(width, height, rows);
  const extent = roomExtent(cell, Math.max(1, rows));
  const scale = Math.min(1, width / extent.width, height / extent.height);
  return { cell, scale };
}

function RoomFloor({
  state,
  room,
  cell,
  groupOf,
  groups,
}: {
  state: LiveState;
  room: FloorRoom;
  cell: number;
  groupOf: Map<number, Group>;
  groups: Group[];
}) {
  const plan = room as unknown as FloorPlanRoom;
  const seats = state.floor.seats.filter((s) => s.roomId === room.id);
  const layout = layoutRoom(plan, seats as unknown as FloorPlanSeat[]);
  // Label each group once, on its top-left seat.
  const labelled = new Set<string>();
  const ordered = [...seats].sort((a, b) => {
    const ca = layout.cells.get(a.id);
    const cb = layout.cells.get(b.id);
    return (ca?.row ?? 0) - (cb?.row ?? 0) || (ca?.col ?? 0) - (cb?.col ?? 0);
  });
  const here = groups.filter((g) =>
    g.seatIds.some((id) => layout.cells.has(id)),
  );
  return (
    <Box sx={{ pt: `${LABEL_SPACE}px`, width: "max-content" }}>
      <Box
        role="img"
        aria-label={`${room.name} floor: ${here.map((g) => g.label).join(", ") || "nobody in a lobby"}`}
        sx={{
          position: "relative",
          isolation: "isolate",
          display: "grid",
          gridTemplateColumns: `repeat(${GRID_COLS}, ${cell}px)`,
          gridTemplateRows: `repeat(${layout.rows}, ${cell}px)`,
          gap: `${GAP}px`,
          p: `${PAD}px`,
          backgroundColor: GRID_BASE,
          border: `${BORDER}px solid ${tint("cyan", 0.12)}`,
        }}
      >
        <BackgroundLayers room={plan} />
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
        {layout.groups.map((g) => (
          <FeatureShape key={`${g.kind}-${g.id}`} group={g} look="plain" />
        ))}
        {ordered.map((seat) => {
          const c = layout.cells.get(seat.id);
          if (!c) return null;
          const person = personFor(state, seat.pid);
          const group = groupOf.get(seat.id);
          const showLabel = group && !labelled.has(group.lobbyId);
          if (group) labelled.add(group.lobbyId);
          const afk = person?.presence?.afk;
          return (
            <Box
              key={seat.id}
              title={
                person
                  ? `${seat.label} · ${person.handle}`
                  : `${seat.label} · free`
              }
              sx={{
                gridColumn: c.col + 1,
                gridRow: c.row + 1,
                position: "relative",
                display: "grid",
                // One track no wider than the seat, so contents can't widen it.
                gridTemplateColumns: "minmax(0, 1fr)",
                minWidth: 0,
                placeItems: "center",
                border: group
                  ? `1.5px solid ${group.color}`
                  : `1px dashed ${person ? tint("cyan", 0.35) : tint("neutral", 0.3)}`,
                // Opaque base so the background plan never shows through a seat.
                backgroundColor: GRID_BASE,
                backgroundImage: group
                  ? `linear-gradient(${group.color}1f, ${group.color}1f)`
                  : "none",
                boxShadow: group ? `0 0 12px -6px ${group.color}` : "none",
                opacity: afk ? 0.4 : 1,
              }}
            >
              {person ? (
                <UserAvatar
                  name={person.handle}
                  src={person.avatarUrl}
                  size={Math.max(8, cell - 10)}
                />
              ) : (
                <Mono
                  size={Math.max(9, Math.round(cell / 4))}
                  color={colors.textDim}
                  weight={500}
                  sx={{
                    // Long seat names stay inside the seat.
                    minWidth: 0,
                    maxWidth: "100%",
                    px: "2px",
                    boxSizing: "border-box",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {seat.label}
                </Mono>
              )}
              {showLabel && (
                <Mono
                  size={Math.max(9, Math.round(cell / 4))}
                  color={colors.ink}
                  sx={{
                    position: "absolute",
                    bottom: "100%",
                    // Open towards the middle so it stays on the plan.
                    ...(c.col < GRID_COLS / 2 ? { left: -2 } : { right: -2 }),
                    maxWidth: (cell + GAP) * (GRID_COLS / 2),
                    backgroundColor: group.color,
                    px: "4px",
                    zIndex: 1,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    boxSizing: "border-box",
                  }}
                >
                  {group.label}
                </Mono>
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

/** Size of an element, kept up to date as it changes. */
function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () =>
      setSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

/** The wall-board's floor: one room at a time, as large as the panel allows. */
function TvFloor({
  state,
  rooms,
  groupOf,
  groups,
}: {
  state: LiveState;
  rooms: FloorRoom[];
  groupOf: Map<number, Group>;
  groups: Group[];
}) {
  const [ref, size] = useSize<HTMLDivElement>();
  const [turn, setTurn] = useState(0);
  const count = rooms.length;
  useEffect(() => {
    if (count < 2) return;
    const timer = setInterval(() => setTurn((t) => t + 1), ROOM_CYCLE_MS);
    return () => clearInterval(timer);
  }, [count]);
  const room = rooms[turn % count];
  const rows = layoutRoom(
    room as unknown as FloorPlanRoom,
    state.floor.seats.filter(
      (s) => s.roomId === room.id,
    ) as unknown as FloorPlanSeat[],
  ).rows;
  // `size` is the area under the room name, so the header is already out.
  const { cell, scale } = fitRoom(size.width, size.height - BAR_SPACE, rows);
  const extent = roomExtent(cell, rows);
  return (
    <Box
      sx={{
        height: "100%",
        boxSizing: "border-box",
        p: "16px",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Box
        sx={{
          height: TV_HEADER,
          flex: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 2,
        }}
      >
        <Mono size={20} color={colors.text} weight={700}>
          {room.name}
        </Mono>
        {count > 1 && (
          <Box sx={{ display: "flex", gap: "8px" }} aria-hidden="true">
            {rooms.map((r, i) => (
              <Box
                key={r.id}
                sx={{
                  width: 12,
                  height: 12,
                  backgroundColor:
                    i === turn % count ? colors.cyan : tint("cyan", 0.2),
                }}
              />
            ))}
          </Box>
        )}
      </Box>
      <Box
        ref={ref}
        sx={{
          flex: 1,
          minHeight: 0,
          display: "grid",
          placeItems: "center",
          overflow: "hidden",
        }}
      >
        {size.width > 0 && (
          // Lay out at the scaled size so the plan stays centred in the panel.
          <Box
            sx={{
              position: "relative",
              width: extent.width * scale,
              height: extent.height * scale + BAR_SPACE,
            }}
          >
            <Box
              sx={{
                width: extent.width,
                transform: scale < 1 ? `scale(${scale})` : undefined,
                transformOrigin: "top left",
              }}
            >
              <RoomFloor
                key={room.id}
                state={state}
                room={room}
                cell={cell}
                groupOf={groupOf}
                groups={groups}
              />
            </Box>
            {count > 1 && (
              // Fills up until the next room.
              <Box
                data-testid="room-cycle-progress"
                aria-hidden="true"
                sx={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: 2,
                  backgroundColor: tint("cyan", 0.12),
                  overflow: "hidden",
                }}
              >
                <Box
                  key={turn}
                  sx={{
                    height: "100%",
                    backgroundColor: tint("cyan", 0.6),
                    transformOrigin: "left",
                    animation: `${fill} ${ROOM_CYCLE_MS}ms linear forwards`,
                  }}
                />
              </Box>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
}

export function LiveFloor({
  state,
  tv = false,
}: {
  state: LiveState;
  /** Wall-board: one room at a time, sized to fit, cycling. */
  tv?: boolean;
}) {
  const groups = useMemo(() => floorGroups(state), [state]);
  const groupOf = useMemo(() => {
    const m = new Map<number, Group>();
    for (const g of groups) for (const id of g.seatIds) m.set(id, g);
    return m;
  }, [groups]);
  const rooms = floorRooms(state);

  if (rooms.length === 0) {
    const none = (
      <Box
        sx={{
          p: "14px 18px",
          color: colors.textMuted,
          fontSize: tv ? 24 : 14,
        }}
      >
        No seating plan for this event.
      </Box>
    );
    return tv ? (
      none
    ) : (
      <Panel kicker="Who's where" title="Floor" padding="none">
        {none}
      </Panel>
    );
  }

  if (tv)
    return (
      <TvFloor state={state} rooms={rooms} groupOf={groupOf} groups={groups} />
    );

  return (
    <Panel kicker="Who's where" title="Floor" padding="none">
      <PageFloor
        state={state}
        rooms={rooms}
        groupOf={groupOf}
        groups={groups}
      />
    </Panel>
  );
}

/** The Live page's floor: every room, as wide as the panel (up to CELL per seat). */
function PageFloor({
  state,
  rooms,
  groupOf,
  groups,
}: {
  state: LiveState;
  rooms: FloorRoom[];
  groupOf: Map<number, Group>;
  groups: Group[];
}) {
  const [ref, size] = useSize<HTMLDivElement>();
  const cell =
    size.width > 0
      ? Math.min(CELL, fitCell(size.width, Number.POSITIVE_INFINITY, 1))
      : CELL;
  return (
    <Box sx={{ p: "14px 16px", overflowX: "auto" }}>
      <Box ref={ref} sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {rooms.map((room) => (
          <Box
            key={room.id}
            sx={{ display: "flex", flexDirection: "column", gap: 1 }}
          >
            {rooms.length > 1 && (
              <Mono size={10} color={colors.textDim}>
                {room.name}
              </Mono>
            )}
            <RoomFloor
              state={state}
              room={room}
              cell={cell}
              groupOf={groupOf}
              groups={groups}
            />
          </Box>
        ))}
      </Box>
    </Box>
  );
}

export default LiveFloor;
