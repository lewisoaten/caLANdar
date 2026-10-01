import { describe, it, expect } from "vitest";
import {
  seatDisplayName,
  seatHeading,
  seatNameIfDifferent,
  seatSpokenName,
  seatSummary,
} from "../utils/seatName";

const sofa = {
  label: "S1",
  name: "Wall sofa (S)",
  description: "Next to the fridge",
};

describe("seat names", () => {
  it("uses the name, falling back to the identifier", () => {
    expect(seatDisplayName(sofa)).toBe("Wall sofa (S)");
    expect(seatDisplayName({ label: "A1", name: "  " })).toBe("A1");
    expect(seatDisplayName({ label: "A1", name: null })).toBe("A1");
    expect(seatDisplayName({ label: "A1" })).toBe("A1");
    expect(seatDisplayName({ label: "A1", name: " Corner " })).toBe("Corner");
  });

  it("adds the identifier when it differs from the name", () => {
    expect(seatHeading(sofa)).toBe("Wall sofa (S) · S1");
    expect(seatHeading({ label: "A1" })).toBe("A1");
    expect(seatHeading({ label: "A1", name: "a1" })).toBe("a1");
    expect(seatNameIfDifferent({ label: "A1", name: "a1" })).toBe("");
    expect(seatNameIfDifferent(sofa)).toBe("Wall sofa (S)");
  });

  it("summarises the seat for the claim panel", () => {
    expect(seatSummary(sofa)).toBe("Wall sofa (S) · S1 — Next to the fridge");
    expect(seatSummary({ label: "A2", description: " By the TV " })).toBe(
      "A2 — By the TV",
    );
    expect(seatSummary({ label: "A2" })).toBe("A2");
  });

  it("reads the identifier, then the name and description", () => {
    expect(seatSpokenName(sofa)).toBe("S1, Wall sofa (S), Next to the fridge");
    expect(seatSpokenName({ label: "A2", description: null })).toBe("A2");
  });
});
