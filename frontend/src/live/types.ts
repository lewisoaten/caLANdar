/**
 * Wire types of the Live API (`/api/events/:id/live`, see
 * docs/live-event/DESIGN.md §4.3 and §6). Times are ISO strings; people are
 * keyed by an opaque `pid`, never by email.
 */

/** One `live_log` row as streamed (`id: seq`, `event: kind`). */
export interface LiveLogEntry {
  seq: number;
  at: string;
  kind: string;
  /** Feed tier 1-4 (result, lobby event, action, presence), or null. */
  tier: number | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any;
}

export type ConnectionStatus =
  | "connecting"
  /** Stream open. */
  | "live"
  /** Stream dropped; the browser is retrying. */
  | "reconnecting"
  /** No network, or the server can't be reached. */
  | "offline"
  /** Outside the live window: the snapshot is polled instead. */
  | "polling"
  /** Hidden tab or idle: the stream is closed to save cost. */
  | "paused";

export interface LiveEventInfo {
  id: number;
  title: string;
  timeBegin: string;
  timeEnd: string;
  discordInviteUrl: string | null;
  timezone: string;
  /** Admins only. */
  wallboardToken?: string | null;
  /** Admins only. */
  discordWebhookUrl?: string | null;
  /** e.g. `03:00-09:00`. */
  wallboardSleep?: string | null;
  venueName?: string | null;
  /** Admins only: `lat,lng`. */
  venueLocation?: string | null;
  placesEnabled?: boolean;
}

export interface PresenceView {
  gameId: number | null;
  gameName: string | null;
  via: "steam" | "manual" | null;
  afk: boolean;
  /** A manual join waiting for Steam to show the new game. */
  switchLobbyId: string | null;
  switchGraceUntil: string | null;
}

export interface PersonView {
  pid: string;
  handle: string;
  avatarUrl: string;
  seat: { seatId: number; label: string; roomId: number } | null;
  rsvp: "yes" | "maybe" | "no" | null;
  /** 6-hour attendance buckets (see utils/attendanceBuckets.ts). */
  attendance: number[];
  checkedIn: boolean;
  checkedInAt: string | null;
  hasSteam: boolean;
  /** Only shared once the person has checked in. */
  presence: PresenceView | null;
}

export type LobbyStatus =
  | "planned"
  | "proposed"
  | "confirmed"
  | "waiting"
  | "delayed"
  | "grace"
  | "live"
  | "empty"
  | "done"
  | "removed";

export type LobbySource =
  "plan" | "suggestion" | "proposal" | "steam" | "split" | "vote";

export interface Team {
  name: string;
  size: number;
}

export interface FoodInfo {
  name: string;
  placeId?: string | null;
  photoUrl?: string | null;
  rating?: number | null;
  address?: string | null;
  freeText?: string | null;
}

export interface MemberView {
  pid: string;
  team: string | null;
  via: "steam" | "manual" | "admin";
  joinedAt: string;
  leftAt: string | null;
  leftReason: string | null;
}

export interface PrejoinView {
  pid: string;
  team: string | null;
  random: boolean;
  createdAt: string;
  droppedAt: string | null;
  dropReason: string | null;
}

export interface TypicalLength {
  minutes: number;
  sessions: number;
}

export interface LobbyView {
  /** Stored lobbies: the schedule entry id. Plan suggestions: `s<gameId>@<startMs>`. */
  id: string;
  kind: "game" | "food";
  gameId: number | null;
  name: string;
  food: FoodInfo | null;
  status: LobbyStatus;
  source: LobbySource;
  /** Current best start/length: actual once played, else planned or moved. */
  start: string;
  minutes: number;
  plannedStart: string | null;
  plannedMinutes: number | null;
  actualStart: string | null;
  /** Null while running. */
  actualEnd: string | null;
  maxPlayers: number | null;
  teams: Team[] | null;
  proposedBy: string | null;
  createdByVote: string | null;
  graceUntil: string | null;
  graceLocked: boolean;
  emptySince: string | null;
  members: MemberView[];
  prejoins: PrejoinView[];
  /** First time this game has been seen: ask for players and teams. */
  needsSetup: boolean;
  typical: TypicalLength | null;
  /** True for plan suggestions that aren't stored yet. */
  virtual: boolean;
}

export type VoteType =
  "slot" | "extend" | "delay" | "change" | "kickoff" | "proposal";
export type VoteStatus = "open" | "final" | "vetoed" | "lapsed";

export interface VoteOptionView {
  id: string;
  kind: "lobby" | "game" | "food" | "keep_playing" | "yes" | "no";
  lobbyId: string | null;
  gameId: number | null;
  name: string;
  food: FoodInfo | null;
  startDeltaMin: number | null;
  durationMin: number | null;
  newStart: string | null;
  createdBy: string | null;
  voters: string[];
}

export interface VoteView {
  id: string;
  type: VoteType;
  title: string;
  targetLobbyId: string | null;
  slotStart: string | null;
  status: VoteStatus;
  resolution: string | null;
  openedBy: string;
  openedAt: string;
  deadline: string;
  /** Unanimous: finalises at this time unless someone changes their vote. */
  settleAt: string | null;
  resolvedAt: string | null;
  winnerOptionId: string | null;
  options: VoteOptionView[];
  splitOk: string[];
  involved: string[];
  waitingOn: string[];
  /** Human description of who votes, e.g. `EVERYONE CHECKED IN · 7/9`. */
  involvedLabel: string;
}

export interface FloorRoom {
  id: number;
  name: string;
  sortOrder: number;
  gridRows: number | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  features: any[];
  /** Legacy floorplan image, used when there's no uploaded background. */
  image?: string | null;
  backgroundUrl?: string | null;
  backgroundStyle?: string | null;
  backgroundOpacity?: number | null;
}

export interface FloorSeat {
  id: number;
  roomId: number;
  label: string;
  name: string | null;
  x: number;
  y: number;
  gridCol: number | null;
  gridRow: number | null;
  pid: string | null;
}

export interface AdminQueueItem {
  pid: string;
  /** e.g. `playing-not-checked-in` */
  kind: string;
  gameName: string | null;
}

export interface LiveSnapshot {
  seq: number;
  serverTime: string;
  isAdmin: boolean;
  /** Dev-only simulators are enabled on this server. */
  devTools?: boolean;
  event?: LiveEventInfo;
  me?: { pid: string } | null;
  people?: PersonView[];
  lobbies?: LobbyView[];
  votes?: VoteView[];
  feed: LiveLogEntry[];
  floor?: { rooms: FloorRoom[]; seats: FloorSeat[] };
  adminQueue?: AdminQueueItem[];
}
