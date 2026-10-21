import { describe, expect, test } from "vitest";
import {
  applyEntities,
  applyRow,
  applySnapshot,
  initialLiveState,
} from "../live/store";
import { applyCommandResult } from "../live/commands";
import type { LiveLogEntry, LiveSnapshot, LobbyView } from "../live/types";

const lobby = (id: string, extra: Partial<LobbyView> = {}): LobbyView => ({
  id,
  kind: "game",
  gameId: 730,
  name: "Counter-Strike 2",
  food: null,
  status: "planned",
  source: "plan",
  start: "2026-10-19T19:00:00Z",
  minutes: 120,
  plannedStart: null,
  plannedMinutes: null,
  actualStart: null,
  actualEnd: null,
  maxPlayers: null,
  teams: null,
  proposedBy: null,
  createdByVote: null,
  graceUntil: null,
  graceLocked: false,
  emptySince: null,
  members: [],
  prejoins: [],
  needsSetup: false,
  typical: null,
  virtual: false,
  ...extra,
});

const row = (
  seq: number,
  kind: string,
  payload: unknown,
  tier: number | null = null,
): LiveLogEntry => ({ seq, at: "2026-10-19T19:00:00Z", kind, tier, payload });

const snapshot: LiveSnapshot = {
  seq: 10,
  serverTime: "2026-10-19T19:00:05Z",
  isAdmin: false,
  lobbies: [lobby("1"), lobby("2", { status: "removed" })],
  feed: [row(9, "feed", { key: "a" }, 3), row(8, "toast.personal", {})],
};

describe("applySnapshot", () => {
  test("replaces state and keeps removed lobbies out", () => {
    const now = Date.parse("2026-10-19T19:00:00Z");
    const s = applySnapshot(initialLiveState(1), snapshot, now);
    expect(s.loaded).toBe(true);
    expect(s.seq).toBe(10);
    expect(s.serverOffset).toBe(5000);
    expect(Object.keys(s.lobbies)).toEqual(["1"]);
    expect(s.feed.map((r) => r.seq)).toEqual([9]);
    expect(s.personal.map((r) => r.seq)).toEqual([8]);
    expect(s.loadedAt).toBe(now);
  });
});

describe("applyRow", () => {
  const base = applySnapshot(initialLiveState(1), snapshot, 0);

  test("ignores rows at or before the cursor (replays are harmless)", () => {
    expect(applyRow(base, row(10, "lobby", lobby("3")), 1)).toBe(base);
  });

  test("upserts and deletes lobbies by id", () => {
    let s = applyRow(base, row(11, "lobby", lobby("1", { status: "live" })), 1);
    expect(s.lobbies["1"].status).toBe("live");
    expect(s.seq).toBe(11);
    s = applyRow(s, row(12, "lobby", lobby("1", { status: "removed" })), 1);
    expect(s.lobbies["1"]).toBeUndefined();
    s = applyRow(s, row(13, "lobby", lobby("4")), 1);
    s = applyRow(s, row(14, "lobby.delete", { id: "4" }), 1);
    expect(s.lobbies["4"]).toBeUndefined();
  });

  test("plan rows replace only the virtual lobbies", () => {
    let s = applyRow(
      base,
      row(11, "plan", { lobbies: [lobby("s1@0", { virtual: true })] }),
      1,
    );
    expect(Object.keys(s.lobbies).sort()).toEqual(["1", "s1@0"]);
    s = applyRow(
      s,
      row(12, "plan", { lobbies: [lobby("s2@0", { virtual: true })] }),
      1,
    );
    expect(Object.keys(s.lobbies).sort()).toEqual(["1", "s2@0"]);
  });

  test("feed rows append and feed.delete removes by key", () => {
    let s = applyRow(base, row(11, "feed", { key: "b" }, 2), 1);
    s = applyRow(s, row(12, "toast.admin", { text: "Pizza" }), 1);
    expect(s.feed.map((r) => r.seq)).toEqual([9, 11, 12]);
    s = applyRow(s, row(13, "feed.delete", { key: "b" }), 1);
    expect(s.feed.map((r) => r.seq)).toEqual([9, 12]);
  });
});

describe("applyEntities", () => {
  test("applies command results without moving the cursor", () => {
    const base = applySnapshot(initialLiveState(1), snapshot, 0);
    const s = applyEntities(base, {
      lobbies: [lobby("1", { status: "confirmed" })],
      deletedLobbies: ["nope"],
    });
    expect(s.lobbies["1"].status).toBe("confirmed");
    expect(s.seq).toBe(base.seq);
  });

  test("a command response the stream has already passed is ignored", () => {
    const base = applySnapshot(initialLiveState(1), snapshot, 0);
    const result = (seq: number) => ({
      seq,
      lobbies: [lobby("1", { status: "confirmed" })],
      deletedLobbies: [],
      people: [],
      votes: [],
    });
    expect(applyCommandResult(base, result(base.seq))).toBe(base);
    const ahead = applyCommandResult(base, result(base.seq + 1));
    expect(ahead.lobbies["1"].status).toBe("confirmed");
    expect(ahead.seq).toBe(base.seq);
  });
});
