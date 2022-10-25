import moment from "moment";

export enum RSVP {
  yes = "yes",
  no = "no",
  maybe = "maybe",
}

export type InvitationData = {
  eventId: number;
  email: string;
  avatarUrl: string | null;
  handle: string | null;
  invitedAt: moment.Moment;
  respondedAt: moment.Moment | null;
  response: RSVP | null;
  attendance: number[] | null;
  lastModified: moment.Moment;
};

export type InvitationLiteData = {
  eventId: number;
  avatarUrl: string | null;
  handle: string | null;
  response: RSVP | null;
  attendance: number[] | null;
  lastModified: moment.Moment;
};

export const defaultInvitationsData: InvitationData[] = [];

export const defaultInvitationsLiteData: InvitationLiteData[] = [];

export const defaultInvitationData: InvitationData = {
  eventId: 0,
  email: "",
  avatarUrl: null,
  handle: null,
  invitedAt: moment(),
  respondedAt: null,
  response: null,
  attendance: null,
  lastModified: moment(),
};

export const defaultInvitationLiteData: InvitationLiteData = {
  eventId: 0,
  avatarUrl: null,
  handle: null,
  response: null,
  attendance: null,
  lastModified: moment(),
};
