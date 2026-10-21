import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { initialLiveState, type LiveState } from "../live/store";
import type { FloorRoom, FloorSeat } from "../live/types";
import {
  LiveFloor,
  ROOM_CYCLE_MS,
  fitCell,
  fitRoom,
  floorRooms,
  roomExtent,
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

  test("a fitted room, borders and all, never exceeds its panel", () => {
    for (const [w, h, rows] of [
      [320, 10_000, 4],
      [1000, 200, 4],
      [468, 2000, 4],
      [500, 700, 9],
    ]) {
      const extent = roomExtent(fitCell(w, h, rows), rows);
      expect(extent.width).toBeLessThanOrEqual(w);
      expect(extent.height).toBeLessThanOrEqual(h);
    }
    // 40px cells fill 200px exactly: label, padding, borders and gaps included.
    expect(roomExtent(40, 4).height).toBe(200);
  });

  test("scales a room too tall even at the smallest seat to fit", () => {
    expect(fitRoom(468, 2000, 4).scale).toBe(1);
    const { cell, scale } = fitRoom(468, 500, 50);
    expect(cell).toBe(12);
    expect(scale).toBeLessThan(1);
    const extent = roomExtent(cell, 50);
    expect(extent.height * scale).toBeLessThanOrEqual(500);
    expect(extent.width * scale).toBeLessThanOrEqual(468);
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
