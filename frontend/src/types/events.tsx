import moment from "moment";

export type EventData = {
  id: number;
  createdAt: moment.Moment;
  lastModified: moment.Moment;
  title: string;
  description: string;
  image: string | undefined;
  timeBegin: moment.Moment;
  timeEnd: moment.Moment;
};

export const defaultEventData: EventData = {
  id: 0,
  createdAt: moment(),
  lastModified: moment(),
  title: "",
  description: "",
  image: undefined,
  timeBegin: moment(),
  timeEnd: moment(),
};

export type CreateEvent = {
  title: string;
  description: string;
  timeBegin: moment.Moment;
  timeEnd: moment.Moment;
};

const roundUpHour = () => {
  const m = moment();
  const roundUp =
    m.minute() || m.second() || m.millisecond()
      ? m.add(1, "hour").startOf("hour")
      : m.startOf("hour");
  return roundUp;
};

export const defaultCreateEvent: CreateEvent = {
  title: "",
  description: "",
  timeBegin: roundUpHour(),
  timeEnd: roundUpHour(),
};

export type PaginatedEventsResponse = {
  events: EventData[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type EventSeatingConfig = {
  eventId: number;
  hasSeating: boolean;
  allowUnspecifiedSeat: boolean;
  unspecifiedSeatLabel: string;
  createdAt: moment.Moment;
  lastModified: moment.Moment;
};

export const defaultEventSeatingConfig: EventSeatingConfig = {
  eventId: 0,
  hasSeating: false,
  allowUnspecifiedSeat: false,
  unspecifiedSeatLabel: "Unspecified Seat",
  createdAt: moment(),
  lastModified: moment(),
};

export type EventSeatingConfigSubmit = {
  hasSeating: boolean;
  allowUnspecifiedSeat: boolean;
  unspecifiedSeatLabel: string;
};

export type Room = {
  id: number;
  eventId: number;
  name: string;
  description: string | null;
  image: string | null;
  sortOrder: number;
  createdAt: moment.Moment;
  lastModified: moment.Moment;
};

export const defaultRoom: Room = {
  id: 0,
  eventId: 0,
  name: "",
  description: null,
  image: null,
  sortOrder: 0,
  createdAt: moment(),
  lastModified: moment(),
};

export type RoomSubmit = {
  name: string;
  description: string | null;
  image: string | null;
  sortOrder: number;
};

export type Seat = {
  id: number;
  eventId: number;
  roomId: number;
  label: string;
  description: string | null;
  x: number;
  y: number;
  createdAt: moment.Moment;
  lastModified: moment.Moment;
};

export const defaultSeat: Seat = {
  id: 0,
  eventId: 0,
  roomId: 0,
  label: "",
  description: null,
  x: 0.5,
  y: 0.5,
  createdAt: moment(),
  lastModified: moment(),
};

export type SeatSubmit = {
  roomId: number;
  label: string;
  description: string | null;
  x: number;
  y: number;
};
