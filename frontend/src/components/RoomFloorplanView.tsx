import * as React from "react";
import { Room, Seat } from "../types/events";
import { InvitationLiteData } from "../types/invitations";
import {
  SeatFloorPlan,
  type DeskState,
  type FloorPlanDesk,
} from "./SeatFloorPlan";
import type { FloorPlanRoom } from "./seatFloorPlanModel";

export interface SeatDisplayData {
  seat: Seat;
  occupants: InvitationLiteData[]; // Empty array for available seats
  isOwnSeat?: boolean; // For SeatSelector to mark user's seat
  isAvailable?: boolean; // For interactive selection
  isSelected?: boolean; // Picked but not yet saved
  onClick?: () => void;
  /** @deprecated Desks are native buttons now: Enter/Space call `onClick`. */
  onKeyDown?: (e: React.KeyboardEvent<HTMLElement>) => void;
}

interface RoomFloorplanViewProps {
  room: Room;
  seats: SeatDisplayData[];
  /** Accessible name; defaults to "<room> floor plan". */
  label?: string;
}

/** Desk state for a legacy `SeatDisplayData` entry. */
export function displayState(data: SeatDisplayData): DeskState {
  if (data.isOwnSeat) return "mine";
  if (data.isSelected) return "selected";
  if (data.isAvailable === false) return "taken";
  if (data.isAvailable === undefined && data.occupants.length > 0)
    return "taken";
  return "free";
}

/**
 * RoomFloorplanView - the `SeatDisplayData` adapter around `SeatFloorPlan`,
 * kept for callers written against the old image-overlay view. Renders the
 * room's grid (with its background plan or legacy floorplan image behind it).
 */
const RoomFloorplanView: React.FC<RoomFloorplanViewProps> = ({
  room,
  seats,
  label,
}) => {
  const handlers = new Map<number, () => void>();
  const desks: FloorPlanDesk[] = seats.map((data) => {
    if (data.onClick) handlers.set(data.seat.id, data.onClick);
    const state = displayState(data);
    return {
      seat: data.seat,
      state,
      occupants: data.occupants.map((o) => ({
        name: o.handle,
        avatarUrl: o.avatarUrl,
      })),
      disabled: state !== "taken" && !data.onClick,
    };
  });
  const interactive = handlers.size > 0;

  return (
    <SeatFloorPlan
      room={room as FloorPlanRoom}
      desks={desks}
      label={label ?? `${room.name} floor plan`}
      selectable={interactive}
      onDeskSelect={
        interactive ? (seat) => handlers.get(seat.id)?.() : undefined
      }
    />
  );
};

export default RoomFloorplanView;
