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
};

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
