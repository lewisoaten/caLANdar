import moment from "moment";

export type GameSuggestion = {
  appid: number;
  name: string;
  last_modified: moment.Moment;
  requested_at: moment.Moment;
  suggestion_last_modified: moment.Moment;
};

export const defaultGameSuggestions: GameSuggestion[] = [];

export const defaultGameSuggestion: GameSuggestion = {
  appid: 0,
  name: "",
  last_modified: moment(),
  requested_at: moment(),
  suggestion_last_modified: moment(),
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
