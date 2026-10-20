/**
 * Pure selectors over the Live state (docs/live-event/DESIGN.md §7.1):
 * timeline lanes, block states, "me", up next and the floor groups. Free of
 * React so they can be unit tested directly.
 */
import { colors, tint } from "../components/hl/tokens";
import type { LiveState } from "./store";
import type { LobbyView, PersonView, VoteView } from "./types";

const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : NaN);
const HOUR = 3600_000;
const MIN = 60_000;

/** Planned end of a lobby (start + length). */
export const plannedEnd = (l: LobbyView) => ms(l.start) + l.minutes * MIN;

/**
 * Where a lobby sits on the timeline: actual times once played, running
 * lobbies stretch to now if they run over.
 */
export function lobbySpan(l: LobbyView, now: number): [number, number] {
  const start = l.actualStart ? ms(l.actualStart) : ms(l.start);
  let end: number;
  if (l.actualEnd) end = ms(l.actualEnd);
  else if (l.status === "live" || l.status === "empty" || l.status === "grace")
    end = Math.max(now, plannedEnd(l), start + 15 * MIN);
  else end = plannedEnd(l);
  return [start, Math.max(end, start + 5 * MIN)];
}

/** Members in the lobby right now. */
export const currentMembers = (l: LobbyView) =>
  l.members.filter((m) => m.leftAt == null);

/** Active pre-joins. */
export const activePrejoins = (l: LobbyView) =>
  l.prejoins.filter((p) => p.droppedAt == null);

/** People in or pre-joined to a lobby (in first). */
export function lobbyPeople(l: LobbyView): string[] {
  const out: string[] = [];
  for (const m of currentMembers(l)) if (!out.includes(m.pid)) out.push(m.pid);
  for (const p of activePrejoins(l)) if (!out.includes(p.pid)) out.push(p.pid);
  if (out.length === 0 && (l.status === "done" || l.status === "empty"))
    for (const m of l.members) if (!out.includes(m.pid)) out.push(m.pid);
  return out;
}

/** Is `me` in, pre-joined to, or a past member of this lobby? */
export function involvesMe(l: LobbyView, me: string | null): boolean {
  if (!me) return false;
  return (
    l.members.some((m) => m.pid === me) ||
    activePrejoins(l).some((p) => p.pid === me)
  );
}

/** Visible lobbies (removed ones never are). */
export const visibleLobbies = (state: LiveState) =>
  Object.values(state.lobbies).filter((l) => l.status !== "removed");

export interface Lane {
  /** `YOU` for your rows, else 2, 3, 4... */
  label: string;
  mine: boolean;
  lobbies: LobbyView[];
}

/**
 * Greedy lane packing by actual start/end: your lobbies first (a second YOU
 * row if two of yours overlap), then everything else.
 */
export function packLanes(
  lobbies: LobbyView[],
  me: string | null,
  now: number,
): Lane[] {
  const sorted = [...lobbies].sort(
    (a, b) =>
      lobbySpan(a, now)[0] - lobbySpan(b, now)[0] || a.id.localeCompare(b.id),
  );
  const pack = (items: LobbyView[]) => {
    const rows: { end: number; items: LobbyView[] }[] = [];
    for (const l of items) {
      const [s, e] = lobbySpan(l, now);
      const row = rows.find((r) => r.end <= s);
      if (row) {
        row.items.push(l);
        row.end = e;
      } else rows.push({ end: e, items: [l] });
    }
    return rows.map((r) => r.items);
  };
  const mine = pack(sorted.filter((l) => involvesMe(l, me)));
  const others = pack(sorted.filter((l) => !involvesMe(l, me)));
  return [
    ...mine.map((items) => ({ label: "YOU", mine: true, lobbies: items })),
    ...others.map((items, i) => ({
      label: String(mine.length + i + 1),
      mine: false,
      lobbies: items,
    })),
  ];
}

