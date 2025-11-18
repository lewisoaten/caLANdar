import { describe, test, expect } from "vitest";
import moment from "moment";
import { getAttendanceDescription } from "../utils/attendanceDescription";

describe("getAttendanceDescription", () => {
  test("returns message for no attendance", () => {
    const result = getAttendanceDescription(
      null,
      moment(),
      moment().add(1, "day"),
    );
    expect(result).toBe("No attendance selected");
  });

  test("returns message for empty attendance", () => {
    const result = getAttendanceDescription(
      [],
      moment(),
      moment().add(1, "day"),
    );
    expect(result).toBe("No attendance selected");
  });

  test("returns message for all zeros", () => {
    const result = getAttendanceDescription(
      [0, 0, 0, 0],
      moment(),
      moment().add(1, "day"),
    );
    expect(result).toBe("No attendance selected");
  });

  test("describes single period", () => {
    const timeBegin = moment("2025-01-17 18:00"); // Friday 6pm
    const timeEnd = moment("2025-01-19 12:00"); // Sunday 12pm

    // Only Friday evening selected
    const result = getAttendanceDescription(
      [1, 0, 0, 0, 0, 0, 0, 0],
      timeBegin,
      timeEnd,
    );
    expect(result).toBe("Friday evening");
  });

  test("describes continuous range on same day", () => {
    const timeBegin = moment("2025-01-17 18:00"); // Friday 6pm
    const timeEnd = moment("2025-01-19 12:00"); // Sunday 12pm

    // Friday evening and overnight
    const result = getAttendanceDescription(
      [1, 1, 0, 0, 0, 0, 0, 0],
      timeBegin,
      timeEnd,
    );
    expect(result).toBe("Friday evening and overnight");
  });

  test("describes continuous range across days", () => {
    const timeBegin = moment("2025-01-17 18:00"); // Friday 6pm
    const timeEnd = moment("2025-01-19 12:00"); // Sunday 12pm

    // Valid buckets: Fri Eve, Fri Over, Sat Morn, Sat Aft, Sat Eve, Sat Over, Sun Morn, Sun Aft
    // All 8 ones = Friday evening through Sunday afternoon
    const result = getAttendanceDescription(
      [1, 1, 1, 1, 1, 1, 1, 1],
      timeBegin,
      timeEnd,
    );
    expect(result).toBe("Friday evening until Sunday afternoon");
  });

  test("describes multiple discontinuous periods", () => {
    const timeBegin = moment("2025-01-17 18:00"); // Friday 6pm
    const timeEnd = moment("2025-01-19 12:00"); // Sunday 12pm

    // Valid buckets: Fri Eve, Fri Over, Sat Morn, Sat Aft, Sat Eve, Sat Over, Sun Morn, Sun Aft
    // [1, 0, 0, 0, 1, 0, 0, 1] = Friday evening, Saturday evening, Sunday afternoon
    const result = getAttendanceDescription(
      [1, 0, 0, 0, 1, 1, 0, 0],
      timeBegin,
      timeEnd,
    );
    expect(result).toBe("Friday evening and Saturday evening and overnight");
  });

  test("describes three separate ranges", () => {
    const timeBegin = moment("2025-01-17 18:00"); // Friday 6pm
    const timeEnd = moment("2025-01-19 12:00"); // Sunday 12pm

    // Valid buckets: Fri Eve, Fri Over, Sat Morn, Sat Aft, Sat Eve, Sat Over, Sun Morn, Sun Aft
    // [1, 0, 0, 0, 1, 0, 0, 1] = Friday evening, Saturday evening, Sunday afternoon
    const result = getAttendanceDescription(
      [1, 0, 0, 0, 1, 0, 0, 1],
      timeBegin,
      timeEnd,
    );
    expect(result).toBe(
      "Friday evening, Saturday evening, and Sunday afternoon",
    );
  });

  test("handles events starting mid-day", () => {
    const timeBegin = moment("2025-01-17 14:00"); // Friday 2pm (afternoon)
    const timeEnd = moment("2025-01-18 12:00"); // Saturday 12pm

    // Afternoon, evening, overnight, morning
    const result = getAttendanceDescription([1, 1, 1, 1], timeBegin, timeEnd);
    expect(result).toBe("Friday afternoon until Saturday morning");
  });
});
