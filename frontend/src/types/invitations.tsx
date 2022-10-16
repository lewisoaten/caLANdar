import moment from "moment";

export type InvitationData = {
  eventId: number;
  email: string;
  handle: string | null;
  invitedAt: moment.Moment;
  respondedAt: moment.Moment | null;
  response: boolean | null;
  attendance: number[] | null;
  lastModified: moment.Moment;
};

export const defaultInvitationsData: InvitationData[] = [];

export const defaultInvitationData: InvitationData = {
  eventId: 0,
  email: "",
  handle: null,
  invitedAt: moment(),
  respondedAt: null,
  response: null,
  attendance: null,
  lastModified: moment(),
};
