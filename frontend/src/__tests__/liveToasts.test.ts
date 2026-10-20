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

  test("a lobby started early is calm until its scheduled start", () => {
    const at = (hhmm: string) =>
      deriveToasts(
        stateWith([
          lobby("1", {
            status: "grace",
            start: iso("21:30"),
            actualStart: iso("20:57"),
            graceUntil: iso("21:35"),
            prejoins: [prejoin("me")],
          }),
        ]),
        T(hhmm),
      )[0];
    const early = at("21:00");
    expect(early.kicker).toBe("STARTED EARLY");
    expect(early.cls).toBe("soon");
    expect(early.canHide).toBe(true);
    expect(early.actions[0].kind).toBe("join");
    // From the scheduled start it's the usual pink alert.
    const due = at("21:31");
    expect(due.cls).toBe("alert");
    expect(due.kicker).toBe("STARTING · JOIN NOW");
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
    expect(toasts[0].actions.map((a) => a.kind)).toEqual([
      "moreTime",
      "select",
    ]);
    expect(toasts[1].actions.map((a) => a.kind)).toEqual([
      "close",
      "moreTime",
      "rejoin",
    ]);
    expect(toasts[1].countdownTo).toBe(T("19:35"));
    // More time on the empty lobby moves its close.
    const kept = deriveToasts(
      {
        ...s,
        lobbies: {
          ...s.lobbies,
          "2": { ...s.lobbies["2"], graceUntil: iso("19:45") },
        },
      },
      T("19:41"),
    );
    expect(kept[1].countdownTo).toBe(T("19:45"));
  });

  test("someone else's proposal asks attendees to back it", () => {
    const person = (rsvp: "yes" | "no") => ({
      me: { pid: "me", handle: "Me", rsvp } as never,
      ana: { pid: "ana", handle: "Ana", rsvp: "yes" } as never,
    });
    const s = stateWith(
      [
        lobby("1", {
          status: "proposed",
          kind: "food",
          name: "Fry Up",
          start: iso("19:40"),
          proposedBy: "ana",
          graceUntil: iso("19:45"),
          prejoins: [prejoin("ana")],
        }),
      ],
      { people: person("yes") },
    );
    const [t] = deriveToasts(s, T("19:41"));
    expect(t.kicker).toBe("NEEDS ONE BACKER");
    expect(t.title).toBe("Ana proposed Fry Up · now");
    expect(t.countdownTo).toBe(T("19:45"));
    expect(t.canHide).toBe(true);
    expect(t.actions[0]).toMatchObject({ kind: "prejoin", lobbyId: "1" });
    // Not once you've backed it, nor if you aren't coming.
    const backed = {
      ...s,
      lobbies: {
        "1": { ...s.lobbies["1"], prejoins: [prejoin("ana"), prejoin("me")] },
      },
    };
    expect(deriveToasts(backed, T("19:41"))).toEqual([]);
    expect(deriveToasts({ ...s, people: person("no") }, T("19:41"))).toEqual(
      [],
    );
  });

  test("an open vote asks the people involved who haven't voted", () => {
    const option = (id: string, name: string, voters: string[]) =>
      ({ id, name, kind: "yes", voters }) as never;
    const vote = {
      id: "9",
      type: "extend",
      title: "Keep playing CS2 +30m?",
      status: "open",
      openedBy: "ana",
      openedAt: iso("19:40"),
      deadline: iso("19:45"),
      settleAt: null,
      involved: ["me", "ana"],
      options: [option("1", "Keep playing", ["ana"]), option("2", "No", [])],
    } as never;
    const s = stateWith([], {
      votes: { "9": vote },
      people: { ana: { pid: "ana", handle: "Ana" } as never },
    });
    const [t] = deriveToasts(s, T("19:41"));
    expect(t.kicker).toBe("KEEP PLAYING? · VOTE");
    expect(t.sub).toBe("Ana called it");
    expect(t.countdownTo).toBe(T("19:45"));
    expect(t.actions.map((a) => [a.kind, a.optionId])).toEqual([
      ["ballot", "1"],
      ["ballot", "2"],
      ["showVote", undefined],
    ]);
    // Gone once you've voted, and never for people not involved.
    const voted = {
      ...s,
      votes: {
        "9": {
          ...(vote as object),
          options: [option("1", "Keep playing", ["ana", "me"])],
        } as never,
      },
    };
    expect(deriveToasts(voted, T("19:41"))).toEqual([]);
    expect(deriveToasts({ ...s, me: "cy" }, T("19:41"))).toEqual([]);
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
