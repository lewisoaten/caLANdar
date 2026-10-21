import moment from "moment";

export type GameScheduleEntry = {
  id: number;
  eventId: number;
  gameId: number;
  gameName: string;
  startTime: moment.Moment;
  durationMinutes: number;
  isPinned: boolean;
  isSuggested: boolean;
  createdAt: moment.Moment;
  lastModified: moment.Moment;
  /** `game` or `food` (food comes from Live proposals). */
  kind?: "game" | "food";
  /** Live status (`planned`, `confirmed`, `live`, `done`...). */
  status?: string;
  /** Where it came from: `plan`, `suggestion`, `proposal`, `steam`... */
  source?: string;
  plannedStart?: moment.Moment | null;
  plannedMinutes?: number | null;
  actualStart?: moment.Moment | null;
  actualEnd?: moment.Moment | null;
  maxPlayers?: number | null;
};

/** Played (or playing) entries: history, edited with care. */
export const isPlayed = (e: Pick<GameScheduleEntry, "status">) =>
  e.status === "done";

/** Running on Live right now. */
export const isRunning = (e: Pick<GameScheduleEntry, "status">) =>
  e.status === "live" || e.status === "grace" || e.status === "empty";

/**
 * Created by Live (Steam, proposals, splits, votes) rather than planned:
 * these may overlap anything, because reality has parallel lobbies.
 */
export const isFromLive = (e: Pick<GameScheduleEntry, "source">) =>
  e.source != null && e.source !== "plan" && e.source !== "suggestion";

export const defaultGameScheduleEntry: GameScheduleEntry = {
  id: 0,
  eventId: 0,
  gameId: 0,
  gameName: "",
  startTime: moment(),
  durationMinutes: 120,
  isPinned: false,
  isSuggested: false,
  createdAt: moment(),
  lastModified: moment(),
};

export type GameScheduleRequest = {
  gameId: number;
  startTime: moment.Moment;
  durationMinutes: number;
};

export const defaultGameScheduleRequest: GameScheduleRequest = {
  gameId: 0,
  startTime: moment(),
  durationMinutes: 120,
};
