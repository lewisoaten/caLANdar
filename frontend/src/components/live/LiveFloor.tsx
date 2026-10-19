/**
 * The floor, grouped by lobby (README §1c right): seats in their rooms;
 * neighbouring seats in the same lobby share one coloured, labelled group.
 * Idle seats are dashed, AFK seats faded.
 */
import * as React from "react";
import { useMemo } from "react";
import Box from "@mui/material/Box";
import { Panel } from "../hl/Panel";
import { UserAvatar } from "../hl/UserAvatar";
import { colors, tint } from "../hl/tokens";
import type { LiveState } from "../../live/store";
import { floorGroups, personFor } from "../../live/selectors";
import {
  GRID_COLS,
  layoutRoom,
  type FloorPlanRoom,
  type FloorPlanSeat,
} from "../seatFloorPlanModel";
import { Mono } from "./liveUi";

const CELL = 34;

export function LiveFloor({
  state,
  compact = false,
}: {
  state: LiveState;
  compact?: boolean;
}) {
  const groups = useMemo(() => floorGroups(state), [state]);
  const groupOf = useMemo(() => {
    const m = new Map<number, (typeof groups)[number]>();
    for (const g of groups) for (const id of g.seatIds) m.set(id, g);
    return m;
  }, [groups]);
  const rooms = [...state.floor.rooms].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.id - b.id,
  );
  const cell = compact ? 26 : CELL;

  const content =
    rooms.length === 0 ? (
      <Box sx={{ p: "14px 18px", color: colors.textMuted, fontSize: 14 }}>
        No seating plan for this event.
      </Box>
    ) : (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: 2,
          p: "14px 16px",
          overflowX: "auto",
        }}
      >
        {rooms.map((room) => {
          const seats = state.floor.seats.filter((s) => s.roomId === room.id);
          const layout = layoutRoom(
            room as unknown as FloorPlanRoom,
            seats as unknown as FloorPlanSeat[],
          );
          // Label each group once, on its top-left seat.
          const labelled = new Set<string>();
          const ordered = [...seats].sort((a, b) => {
            const ca = layout.cells.get(a.id);
            const cb = layout.cells.get(b.id);
            return (
              (ca?.row ?? 0) - (cb?.row ?? 0) || (ca?.col ?? 0) - (cb?.col ?? 0)
            );
          });
          return (
            <Box
              key={room.id}
              sx={{ display: "flex", flexDirection: "column", gap: 1 }}
            >
              {rooms.length > 1 && (
                <Mono size={10} color={colors.textDim}>
                  {room.name}
                </Mono>
              )}
              <Box
                role="img"
                aria-label={`${room.name} floor: ${groups.map((g) => g.label).join(", ") || "nobody in a lobby"}`}
                sx={{
                  position: "relative",
                  display: "grid",
                  gridTemplateColumns: `repeat(${GRID_COLS}, ${cell}px)`,
                  gridTemplateRows: `repeat(${layout.rows}, ${cell}px)`,
                  gap: "3px",
                  width: "max-content",
                  pt: "14px",
                }}
              >
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
                        placeItems: "center",
                        border: group
                          ? `1.5px solid ${group.color}`
                          : `1px dashed ${person ? tint("cyan", 0.35) : tint("neutral", 0.3)}`,
                        backgroundColor: group
                          ? `${group.color}1f`
                          : "transparent",
                        boxShadow: group
                          ? `0 0 12px -6px ${group.color}`
                          : "none",
                        opacity: afk ? 0.4 : 1,
                      }}
                    >
                      {person ? (
                        <UserAvatar
                          name={person.handle}
                          src={person.avatarUrl}
                          size={cell - 10}
                        />
                      ) : (
                        <Mono size={9} color={colors.textDim} weight={500}>
                          {seat.label}
                        </Mono>
                      )}
                      {showLabel && (
                        <Mono
                          size={9}
                          color={colors.ink}
                          sx={{
                            position: "absolute",
                            bottom: "100%",
                            left: -2,
                            backgroundColor: group.color,
                            px: "4px",
                            zIndex: 1,
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
        })}
      </Box>
    );

  if (compact) return content;
  return (
    <Panel kicker="Who's where" title="Floor" padding="none">
      {content}
    </Panel>
  );
}

export default LiveFloor;
