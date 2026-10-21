import { expect, test } from "vitest";
import { asleep } from "../components/live/WallBoard";

const at = (h: number, m = 0) => new Date(2026, 9, 23, h, m).getTime();

test("the wall-board sleeps inside its window, across midnight too", () => {
  expect(asleep("03:00-09:00", at(4))).toBe(true);
  expect(asleep("03:00-09:00", at(9))).toBe(false);
  expect(asleep("03:00-09:00", at(2, 59))).toBe(false);
  expect(asleep("23:00-07:00", at(1))).toBe(true);
  expect(asleep("23:00-07:00", at(12))).toBe(false);
  expect(asleep(null, at(4))).toBe(false);
  expect(asleep("nonsense", at(4))).toBe(false);
});
