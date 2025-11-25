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
  steamId: string | null;
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
};

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
