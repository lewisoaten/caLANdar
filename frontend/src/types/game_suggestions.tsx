import moment from "moment";

export enum GameVote {
  yes = "yes",
  noVote = "noVote",
  no = "no", // Not used for now
}

export type Gamer = {
  avatarUrl: string | null;
  handle: string | null;
};

export const defaultGamer: Gamer = {
  avatarUrl: null,
  handle: null,
};

export type GameSuggestion = {
  appid: number;
  name: string;
  comment: string | null;
  lastModified: moment.Moment;
  requestedAt: moment.Moment;
  suggestionLastModified: moment.Moment;
  selfVote: GameVote;
  votes: number;
  gamerOwned: Gamer[];
  gamerUnowned: Gamer[];
  gamerUnknown: Gamer[];
};

export const defaultGameSuggestions: GameSuggestion[] = [];

export const defaultGameSuggestion: GameSuggestion = {
  appid: 0,
  name: "",
  comment: null,
  lastModified: moment(),
  requestedAt: moment(),
  suggestionLastModified: moment(),
  selfVote: GameVote.noVote,
  votes: 0,
  gamerOwned: [],
  gamerUnowned: [],
  gamerUnknown: [],
};

export type Game = {
  appid: number;
  name: string;
  last_modified: moment.Moment;
  rank: number | undefined;
};

export const defaultGames: Game[] = [];

export const defaultGame: Game = {
  appid: 0,
  name: "",
  last_modified: moment(),
  rank: 0.0,
};

export type EventGame = {
  appid: number;
  name: string;
  gamerOwned: Gamer[];
  playtimeForever: number;
  lastModified: moment.Moment;
};

export const defaultEventGame: EventGame = {
  appid: 0,
  name: "",
  gamerOwned: [],
  playtimeForever: 0,
  lastModified: moment(),
};

export type EventGamesMap = Map<number, EventGame[]>;

export const defaultEventGamesMap: EventGamesMap = new Map<
  number,
  EventGame[]
>();

export type EventGames = {
  eventGames: EventGamesMap;
  totalCount: number;
};

export const defaultEventGames: EventGames = {
  eventGames: defaultEventGamesMap,
  totalCount: 0,
};
