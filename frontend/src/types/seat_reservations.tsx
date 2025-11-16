import moment from "moment";

export type SeatReservation = {
  id: number;
  eventId: number;
  seatId: number | null;
  invitationEmail: string;
  attendanceBuckets: number[];
  createdAt: moment.Moment;
  lastModified: moment.Moment;
};

export const defaultSeatReservation: SeatReservation = {
  id: 0,
  eventId: 0,
  seatId: null,
  invitationEmail: "",
  attendanceBuckets: [],
  createdAt: moment(),
  lastModified: moment(),
};

export type SeatReservationSubmit = {
  seatId: number | null;
  attendanceBuckets: number[];
};

export type SeatAvailabilityRequest = {
  attendanceBuckets: number[];
};

export type SeatAvailabilityResponse = {
  availableSeatIds: number[];
};
