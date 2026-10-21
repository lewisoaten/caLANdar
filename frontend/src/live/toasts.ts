/**
 * Toasts are derived, not stored (docs/live-event/DESIGN.md §7.3): a pure
 * function of the live state, the viewer and the time. The id is
 * `kind:entityId[:startAt]`, so "the same alert shows again after a delay"
 * works by itself: the start changed, so the id is new and an earlier hide
 * doesn't apply.
 */
import { colors } from "../components/hl/tokens";
import type { LiveState } from "./store";
import type { LobbyView } from "./types";
import {
  activePrejoins,
  clock,
  currentMembers,
  myNow,
  plannedEnd,
  visibleLobbies,
} from "./selectors";

export type ToastClass =
  "alert" | "own" | "setup" | "soon" | "result" | "admin";

export type ToastActionKind =
  | "join"
  | "delay"
  | "close"
  | "moreTime"
  | "prejoin"
  | "rejoin"
  | "stillPlaying"
  | "leave"
  | "select"
  | "setup"
  | "ballot"
  | "showVote";

export interface ToastAction {
  label: string;
  kind: ToastActionKind;
  lobbyId?: string;
  voteId?: string;
  optionId?: string;
  primary?: boolean;
}

export interface Toast {
  id: string;
  cls: ToastClass;
  /** Border and glow. */
  color: string;
  /** Solid dark tinted background. */
  bg: string;
  kicker: string;
  title: string;
  sub?: string;
  /** Countdown target (server ms). */
  countdownTo?: number;
  /** For the progress bar: [from, to] (server ms). */
  progress?: [number, number];
  life: string;
  canHide: boolean;
  actions: ToastAction[];
  gameId?: number | null;
  kind?: "game" | "food";
  /** When an informational toast first appeared (server ms): it folds
   * into a pill a while later so it doesn't cover the page. */
  shownAt?: number;
  /** People rows: IN / WAITING ON. */
  people?: { label: string; pids: string[] }[];
}

export const RESULT_MS = 10_000;
export const ADMIN_POST_MS = 10 * 60_000;
export const STARTS_SOON_MS = 10 * 60_000;
/** A vote toast offers each option as a button up to this many. */
export const VOTE_BUTTONS = 3;

const VOTE_KICKER: Record<string, string> = {
  slot: "WHAT'S ON · VOTE",
  extend: "KEEP PLAYING? · VOTE",
  delay: "DELAY? · VOTE",
  change: "CHANGE? · VOTE",
  kickoff: "KICK OFF EARLY? · VOTE",
};

const STYLE: Record<ToastClass, { color: string; bg: string }> = {
  alert: { color: colors.pink, bg: "#2a0a17" },
  own: { color: colors.violetLight, bg: "#170f2e" },
  setup: { color: colors.cyan, bg: "#071c22" },
  soon: { color: colors.cyan, bg: "#071c22" },
  result: { color: colors.lime, bg: "#0f1d08" },
  admin: { color: colors.amber, bg: "#231904" },
};

const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : NaN);

function base(cls: ToastClass): Pick<Toast, "cls" | "color" | "bg"> {
  return { cls, ...STYLE[cls] };
}

/** Is `me` interested in a lobby that needs people (pre-joined or voted)? */
function interested(state: LiveState, l: LobbyView, me: string): boolean {
  if (activePrejoins(l).some((p) => p.pid === me)) return true;
  if (l.proposedBy === me) return true;
  const origin = l.createdByVote ? state.votes[l.createdByVote] : null;
  return Boolean(
    origin?.options
      .find((o) => o.id === origin.winnerOptionId)
      ?.voters.includes(me),
  );
}

