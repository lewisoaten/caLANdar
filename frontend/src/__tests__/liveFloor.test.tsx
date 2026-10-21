import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { initialLiveState, type LiveState } from "../live/store";
import type { FloorRoom, FloorSeat } from "../live/types";
import {
  LiveFloor,
  ROOM_CYCLE_MS,
  fitCell,
  floorRooms,
} from "../components/live/LiveFloor";

const room = (id: number, name: string, extra: Partial<FloorRoom> = {}) =>
  ({
    id,
    name,
    sortOrder: id,
    gridRows: 4,
    features: [],
    ...extra,
  }) as FloorRoom;

const seat = (id: number, roomId: number): FloorSeat => ({
  id,
  roomId,
  label: `S${id}`,
  name: null,
  x: 0,
  y: 0,
  gridCol: id % 12,
  gridRow: 0,
  pid: null,
});

const stateWith = (rooms: FloorRoom[], seats: FloorSeat[]): LiveState => ({
  ...initialLiveState(1),
  floor: { rooms, seats },
});

describe("LiveFloor", () => {
  test("lists rooms in order, skipping any without seats", () => {
    const s = stateWith(
      [room(2, "Lounge"), room(1, "Main hall"), room(3, "Empty")],
      [seat(1, 1), seat(2, 2)],
    );
    expect(floorRooms(s).map((r) => r.name)).toEqual(["Main hall", "Lounge"]);
  });

  test("fits a room's cells to both sides of the panel", () => {
    // Wide panel: the height limits it.
    expect(fitCell(1000, 200, 4)).toBe(40);
    // Tall panel: the width limits it.
    expect(fitCell(468, 2000, 4)).toBe(34);
    // Never collapses to nothing.
    expect(fitCell(0, 0, 4)).toBe(12);
  });

  test("draws the room's background plan behind the seats", () => {
    const s = stateWith(
      [room(1, "Main hall", { backgroundUrl: "/api/room-backgrounds/abc" })],
      [seat(1, 1)],
    );
    const { container } = render(<LiveFloor state={s} />);
    expect(
      container.querySelector('img[src="/api/room-backgrounds/abc"]'),
    ).not.toBeNull();
  });

  describe("on the wall-board", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    test("cycles through the rooms one at a time", () => {
      const s = stateWith(
        [room(1, "Main hall"), room(2, "Lounge")],
        [seat(1, 1), seat(2, 2)],
      );
      render(<LiveFloor state={s} tv />);
      expect(screen.getByText("Main hall")).toBeTruthy();
      expect(screen.queryByText("Lounge")).toBeNull();
      act(() => {
        vi.advanceTimersByTime(ROOM_CYCLE_MS);
      });
      expect(screen.getByText("Lounge")).toBeTruthy();
      expect(screen.queryByText("Main hall")).toBeNull();
      act(() => {
        vi.advanceTimersByTime(ROOM_CYCLE_MS);
      });
      expect(screen.getByText("Main hall")).toBeTruthy();
    });
  });
});
