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

// Helper function to convert GameScheduleEntry to react-big-calendar event format
export interface CalendarEvent {
  id: number;
  title: string;
  start: Date;
  end: Date;
  resource: GameScheduleEntry;
}

export function toCalendarEvent(entry: GameScheduleEntry): CalendarEvent {
  const start = entry.startTime.toDate();
  const end = entry.startTime
    .clone()
    .add(entry.durationMinutes, "minutes")
    .toDate();

  return {
    id: entry.id,
    title: entry.gameName,
    start,
    end,
    resource: entry,
  };
}

export function toCalendarEvents(
  entries: GameScheduleEntry[],
): CalendarEvent[] {
  return entries.map(toCalendarEvent);
}
