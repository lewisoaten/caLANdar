/**
 * Looks up a guest's own seat reservation for the RSVP wizard and the lobby's
 * "Your RSVP" panel.
 *
 * Players read it from the squad list (`GET /events/{id}/invitations`), whose
 * rows mark the viewer (`isSelf`) and say whether they hold a reservation
 * (`hasSeatReservation`, floating ones included). Unlike
 * `GET /seat-reservations/me`, that never answers 404 for "no reservation",
 * which browsers log as a console error. Admins editing someone else's RSVP
 * read the admin reservation list instead.
 */
import { InvitationLiteData } from "../../types/invitations";

export interface ReservationLookup {
  /** Whether the guest holds any reservation (a desk or a floating one). */
  exists: boolean;
  /** The reserved desk, or null for none / a floating reservation. */
  seatId: number | null;
}

export const NO_RESERVATION: ReservationLookup = {
  exists: false,
  seatId: null,
};

/** Thrown when the API rejects the session (the caller signs out). */
export class SessionExpiredError extends Error {
  constructor() {
    super("Session expired");
    this.name = "SessionExpiredError";
  }
}

/**
 * The viewer's reservation from squad-list rows, or `undefined` when the rows
 * come from an API without the `isSelf`/`hasSeatReservation` markers.
 * Guests who declined or haven't replied aren't listed, and hold no seat.
 */
export const reservationFromSquad = (
  rows: readonly InvitationLiteData[],
): ReservationLookup | undefined => {
  if (rows.length > 0 && rows.every((r) => r.isSelf === undefined))
    return undefined;
  const own = rows.find((r) => r.isSelf);
  if (!own) return NO_RESERVATION;
  const exists = own.hasSeatReservation ?? own.seatId !== null;
  return { exists, seatId: exists ? own.seatId : null };
};

const ok = (response: Response) => {
  if (response.status === 401) throw new SessionExpiredError();
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response;
};

/**
 * Fetches the reservation of the signed-in guest, or of `adminEmail` when an
 * admin edits another guest's RSVP.
 */
export async function fetchReservation(
  eventId: number,
  headers: HeadersInit,
  adminEmail?: string,
  signal?: AbortSignal,
): Promise<ReservationLookup> {
  if (adminEmail) {
    const res = ok(
      await fetch(`/api/events/${eventId}/seat-reservations?as_admin=true`, {
        headers,
        signal,
      }),
    );
    const all: Array<{ invitationEmail: string; seatId: number | null }> =
      await res.json();
    const own = all.find(
      (r) => r.invitationEmail.toLowerCase() === adminEmail.toLowerCase(),
    );
    return own ? { exists: true, seatId: own.seatId } : NO_RESERVATION;
  }

  const res = ok(
    await fetch(`/api/events/${eventId}/invitations`, { headers, signal }),
  );
  const rows: InvitationLiteData[] = await res.json();
  const fromSquad = reservationFromSquad(rows);
  if (fromSquad) return fromSquad;

  // Older API without the markers: fall back to the direct lookup.
  const me = await fetch(
    `/api/events/${eventId}/seat-reservations/me?optional=true`,
    { headers, signal },
  );
  if (me.status === 204 || me.status === 404) return NO_RESERVATION;
  const data = await ok(me).json();
  return { exists: true, seatId: data?.seatId ?? null };
}

/** A desk's label and room name, for showing a reservation. */
export async function fetchSeatLabel(
  eventId: number,
  seatId: number,
  headers: HeadersInit,
  signal?: AbortSignal,
): Promise<{ label: string | null; roomName: string | null }> {
  const seatRes = ok(
    await fetch(`/api/events/${eventId}/seats/${seatId}`, { headers, signal }),
  );
  const seat = await seatRes.json();
  let roomName: string | null = null;
  if (seat?.roomId) {
    const roomRes = await fetch(`/api/events/${eventId}/rooms/${seat.roomId}`, {
      headers,
      signal,
    });
    if (roomRes.ok) roomName = (await roomRes.json())?.name ?? null;
  }
  return { label: seat?.label ?? null, roomName };
}
