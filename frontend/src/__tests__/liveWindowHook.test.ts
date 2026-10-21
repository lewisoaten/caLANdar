import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useInLiveWindow } from "../live/useLive";

describe("useInLiveWindow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-10-19T15:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  const begin = "2026-10-19T18:00:00Z";
  const end = "2026-10-21T16:00:00Z";

  test("turns on when the window opens on a page left open", () => {
    const { result } = renderHook(() => useInLiveWindow(begin, end));
    expect(result.current).toBe(false);
    act(() => {
      vi.advanceTimersByTime(60 * 60 * 1000);
    });
    expect(result.current).toBe(true);
  });

  test("turns on straight away when the times arrive mid-event", () => {
    vi.setSystemTime(Date.parse("2026-10-20T12:00:00Z"));
    const { result, rerender } = renderHook(
      ({ b, e }: { b: string | null; e: string | null }) =>
        useInLiveWindow(b, e),
      {
        initialProps: { b: null, e: null } as {
          b: string | null;
          e: string | null;
        },
      },
    );
    expect(result.current).toBe(false);
    rerender({ b: begin, e: end });
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(result.current).toBe(true);
  });
});
