import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  ActivityTickerView,
  TICKER_LOOP_SECONDS,
  tickerDurationSeconds,
  type ActivityTickerEvent,
} from "../components/ActivityTicker";

const item = (id: number): ActivityTickerEvent => ({
  id,
  timestamp: "2026-10-01T10:00:00Z",
  message: `Event ${id}`,
  icon: "👍",
  eventType: "game_vote",
});

describe("ticker pacing", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("loops a short feed in 75s (25% slower than the old 60s)", () => {
    expect(TICKER_LOOP_SECONDS).toBe(75);
    expect(tickerDurationSeconds(1)).toBe(75);
    expect(tickerDurationSeconds(8)).toBe(75);
  });

  it("keeps the same per-item pace for longer feeds", () => {
    expect(tickerDurationSeconds(16)).toBe(150);
    expect(tickerDurationSeconds(12) / 12).toBeCloseTo(75 / 8, 0);
  });

  it("applies the duration to the marquee track", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
    // Two items repeat to a run of 8 → the base 75s loop.
    render(<ActivityTickerView items={[item(1), item(2)]} />);
    expect(screen.getByTestId("activity-ticker-track")).toHaveStyle({
      animation: "hlTick 75s linear infinite",
    });
  });
});
