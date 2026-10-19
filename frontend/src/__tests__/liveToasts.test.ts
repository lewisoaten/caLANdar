import { describe, expect, test } from "vitest";
import { initialLiveState, type LiveState } from "../live/store";
import { deriveToasts } from "../live/toasts";
import type { LobbyView } from "../live/types";

const T = (hhmm: string) => Date.parse(`2026-10-23T${hhmm}:00Z`);
const iso = (hhmm: string) => new Date(T(hhmm)).toISOString();

const lobby = (id: string, extra: Partial<LobbyView>): LobbyView => ({
  id,
  kind: "game",
  gameId: 548430,
  name: "Deep Rock Galactic",
  food: null,
  status: "planned",
  source: "plan",
  start: iso("20:00"),
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

const prejoin = (pid: string) => ({
  pid,
  team: null,
  random: false,
  createdAt: iso("19:00"),
  droppedAt: null,
  dropReason: null,
});

const member = (pid: string, via: "steam" | "manual" = "steam") => ({
  pid,
  team: null,
  via,
  joinedAt: iso("19:00"),
  leftAt: null,
  leftReason: null,
});

function stateWith(
  lobbies: LobbyView[],
  extra: Partial<LiveState> = {},
): LiveState {
  return {
    ...initialLiveState(1),
    me: "me",
    loadedAt: T("18:00"),
    lobbies: Object.fromEntries(lobbies.map((l) => [l.id, l])),
    ...extra,
  };
}

describe("deriveToasts", () => {
  test("a lobby nobody is in alerts the people pre-joined to it", () => {
    const s = stateWith([
      lobby("1", {
        status: "waiting",
        graceUntil: iso("20:05"),
        prejoins: [prejoin("me")],
      }),
    ]);
    const [t] = deriveToasts(s, T("20:01"));
    expect(t.cls).toBe("alert");
    expect(t.kicker).toBe("NOBODY'S IN YET");
    expect(t.countdownTo).toBe(T("20:05"));
    expect(t.actions.map((a) => a.kind)).toEqual(["join", "delay"]);
    expect(t.canHide).toBe(false);
    // Not for people who aren't in for it, nor once you're in.
    expect(deriveToasts({ ...s, me: "other" }, T("20:01"))).toEqual([]);
  });

  test("the alert id changes with the start, so it comes back after a delay", () => {
    const at = (start: string) =>
      deriveToasts(
        stateWith([
          lobby("1", {
            status: "waiting",
            start: iso(start),
            graceUntil: iso(start),
            prejoins: [prejoin("me")],
          }),
        ]),
        T("20:01"),
      )[0].id;
    expect(at("20:00")).not.toBe(at("20:30"));
  });

  test("your proposal needs a backer; an empty lobby offers close or rejoin", () => {
    const s = stateWith([
      lobby("1", {
        status: "proposed",
        proposedBy: "me",
        graceUntil: iso("19:45"),
      }),
      lobby("2", {
        status: "empty",
        emptySince: iso("19:30"),
        members: [{ ...member("me"), leftAt: iso("19:30") }],
      }),
    ]);
    const toasts = deriveToasts(s, T("19:41"));
    expect(toasts.map((t) => t.kicker)).toEqual([
      "NEEDS ONE BACKER",
      "EVERYONE LEFT",
    ]);
    expect(toasts[1].actions.map((a) => a.kind)).toEqual(["close", "rejoin"]);
  });

  test("starting soon, results and admin posts can be hidden", () => {
    const s = stateWith(
      [
        lobby("1", {
          status: "confirmed",
          start: iso("20:00"),
          prejoins: [prejoin("me")],
        }),
      ],
      {
        feed: [
          {
            seq: 5,
            at: iso("19:55"),
            kind: "feed",
            tier: 1,
            payload: {
              badge: "FINAL · BACKED",
              people: ["me"],
              title: "Phasmophobia",
            },
          },
          {
            seq: 6,
            at: iso("19:50"),
            kind: "toast.admin",
            tier: null,
            payload: { text: "Pizza", ttl: "10m" },
          },
        ],
      },
    );
    const toasts = deriveToasts(s, T("19:55"));
    expect(toasts.map((t) => [t.kicker, t.canHide])).toEqual([
      ["FROM THE ADMINS", true],
      ["STARTING SOON", true],
      ["FINAL · BACKED", true],
    ]);
    // Results last 10 seconds; admin posts 10 minutes.
    expect(deriveToasts(s, T("20:01")).map((t) => t.kicker)).toEqual([]);
  });

  test("a manual join past its planned end asks whether you're still playing", () => {
    const s = stateWith([
      lobby("1", {
        status: "live",
        start: iso("19:00"),
        minutes: 60,
        members: [member("me", "manual")],
      }),
    ]);
    expect(deriveToasts(s, T("19:59"))).toEqual([]);
    const [t] = deriveToasts(s, T("20:05"));
    expect(t.kicker).toBe("STILL PLAYING?");
    expect(t.actions.map((a) => a.kind)).toEqual(["stillPlaying", "leave"]);
  });

  test("new games ask for setup", () => {
    const s = stateWith([
      lobby("1", { status: "live", needsSetup: true, members: [member("me")] }),
    ]);
    expect(deriveToasts(s, T("19:10"))[0].kicker).toBe("NEW GAME");
  });
});