/** Does an open vote target this lobby (the derived "VOTE OPEN" flag)? */
export const hasOpenVote = (l: LobbyView, votes: Record<string, VoteView>) =>
  Object.values(votes).some(
    (v) =>
      v.status === "open" &&
      (v.targetLobbyId === l.id || v.options.some((o) => o.lobbyId === l.id)),
  );

export interface BlockLook {
  /** State label (mono 9/700). Empty for done lobbies (time only). */
  label: string;
  /** Label and accent colour. */
  color: string;
  border: string;
  glow?: string;
  /** Dashed for future lobbies. */
  dashed: boolean;
}

/** Deterministic accent per game, from the HyperLAN palette. */
export function gameColor(l: Pick<LobbyView, "gameId" | "kind">): string {
  if (l.kind === "food") return colors.violetLight;
  const palette = [colors.cyan, colors.lime, colors.pink, colors.violetText];
  return palette[Math.abs(l.gameId ?? 0) % palette.length];
}

/** How a block is drawn (the README's state table). */
export function blockLook(
  l: LobbyView,
  votes: Record<string, VoteView>,
  now: number,
): BlockLook {
  const pink = { color: colors.pinkText, border: colors.pink };
  const glowPink = `0 0 22px -4px ${tint("pink", 0.8)}`;
  if (hasOpenVote(l, votes) && l.status !== "live" && l.status !== "done")
    return {
      label: "VOTE OPEN",
      color: colors.cyan,
      border: colors.cyan,
      dashed: true,
    };
  switch (l.status) {
    case "done":
      return {
        label: "",
        color: colors.textMuted,
        border: tint("neutral", 0.35),
        dashed: false,
      };
    case "live": {
      const c = gameColor(l);
      return {
        label: "LIVE",
        color: c,
        border: c,
        glow: `0 0 18px -6px ${c}`,
        dashed: false,
      };
    }
    case "confirmed":
      return {
        label: "PRE-JOIN",
        color: colors.lime,
        border: colors.lime,
        dashed: true,
      };
    case "proposed":
      return {
        label: "PROPOSED",
        color: colors.violetText,
        border: colors.violetLight,
        dashed: true,
      };
    case "grace":
      // Started before its scheduled time: no rush until then.
      if (now < Date.parse(l.start))
        return {
          label: "STARTED EARLY",
          color: colors.lime,
          border: colors.lime,
          glow: `0 0 18px -6px ${colors.lime}`,
          dashed: false,
        };
      return { label: "GRACE", ...pink, glow: glowPink, dashed: true };
    case "waiting":
      return { label: "NOBODY IN", ...pink, glow: glowPink, dashed: true };
    case "delayed":
      return {
        label: "DELAYED",
        color: colors.cyan,
        border: colors.cyan,
        dashed: true,
      };
    case "empty": {
      const closes = l.emptySince ? ms(l.emptySince) + 5 * MIN : now;
      return {
        label: `EMPTY · CLOSES ${clock(closes)}`,
        color: colors.violetText,
        border: colors.violetLight,
        dashed: false,
      };
    }
    default:
      return {
        label: l.virtual ? "PLANNED" : "PLANNED",
        color: colors.textMuted,
        border: tint("neutral", 0.5),
        dashed: true,
      };
  }
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** `19:42` in local time. */
export function clock(t: number | string): string {
  const d = new Date(typeof t === "string" ? Date.parse(t) : t);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/** `FRI 18:00`. */
export function dayClock(t: number | string): string {
  const d = new Date(typeof t === "string" ? Date.parse(t) : t);
  return `${DAYS[d.getDay()]} ${clock(d.getTime())}`;
}

/** `45M`, `2H`, `1H 30`. */
export function lengthLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}M`;
  return m ? `${h}H ${pad2(m)}` : `${h}H`;
}

/** Steam header art for a game. */
export const steamHeader = (gameId: number | null) =>
  gameId
    ? `https://cdn.cloudflare.steamstatic.com/steam/apps/${gameId}/header.jpg`
    : null;

/** The lobby I'm in now, if any. */
export function myNow(state: LiveState): LobbyView | null {
  const me = state.me;
  if (!me) return null;
  return (
    visibleLobbies(state).find((l) =>
      l.members.some((m) => m.pid === me && m.leftAt == null),
    ) ?? null
  );
}

/** My next pre-joined lobby that hasn't started. */
export function myNext(state: LiveState, now: number): LobbyView | null {
  const me = state.me;
  if (!me) return null;
  return (
    visibleLobbies(state)
      .filter(
        (l) =>
          activePrejoins(l).some((p) => p.pid === me) &&
          !l.members.some((m) => m.pid === me && m.leftAt == null) &&
          l.status !== "done" &&
          plannedEnd(l) > now,
      )
      .sort((a, b) => ms(a.start) - ms(b.start))[0] ?? null
  );
}

/** The next `n` lobbies that haven't started yet. */
export function upNext(state: LiveState, now: number, n = 3): LobbyView[] {
  return visibleLobbies(state)
    .filter(
      (l) =>
        (l.status === "planned" ||
          l.status === "confirmed" ||
          l.status === "proposed" ||
          l.status === "delayed" ||
          l.status === "waiting") &&
        plannedEnd(l) > now,
    )
    .sort((a, b) => ms(a.start) - ms(b.start))
    .slice(0, n);
}

/** Lobbies running now. */
export function runningLobbies(state: LiveState): LobbyView[] {
  return visibleLobbies(state).filter(
    (l) => l.status === "live" || l.status === "grace" || l.status === "empty",
  );
}

/** The lobby to show in the details panel when nothing is selected. */
export function defaultSelection(state: LiveState, now: number): string | null {
  return (
    myNow(state)?.id ??
    myNext(state, now)?.id ??
    runningLobbies(state)[0]?.id ??
    upNext(state, now, 1)[0]?.id ??
    null
  );
}

/** People who are checked in. */
export const checkedIn = (state: LiveState): PersonView[] =>
  Object.values(state.people).filter((p) => p.checkedIn);

export interface FloorGroup {
  lobbyId: string;
  color: string;
  label: string;
  seatIds: number[];
}

/**
 * Seats grouped by the lobby their sitter is in now (DESIGN.md §7.2): the
 * floor merges neighbouring seats of one lobby into a labelled group.
 */
export function floorGroups(state: LiveState): FloorGroup[] {
  const groups: FloorGroup[] = [];
  for (const l of runningLobbies(state)) {
    const pids = new Set(currentMembers(l).map((m) => m.pid));
    const seatIds = state.floor.seats
      .filter((s) => s.pid && pids.has(s.pid))
      .map((s) => s.id);
    if (seatIds.length)
      groups.push({
        lobbyId: l.id,
        color: gameColor(l),
        label: `${shortName(l.name)} · ${pids.size}`,
        seatIds,
      });
  }
  return groups;
}

/** `CS2`-style short names for tight labels. */
export function shortName(name: string): string {
  const known: Record<string, string> = {
    "Counter-Strike 2": "CS2",
    "Left 4 Dead 2": "L4D2",
    "Deep Rock Galactic": "DRG",
    "Dead by Daylight": "DBD",
  };
  if (known[name]) return known[name];
  return name.length > 12
    ? name.split(/[\s:]/)[0].toUpperCase()
    : name.toUpperCase();
}

/** Timeline range: the event, padded to whole hours. */
export function timelineRange(state: LiveState): [number, number] | null {
  if (!state.event) return null;
  const start = Math.floor(ms(state.event.timeBegin) / HOUR) * HOUR;
  let end = Math.ceil(ms(state.event.timeEnd) / HOUR) * HOUR;
  for (const l of visibleLobbies(state)) end = Math.max(end, plannedEnd(l));
  return [start, end];
}

/** Is check-in open (doors open, event not over)? */
export function checkInOpen(state: LiveState, now: number): boolean {
  if (!state.event) return false;
  return now >= ms(state.event.timeBegin) && now <= ms(state.event.timeEnd);
}

/** The person record for a pid. */
export const personFor = (state: LiveState, pid: string | null | undefined) =>
  pid ? (state.people[pid] ?? null) : null;