/** Every toast for the viewer now, most urgent first. */
export function deriveToasts(state: LiveState, now: number): Toast[] {
  const me = state.me;
  const out: Toast[] = [];
  const mine = myNow(state);
  const myRsvp = me ? state.people[me]?.rsvp : null;
  const attending = myRsvp === "yes" || myRsvp === "maybe";

  if (me) {
    for (const l of visibleLobbies(state)) {
      const inIt = currentMembers(l).some((m) => m.pid === me);
      // Cyan: a lobby you're in for started before its scheduled time.
      // Your grace runs to five minutes after the scheduled start.
      const early = l.status === "grace" && now < ms(l.start);
      if (early && !inIt && interested(state, l, me)) {
        out.push({
          id: `early:${l.id}:${l.start}`,
          ...base("soon"),
          kicker: "STARTED EARLY",
          title: `${l.name} started early`,
          sub: `Join whenever you're ready, by ${clock(ms(l.graceUntil))}`,
          countdownTo: ms(l.graceUntil),
          shownAt: ms(l.actualStart) || now,
          life: `UNTIL ${clock(ms(l.graceUntil))}`,
          canHide: true,
          gameId: l.gameId,
          kind: l.kind,
          actions: [
            { label: "Join now", kind: "join", lobbyId: l.id, primary: true },
            { label: "Show", kind: "select", lobbyId: l.id },
          ],
        });
      }
      // Pink: a lobby starting that you're in for, and you're not in it.
      if (
        !early &&
        (l.status === "waiting" || l.status === "grace") &&
        !inIt &&
        interested(state, l, me)
      ) {
        const waiting = l.status === "waiting";
        out.push({
          id: `grace:${l.id}:${l.start}`,
          ...base("alert"),
          kicker: waiting ? "NOBODY'S IN YET" : "STARTING · JOIN NOW",
          title: waiting
            ? `${l.name} started ${clock(l.start)}`
            : mine
              ? `Join now or stay in ${mine.name}`
              : `Join ${l.name} now`,
          sub: waiting
            ? "Join now, or vote to delay the start"
            : "Anyone still elsewhere when this runs out drops out",
          countdownTo: ms(l.graceUntil),
          progress: [ms(l.start), ms(l.graceUntil)],
          life: "UNTIL RESOLVED",
          canHide: false,
          gameId: l.gameId,
          kind: l.kind,
          actions: [
            { label: "Join now", kind: "join", lobbyId: l.id, primary: true },
            ...(waiting
              ? [
                  {
                    label: "Delay start…",
                    kind: "delay" as const,
                    lobbyId: l.id,
                  },
                ]
              : []),
          ],
          people: [
            { label: "IN", pids: currentMembers(l).map((m) => m.pid) },
            {
              label: "WAITING ON",
              pids: activePrejoins(l)
                .map((p) => p.pid)
                .filter((pid) => !currentMembers(l).some((m) => m.pid === pid)),
            },
          ],
        });
      }
      if (l.status === "delayed" && interested(state, l, me)) {
        out.push({
          id: `delayed:${l.id}:${l.start}`,
          ...base("alert"),
          kicker: "DELAY VOTE OPEN",
          title: `${l.name} is on hold`,
          sub: "The grace is held while you vote",
          life: "UNTIL RESOLVED",
          canHide: false,
          gameId: l.gameId,
          kind: l.kind,
          actions: [
            { label: "Join now", kind: "join", lobbyId: l.id, primary: true },
          ],
        });
      }
      // Violet: your proposal needs a backer.
      if (l.status === "proposed" && l.proposedBy === me) {
        out.push({
          id: `backer:${l.id}`,
          ...base("own"),
          kicker: "NEEDS ONE BACKER",
          title: `${l.name} · ${clock(l.start)}`,
          sub: "One more pre-join and it's on. Otherwise it disappears.",
          countdownTo: ms(l.graceUntil),
          life: "UNTIL RESOLVED",
          canHide: false,
          gameId: l.gameId,
          kind: l.kind,
          actions: [
            { label: "+5 min", kind: "moreTime", lobbyId: l.id },
            { label: "Show", kind: "select", lobbyId: l.id },
          ],
        });
      }
      // Cyan: someone else's proposal needs a backer, and you could be it.
      if (
        l.status === "proposed" &&
        l.proposedBy !== me &&
        attending &&
        !activePrejoins(l).some((p) => p.pid === me)
      ) {
        const who = l.proposedBy ? state.people[l.proposedBy]?.handle : null;
        out.push({
          id: `proposal:${l.id}`,
          ...base("soon"),
          kicker: "NEEDS ONE BACKER",
          title: `${who ?? "Someone"} proposed ${l.name} · ${
            Date.parse(l.start) <= now ? "now" : clock(l.start)
          }`,
          sub: "Pre-join to back it, or it disappears.",
          countdownTo: ms(l.graceUntil),
          // Folds into a pill a while after it was proposed.
          shownAt:
            ms(
              activePrejoins(l).find((p) => p.pid === l.proposedBy)?.createdAt,
            ) || now,
          life: "UNTIL BACKED",
          canHide: true,
          gameId: l.gameId,
          kind: l.kind,
          actions: [
            { label: "I'm in", kind: "prejoin", lobbyId: l.id, primary: true },
            { label: "Show", kind: "select", lobbyId: l.id },
          ],
        });
      }
      // Violet: everyone left a lobby you were in (or proposed).
      if (
        l.status === "empty" &&
        (l.members.some((m) => m.pid === me) || l.proposedBy === me) &&
        !mine
      ) {
        // More time is kept in graceUntil (see the API's `more_time`).
        const closes = Math.max(
          ms(l.emptySince) + 5 * 60_000,
          ms(l.graceUntil) || 0,
        );
        out.push({
          id: `empty:${l.id}:${l.emptySince}`,
          ...base("own"),
          kicker: "EVERYONE LEFT",
          title: `${l.name} is empty`,
          sub: `It closes at ${clock(closes)} and ends when the last person left`,
          countdownTo: closes,
          life: "UNTIL RESOLVED",
          canHide: false,
          gameId: l.gameId,
          kind: l.kind,
          actions: [
            { label: "Close now", kind: "close", lobbyId: l.id, primary: true },
            { label: "+5 min", kind: "moreTime", lobbyId: l.id },
            { label: "Rejoin", kind: "rejoin", lobbyId: l.id },
          ],
        });
      }
      // Cyan: setup for a game Steam just started for you.
      if (l.needsSetup && inIt) {
        out.push({
          id: `setup:${l.id}`,
          ...base("setup"),
          kicker: "NEW GAME",
          title: `You started playing ${l.name}`,
          sub: "How many play, and in what teams? Saved for everyone.",
          life: "UNTIL SAVED",
          canHide: false,
          gameId: l.gameId,
          kind: l.kind,
          actions: [
            { label: "Set up", kind: "setup", lobbyId: l.id, primary: true },
          ],
        });
      }
      // Cyan: a lobby you pre-joined starts within 10 minutes.
      const start = ms(l.start);
      if (
        (l.status === "confirmed" || l.status === "planned") &&
        activePrejoins(l).some((p) => p.pid === me) &&
        start > now &&
        start - now <= STARTS_SOON_MS
      ) {
        out.push({
          id: `soon:${l.id}:${l.start}`,
          ...base("soon"),
          kicker: "STARTING SOON",
          title: `${l.name} · ${clock(l.start)}`,
          countdownTo: start,
          progress: [start - STARTS_SOON_MS, start],
          shownAt: start - STARTS_SOON_MS,
          life: `UNTIL ${clock(start)}`,
          canHide: true,
          gameId: l.gameId,
          kind: l.kind,
          actions: [{ label: "Show", kind: "select", lobbyId: l.id }],
        });
      }
    }

    // Pink: joined by hand while Steam shows another game.
    const p = state.people[me]?.presence;
    if (
      p?.switchLobbyId &&
      p.switchGraceUntil &&
      ms(p.switchGraceUntil) > now
    ) {
      const target = state.lobbies[p.switchLobbyId];
      out.push({
        id: `switch:${p.switchLobbyId}:${p.switchGraceUntil}`,
        ...base("alert"),
        kicker: "ONE GAME AT A TIME",
        title: `Launch ${target?.name ?? "the game"} to switch`,
        sub: `Steam still shows ${p.gameName ?? "another game"}`,
        countdownTo: ms(p.switchGraceUntil),
        life: "UNTIL RESOLVED",
        canHide: false,
        gameId: target?.gameId,
        kind: target?.kind,
        actions: [],
      });
    }

    // Lime: a manual "now" past its planned end.
    if (mine) {
      const member = currentMembers(mine).find((m) => m.pid === me);
      if (member && member.via !== "steam" && now > plannedEnd(mine)) {
        out.push({
          id: `still:${mine.id}:${mine.minutes}`,
          ...base("result"),
          kicker: "STILL PLAYING?",
          title: `Still playing ${mine.name}?`,
          sub: "Otherwise you'll be taken out of it 30 minutes after its planned end",
          countdownTo: plannedEnd(mine) + 30 * 60_000,
          life: "UNTIL ANSWERED",
          canHide: false,
          gameId: mine.gameId,
          kind: mine.kind,
          actions: [
            {
              label: "Still playing",
              kind: "stillPlaying",
              lobbyId: mine.id,
              primary: true,
            },
            { label: "I'm done", kind: "leave" },
          ],
        });
      }
    }
  }

  // Cyan: an open vote you're involved in and haven't voted on yet.
  if (me) {
    for (const v of Object.values(state.votes)) {
      if (v.status !== "open" || !v.involved.includes(me)) continue;
      if (v.options.some((o) => o.voters.includes(me))) continue;
      const opener = state.people[v.openedBy]?.handle;
      const few = v.options.length <= VOTE_BUTTONS;
      out.push({
        id: `vote:${v.id}`,
        ...base("soon"),
        kicker: VOTE_KICKER[v.type] ?? "VOTE",
        title: v.title,
        sub: opener && v.openedBy !== me ? `${opener} called it` : undefined,
        countdownTo: ms(v.settleAt ?? v.deadline),
        shownAt: ms(v.openedAt) || now,
        life: "UNTIL YOU VOTE",
        canHide: true,
        actions: [
          ...(few
            ? v.options.map((o, i) => ({
                label: o.name,
                kind: "ballot" as const,
                voteId: v.id,
                optionId: o.id,
                primary: i === 0,
              }))
            : []),
          {
            label: few ? "Show" : "Vote…",
            kind: "showVote" as const,
            voteId: v.id,
            primary: !few,
          },
        ],
      });
    }
  }

  // Results: T1/T2 feed rows that involve me, newer than page load, for 10s.
  const since = state.loadedAt ?? now;
  for (const row of state.feed) {
    const at = Date.parse(row.at);
    if (row.tier == null || row.tier > 2 || at < since || now - at > RESULT_MS)
      continue;
    const p = row.payload ?? {};
    const voted = ((p.options ?? []) as { voters?: string[] }[]).some((o) =>
      (o.voters ?? []).includes(me ?? ""),
    );
    const involves =
      me != null && (p.actor === me || (p.people ?? []).includes(me) || voted);
    if (!involves) continue;
    out.push({
      id: `result:${row.seq}`,
      ...base("result"),
      kicker: String(p.badge ?? p.kicker ?? p.text ?? "UPDATE").toUpperCase(),
      title: p.title ?? p.name ?? "",
      sub:
        p.type === "lobby.split"
          ? "Anyone still elsewhere dropped out"
          : undefined,
      progress: [at, at + RESULT_MS],
      countdownTo: at + RESULT_MS,
      life: "HIDES IN",
      canHide: true,
      gameId: p.gameId ?? null,
      kind: p.lobbyKind ?? "game",
      actions: p.lobbyId
        ? [{ label: "Show", kind: "select", lobbyId: p.lobbyId }]
        : [],
    });
  }

  // Amber: admin posts within their lifetime.
  for (const row of state.feed) {
    if (row.kind !== "toast.admin") continue;
    const at = Date.parse(row.at);
    const p = row.payload ?? {};
    const forever = p.ttl === "dismiss";
    if (!forever && now - at > ADMIN_POST_MS) continue;
    out.push({
      id: `admin:${row.seq}`,
      shownAt: at,
      ...base("admin"),
      kicker: "FROM THE ADMINS",
      title: p.text ?? "",
      life: forever ? "UNTIL DISMISSED" : `UNTIL ${clock(at + ADMIN_POST_MS)}`,
      countdownTo: forever ? undefined : at + ADMIN_POST_MS,
      canHide: true,
      actions: [],
    });
  }

  // Personal rows: nudges and hints.
  for (const row of state.personal) {
    const at = Date.parse(row.at);
    if (now - at > ADMIN_POST_MS) continue;
    const p = row.payload ?? {};
    out.push({
      id: `personal:${row.seq}`,
      shownAt: at,
      ...base(p.kind === "nudge" ? "admin" : "setup"),
      kicker: p.kind === "nudge" ? "NUDGE" : "STEAM",
      title:
        p.kind === "nudge"
          ? (p.data?.text ?? "The admins are looking for you")
          : "Steam isn't sharing your game",
      sub:
        p.kind === "steam-private"
          ? "Join lobbies by hand, or make Game details public in Steam's privacy settings."
          : undefined,
      life: "UNTIL DISMISSED",
      canHide: true,
      actions: [],
    });
  }

  const order: ToastClass[] = [
    "alert",
    "own",
    "setup",
    "admin",
    "soon",
    "result",
  ];
  return out.sort((a, b) => order.indexOf(a.cls) - order.indexOf(b.cls));
}
