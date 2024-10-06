import moment from "moment";
import { EventData } from "./events";

export type GamerData = {
  email: string;
  avatarUrl: string | null;
  handles: string[];
  eventsInvited: EventData[];
  eventsAccepted: EventData[];
  eventsTentative: EventData[];
  eventsDeclined: EventData[];
  eventsLastResponse: moment.Moment | null;
  gamesOwnedCount: number;
  gamesOwnedLastModified: moment.Moment | null;
};

export const defaultGamerData: GamerData = {
  email: "",
  avatarUrl: "",
  handles: [],
  eventsInvited: [],
  eventsAccepted: [],
  eventsTentative: [],
  eventsDeclined: [],
  eventsLastResponse: null,
  gamesOwnedCount: 0,
  gamesOwnedLastModified: null,
};
