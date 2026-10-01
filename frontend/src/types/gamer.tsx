import moment from "moment";
import { EventData } from "./events";

export type GamerData = {
  email: string;
  avatarUrl: string | null;
  handles: string[];
  steamId: string | null;
  eventsInvited: EventData[];
  eventsAccepted: EventData[];
  eventsTentative: EventData[];
  eventsDeclined: EventData[];
  eventsLastResponse: moment.Moment | null;
  gamesOwnedCount: number;
  gamesOwnedLastModified: moment.Moment | null;
};

export type GamerSummaryData = {
  email: string;
  avatarUrl: string | null;
  handles: string[];
  /** Handle used at the gamer's most recent event (null if none). */
  callsign?: string | null;
  steamId: string | null;
  /** A (non-zero) Steam ID is saved on the gamer's profile. */
  steamLinked?: boolean;
  eventsInvitedCount: number;
  eventsAcceptedCount: number;
  eventsTentativeCount: number;
  eventsDeclinedCount: number;
  eventsLastResponse: moment.Moment | null;
  gamesOwnedCount: number;
  gamesOwnedLastModified: moment.Moment | null;
};

export type PaginatedGamersResponse = {
  gamers: GamerSummaryData[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  /** Gamers per filter chip, after `search` and before `filter`. */
  counts?: GamerCounts;
};

export type GamerCounts = {
  all: number;
  steam: number;
  noSteam: number;
  staleLibrary: number;
};

export type GamerFilter = "all" | "steam" | "no_steam" | "stale_library";
export type GamerSort = "last_rsvp" | "games_updated" | "callsign" | "email";

export const defaultGamerData: GamerData = {
  email: "",
  avatarUrl: "",
  handles: [],
  steamId: null,
  eventsInvited: [],
  eventsAccepted: [],
  eventsTentative: [],
  eventsDeclined: [],
  eventsLastResponse: null,
  gamesOwnedCount: 0,
  gamesOwnedLastModified: null,
};

export const defaultGamerSummaryData: GamerSummaryData = {
  email: "",
  avatarUrl: "",
  handles: [],
  steamId: null,
  eventsInvitedCount: 0,
  eventsAcceptedCount: 0,
  eventsTentativeCount: 0,
  eventsDeclinedCount: 0,
  eventsLastResponse: null,
  gamesOwnedCount: 0,
  gamesOwnedLastModified: null,
};
