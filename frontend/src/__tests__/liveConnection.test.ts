import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  HIDDEN_CLOSE_MS,
  LiveConnection,
  inLiveWindow,
  type LiveTransport,
  type TransportHandlers,
} from "../live/connection";
import { LiveStore } from "../live/store";

describe("inLiveWindow", () => {
  const begin = "2026-10-19T18:00:00Z";
  const end = "2026-10-21T16:00:00Z";
  test.each([
    ["2026-10-19T15:59:00Z", false],
    ["2026-10-19T16:00:00Z", true],
    ["2026-10-20T12:00:00Z", true],
    ["2026-10-21T17:00:00Z", true],
    ["2026-10-21T17:01:00Z", false],
  ])("%s -> %s", (now, expected) => {
    expect(inLiveWindow(begin, end, Date.parse(now))).toBe(expected);
  });
});

function fakeTransport() {
  const opened: Array<{
    since: number;
    h: TransportHandlers;
    closed: boolean;
  }> = [];
  const transport: LiveTransport = {
    open(_url, _token, since, h) {
      const entry = { since, h, closed: false };
      opened.push(entry);
      return {
        close: () => {
          entry.closed = true;
        },
      };
    },
  };
  return { transport, opened };
}

function fakeFetch(timeBegin: string, timeEnd: string) {
  return vi.fn(async (url: RequestInfo | URL) => {
    const u = String(url);
    if (u.endsWith("/stream-token"))
      return new Response(
        JSON.stringify({
          token: "t",
          streamUrl: "/api/events/1/live/stream",
          expiresAt: new Date(Date.now() + 12 * 3600e3).toISOString(),
        }),
      );
    return new Response(
      JSON.stringify({
        seq: 5,
        serverTime: new Date().toISOString(),
        isAdmin: false,
        feed: [],
        event: {
          id: 1,
          title: "LAN",
          timeBegin,
          timeEnd,
          discordInviteUrl: null,
          timezone: "Europe/London",
        },
      }),
    );
  }) as unknown as typeof fetch;
}

describe("LiveConnection", () => {
  let visibility: DocumentVisibilityState = "visible";
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-20T12:00:00Z"));
    visibility = "visible";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(
      () => visibility,
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const setup = (
    begin = "2026-10-19T18:00:00Z",
    end = "2026-10-21T16:00:00Z",
  ) => {
    const { transport, opened } = fakeTransport();
    const store = new LiveStore(1);
    const conn = new LiveConnection(store, {
      endpoint: { kind: "gamer", eventId: 1, token: "x" },
      transport,
      fetchImpl: fakeFetch(begin, end),
    });
    return { conn, store, opened };
  };

  test("opens a stream from the snapshot cursor during the event", async () => {
    const { conn, store, opened } = setup();
    conn.start();
    await vi.advanceTimersByTimeAsync(10);
    expect(opened).toHaveLength(1);
    expect(opened[0].since).toBe(5);
    opened[0].h.onOpen();
    expect(store.getState().status).toBe("live");
    opened[0].h.onRow({ seq: 6, at: "", kind: "feed", tier: 3, payload: {} });
    expect(store.getState().seq).toBe(6);
    conn.stop();
  });

  test("polls instead of streaming before the live window", async () => {
    const { conn, store, opened } = setup(
      "2026-10-25T18:00:00Z",
      "2026-10-27T16:00:00Z",
    );
    conn.start();
    await vi.advanceTimersByTimeAsync(10);
    expect(opened).toHaveLength(0);
    expect(store.getState().status).toBe("polling");
    conn.stop();
  });

  test("a hidden tab drops its stream after 2 minutes and resumes from its cursor", async () => {
    const { conn, store, opened } = setup();
    conn.start();
    await vi.advanceTimersByTimeAsync(10);
    opened[0].h.onOpen();
    opened[0].h.onRow({ seq: 7, at: "", kind: "feed", tier: 3, payload: {} });

    visibility = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(HIDDEN_CLOSE_MS - 1000);
    expect(opened[0].closed).toBe(false);
    await vi.advanceTimersByTimeAsync(2000);
    expect(opened[0].closed).toBe(true);
    expect(store.getState().status).toBe("paused");

    visibility = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(10);
    expect(opened).toHaveLength(2);
    expect(opened[1].since).toBe(7);
    conn.stop();
  });

  test("reset refetches the snapshot and reopens", async () => {
    const { conn, opened } = setup();
    conn.start();
    await vi.advanceTimersByTimeAsync(10);
    opened[0].h.onReset();
    await vi.advanceTimersByTimeAsync(10);
    expect(opened[0].closed).toBe(true);
    expect(opened).toHaveLength(2);
    conn.stop();
  });
});
