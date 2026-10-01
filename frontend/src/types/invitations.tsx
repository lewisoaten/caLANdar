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
  seatId: number | null;
  /** True on the viewer's own row (absent from older APIs). */
  isSelf?: boolean;
  /**
   * True when the guest holds a seat reservation, including a floating one
   * (`seatId: null`). Absent from older APIs.
   */
  hasSeatReservation?: boolean;
  lastModified: moment.Moment;
};

/** `GET /events/{id}/rsvp_counts`: guests per RSVP answer (counts only). */
export type RsvpCounts = {
  yes: number;
  maybe: number;
  no: number;
  /** Invited but not yet responded. */
  pending: number;
};

export const defaultInvitationsData: InvitationData[] = [];

export const defaultInvitationsLiteData: InvitationLiteData[] = [];

export const defaultInvitationData: InvitationData = {
  eventId: 0,
  email: "",
  avatarUrl: null,
  handle: "",
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
  seatId: null,
  lastModified: moment(),
};
