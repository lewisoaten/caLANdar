/**
 * The Live store: a small, framework-free state container that React reads
 * through `useSyncExternalStore` (docs/live-event/DESIGN.md §7.1).
 *
 * State only changes by whole-entity upserts keyed by id (from the snapshot,
 * stream rows or command responses), so replaying a row is harmless and
 * ordering bugs can't corrupt it.
 */
import type {
  AdminQueueItem,
  ConnectionStatus,
  FloorRoom,
  FloorSeat,
  LiveEventInfo,
  LiveLogEntry,
  LiveSnapshot,
  LobbyView,
  PersonView,
  VoteView,
} from "./types";

/** Most feed rows kept in memory. */
export const FEED_LIMIT = 300;

export interface LiveState {
  eventId: number;
  status: ConnectionStatus;
  /** The first snapshot has arrived. */
  loaded: boolean;
  error: string | null;
  /** Last applied log seq (the stream cursor). */
  seq: number;
  /** serverTime - clientTime, ms. Add to Date.now() for server time. */
  serverOffset: number;
  /** Client time (ms) of the last snapshot or stream row. */
  lastUpdate: number | null;
  /** Client time (ms) of the first snapshot: older results aren't toasted. */
  loadedAt: number | null;
  isAdmin: boolean;
  devTools: boolean;
  event: LiveEventInfo | null;
  /** The viewer's pid (absent on the wall-board). */
  me: string | null;
  people: Record<string, PersonView>;
  lobbies: Record<string, LobbyView>;
  votes: Record<string, VoteView>;
  /** Feed history and admin posts, oldest first. */
  feed: LiveLogEntry[];
  /** Rows only for the viewer (nudges and the like), oldest first. */
  personal: LiveLogEntry[];
  floor: { rooms: FloorRoom[]; seats: FloorSeat[] };
  adminQueue: AdminQueueItem[];
}

export const initialLiveState = (eventId: number): LiveState => ({
  eventId,
  status: "connecting",
  loaded: false,
  error: null,
  seq: 0,
  serverOffset: 0,
  lastUpdate: null,
  loadedAt: null,
  isAdmin: false,
  devTools: false,
  event: null,
  me: null,
  people: {},
  lobbies: {},
  votes: {},
  feed: [],
  personal: [],
  floor: { rooms: [], seats: [] },
  adminQueue: [],
});

const byKey = <T>(items: T[] | undefined, key: (t: T) => string) => {
  const out: Record<string, T> = {};
  for (const item of items ?? []) out[key(item)] = item;
  return out;
};

/** Is this row part of the feed (history and admin posts)? */
export const isFeedRow = (row: LiveLogEntry) =>
  row.tier != null || row.kind === "toast.admin";

/** Replace everything with a fresh snapshot. */
export function applySnapshot(
  state: LiveState,
  snapshot: LiveSnapshot,
  now: number,
): LiveState {
  return {
    ...state,
    loaded: true,
    error: null,
    seq: snapshot.seq,
    serverOffset: Date.parse(snapshot.serverTime) - now,
    lastUpdate: now,
    loadedAt: state.loadedAt ?? now,
    isAdmin: snapshot.isAdmin,
    devTools: Boolean(snapshot.devTools),
    event: snapshot.event ?? state.event,
    me: snapshot.me?.pid ?? null,
    people: byKey(snapshot.people, (p) => p.pid),
    lobbies: byKey(
      (snapshot.lobbies ?? []).filter((l) => l.status !== "removed"),
      (l) => l.id,
    ),
    votes: byKey(snapshot.votes, (v) => v.id),
    feed: snapshot.feed.filter(isFeedRow).slice(-FEED_LIMIT),
    personal: snapshot.feed.filter((r) => r.kind === "toast.personal"),
    floor: snapshot.floor ?? state.floor,
    adminQueue: snapshot.adminQueue ?? [],
  };
}

function upsertLobby(
  lobbies: Record<string, LobbyView>,
  lobby: LobbyView,
): Record<string, LobbyView> {
  const next = { ...lobbies };
  if (lobby.status === "removed") delete next[lobby.id];
  else next[lobby.id] = lobby;
  return next;
}

