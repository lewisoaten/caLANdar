import { describe, expect, test } from "vitest";
import { initialLiveState, type LiveState } from "../live/store";
import {
  blockLook,
  defaultSelection,
  floorGroups,
  lengthLabel,
  lobbySpan,
  myNext,
  myNow,
  packLanes,
  upNext,
} from "../live/selectors";
import type { LobbyView } from "../live/types";

const T = (hhmm: string) => Date.parse(`2026-10-23T${hhmm}:00Z`);

const lobby = (
  id: string,
  start: string,
  minutes: number,
  extra: Partial<LobbyView> = {},
): LobbyView => ({
  id,
  kind: "game",
  gameId: 730,
  name: `Game ${id}`,
  food: null,
  status: "planned",
  source: "plan",
  start: new Date(T(start)).toISOString(),
  minutes,
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

const member = (pid: string, leftAt: string | null = null) => ({
  pid,
  team: null,
  via: "steam" as const,
  joinedAt: new Date(T("19:00")).toISOString(),
  leftAt,
  leftReason: null,
});

const prejoin = (pid: string) => ({
  pid,
  team: null,
  random: false,
  createdAt: new Date(T("18:00")).toISOString(),
  droppedAt: null,
  dropReason: null,
});

function stateWith(lobbies: LobbyView[]): LiveState {
  const s = initialLiveState(1);
  return {
    ...s,
    me: "me",
    lobbies: Object.fromEntries(lobbies.map((l) => [l.id, l])),
  };
}

describe("lobbySpan", () => {
  test("planned lobbies use the plan; running ones stretch to now", () => {
    const l = lobby("1", "19:00", 60);
    expect(lobbySpan(l, T("19:30"))).toEqual([T("19:00"), T("20:00")]);
    const live = lobby("2", "19:00", 60, {
      status: "live",
      actualStart: new Date(T("19:10")).toISOString(),
    });
    expect(lobbySpan(live, T("20:30"))).toEqual([T("19:10"), T("20:30")]);
    const done = {
      ...live,
      status: "done" as const,
      actualEnd: new Date(T("19:50")).toISOString(),
    };
    expect(lobbySpan(done, T("23:00"))).toEqual([T("19:10"), T("19:50")]);
  });
});

describe("packLanes", () => {
  test("your lobbies get YOU rows first, then numbered lanes", () => {
    const mine = lobby("a", "19:00", 120, { members: [member("me")] });
    const mineToo = lobby("b", "20:00", 60, { prejoins: [prejoin("me")] });
    const other = lobby("c", "19:00", 60);
    const other2 = lobby("d", "20:00", 60);
    const lanes = packLanes([other, mine, mineToo, other2], "me", T("19:30"));
    expect(lanes.map((l) => [l.label, l.lobbies.map((x) => x.id)])).toEqual([
      ["YOU", ["a"]],
      ["YOU", ["b"]],
      ["3", ["c", "d"]],
    ]);
  });
});

describe("me and up next", () => {
  test("now is where I'm a current member; next is my pre-join", () => {
    const s = stateWith([
      lobby("now", "19:00", 120, { status: "live", members: [member("me")] }),
      lobby("left", "18:00", 60, {
        status: "done",
        members: [member("me", "x")],
      }),
      lobby("next", "22:00", 60, {
        status: "confirmed",
        prejoins: [prejoin("me")],
      }),
      lobby("later", "23:00", 60),
    ]);
    expect(myNow(s)?.id).toBe("now");
    expect(myNext(s, T("20:00"))?.id).toBe("next");
    expect(upNext(s, T("20:00")).map((l) => l.id)).toEqual(["next", "later"]);
    expect(defaultSelection(s, T("20:00"))).toBe("now");
  });
});

describe("blockLook", () => {
  test("labels follow the state table", () => {
    const now = T("20:00");
    expect(blockLook(lobby("1", "21:00", 60), {}, now).label).toBe("PLANNED");
    expect(
      blockLook(lobby("1", "21:00", 60, { status: "confirmed" }), {}, now)
        .label,
    ).toBe("PRE-JOIN");
    expect(
      blockLook(lobby("1", "19:00", 60, { status: "waiting" }), {}, now).label,
    ).toBe("NOBODY IN");
    expect(
      blockLook(lobby("1", "19:00", 60, { status: "done" }), {}, now).label,
    ).toBe("");
    expect(
      blockLook(
        lobby("1", "19:00", 60, {
          status: "empty",
          emptySince: new Date(T("19:40")).toISOString(),
        }),
        {},
        now,
      ).label,
    ).toMatch(/^EMPTY · CLOSES /);
  });
});

describe("floorGroups", () => {
  test("seats of current members group by lobby", () => {
    const s = stateWith([
      lobby("1", "19:00", 120, {
        status: "live",
        members: [member("a"), member("b"), member("c", "x")],
      }),
    ]);
    s.floor = {
      rooms: [],
      seats: [
        {
          id: 1,
          roomId: 1,
          label: "A1",
          name: null,
          x: 0,
          y: 0,
          gridCol: 0,
          gridRow: 0,
          pid: "a",
        },
        {
          id: 2,
          roomId: 1,
          label: "A2",
          name: null,
          x: 0,
          y: 0,
          gridCol: 1,
          gridRow: 0,
          pid: "b",
        },
        {
          id: 3,
          roomId: 1,
          label: "A3",
          name: null,
          x: 0,
          y: 0,
          gridCol: 2,
          gridRow: 0,
          pid: "c",
        },
      ],
    };
    const groups = floorGroups(s);
    expect(groups).toHaveLength(1);
    expect(groups[0].seatIds).toEqual([1, 2]);
    expect(groups[0].label).toBe("GAME 1 · 2");
  });
});

test("lengthLabel", () => {
  expect(lengthLabel(45)).toBe("45M");
  expect(lengthLabel(120)).toBe("2H");
  expect(lengthLabel(90)).toBe("1H 30");
});
