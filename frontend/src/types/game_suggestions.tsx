import moment from "moment";

export enum GameVote {
  yes = "yes",
  noVote = "noVote",
  no = "no", // Not used for now
}

export type GameSuggestion = {
  appid: number;
  name: string;
  last_modified: moment.Moment;
  requested_at: moment.Moment;
  suggestion_last_modified: moment.Moment;
  self_vote: GameVote;
  votes: number;
};

export const defaultGameSuggestions: GameSuggestion[] = [];

export const defaultGameSuggestion: GameSuggestion = {
  appid: 0,
  name: "",
  last_modified: moment(),
  requested_at: moment(),
  suggestion_last_modified: moment(),
  self_vote: GameVote.noVote,
  votes: 0,
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