function without<T>(record: Record<string, T>, id: string) {
  if (!(id in record)) return record;
  const next = { ...record };
  delete next[id];
  return next;
}

/** Apply one stream row. Rows at or before the cursor are ignored. */
export function applyRow(
  state: LiveState,
  row: LiveLogEntry,
  now: number,
): LiveState {
  if (row.seq <= state.seq) return state;
  let next: LiveState = { ...state, seq: row.seq, lastUpdate: now };
  const p = row.payload;
  switch (row.kind) {
    case "lobby":
      next.lobbies = upsertLobby(next.lobbies, p as LobbyView);
      break;
    case "lobby.delete":
      next.lobbies = without(next.lobbies, String(p.id));
      break;
    case "plan": {
      // The planner's suggestions changed: replace every virtual lobby.
      const lobbies: Record<string, LobbyView> = {};
      for (const [id, l] of Object.entries(next.lobbies))
        if (!l.virtual) lobbies[id] = l;
      for (const l of (p.lobbies ?? []) as LobbyView[]) lobbies[l.id] = l;
      next.lobbies = lobbies;
      break;
    }
    case "vote":
      next.votes = { ...next.votes, [p.id]: p as VoteView };
      break;
    case "vote.delete":
      next.votes = without(next.votes, String(p.id));
      break;
    case "person":
      next.people = { ...next.people, [p.pid]: p as PersonView };
      break;
    case "event":
      // The streamed row is the public view: keep admin-only fields.
      next.event = { ...(next.event ?? {}), ...(p as LiveEventInfo) };
      for (const k of [
        "wallboardToken",
        "discordWebhookUrl",
        "venueLocation",
      ] as const)
        if (p[k] == null && next.event && state.event?.[k] != null)
          next.event = { ...next.event, [k]: state.event[k] };
      break;
    case "admin.queue":
      next.adminQueue = (p.items ?? []) as AdminQueueItem[];
      break;
    case "feed.delete":
      next.feed = next.feed.filter((r) => r.payload?.key !== p.key);
      break;
    case "toast.personal":
      next.personal = [...next.personal, row].slice(-50);
      break;
    default:
      break;
  }
  if (isFeedRow(row)) {
    next = { ...next, feed: [...next.feed, row].slice(-FEED_LIMIT) };
  }
  return next;
}

/** Entities returned by a command, applied before their stream echo. */
export interface EntityBatch {
  lobbies?: LobbyView[];
  deletedLobbies?: string[];
  votes?: VoteView[];
  people?: PersonView[];
}

export function applyEntities(state: LiveState, batch: EntityBatch): LiveState {
  let lobbies = state.lobbies;
  for (const l of batch.lobbies ?? []) {
    lobbies = upsertLobby(lobbies, l);
    // A suggestion just stored: drop its virtual twin.
    if (!l.virtual)
      for (const [id, v] of Object.entries(lobbies))
        if (v.virtual && v.gameId === l.gameId && v.start === l.start)
          lobbies = without(lobbies, id);
  }
  for (const id of batch.deletedLobbies ?? []) lobbies = without(lobbies, id);
  let votes = state.votes;
  for (const v of batch.votes ?? []) votes = { ...votes, [v.id]: v };
  let people = state.people;
  for (const p of batch.people ?? []) people = { ...people, [p.pid]: p };
  return { ...state, lobbies, votes, people };
}

type Listener = () => void;

/** Observable holder of a LiveState, for useSyncExternalStore. */
export class LiveStore {
  private state: LiveState;
  private listeners = new Set<Listener>();

  constructor(eventId: number) {
    this.state = initialLiveState(eventId);
  }

  getState = (): LiveState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  update(fn: (state: LiveState) => LiveState) {
    const next = fn(this.state);
    if (next === this.state) return;
    this.state = next;
    for (const l of this.listeners) l();
  }

  /** Server time now, in ms. */
  serverNow = () => Date.now() + this.state.serverOffset;
}
