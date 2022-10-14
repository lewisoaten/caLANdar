import moment from "moment";

export type EventData = {
  id: number;
  createdAt: moment.Moment;
  lastModified: moment.Moment;
  title: string;
  description: string;
  timeBegin: moment.Moment;
  timeEnd: moment.Moment;
};

export const defaultEventData: EventData = {
  id: 0,
  createdAt: moment(),
  lastModified: moment(),
  title: "",
  description: "",
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
  var m = moment();
  var roundUp =
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
