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
