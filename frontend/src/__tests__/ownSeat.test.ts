import { describe, expect, test } from "vitest";
import moment from "moment";
import { reservationFromSquad } from "../components/RSVPWizard/ownSeat";
import { displayCallsign, NO_CALLSIGN } from "../utils/callsign";
import { InvitationLiteData, RSVP } from "../types/invitations";

const row = (extra: Partial<InvitationLiteData>): InvitationLiteData => ({
  eventId: 1,
  avatarUrl: null,
  handle: "Nia",
  response: RSVP.yes,
  attendance: null,
  seatId: null,
  lastModified: moment(),
  ...extra,
});

describe("reservationFromSquad", () => {
  test("finds the viewer's desk", () => {
    expect(
      reservationFromSquad([
        row({ isSelf: false, seatId: 4, hasSeatReservation: true }),
        row({ isSelf: true, seatId: 7, hasSeatReservation: true }),
      ]),
    ).toEqual({ exists: true, seatId: 7 });
  });

  test("distinguishes a floating reservation from none", () => {
    expect(
      reservationFromSquad([row({ isSelf: true, hasSeatReservation: true })]),
    ).toEqual({ exists: true, seatId: null });
    expect(
      reservationFromSquad([row({ isSelf: true, hasSeatReservation: false })]),
    ).toEqual({ exists: false, seatId: null });
  });

  test("a viewer missing from the squad holds no seat", () => {
    expect(reservationFromSquad([])).toEqual({ exists: false, seatId: null });
    expect(reservationFromSquad([row({ isSelf: false, seatId: 2 })])).toEqual({
      exists: false,
      seatId: null,
    });
  });

  test("defers to the direct lookup on APIs without the markers", () => {
    expect(reservationFromSquad([row({ seatId: 2 })])).toBeUndefined();
  });
});

describe("displayCallsign", () => {
  test("keeps a callsign and falls back for missing or blank ones", () => {
    expect(displayCallsign("  Nia ")).toBe("Nia");
    expect(displayCallsign(null)).toBe(NO_CALLSIGN);
    expect(displayCallsign(undefined)).toBe(NO_CALLSIGN);
    expect(displayCallsign("   ")).toBe("No callsign yet");
  });
});
