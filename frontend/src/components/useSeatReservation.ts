/**
 * The signed-in user's seat reservation for an event: load it, check which
 * seats are free for their attendance, and claim / swap / release a seat.
 *
 * Shared by the seat map page and the standalone SeatSelector so both keep
 * the same API calls, validation and error messages.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useSnackbar } from "notistack";
import { dateParser } from "../utils";
import { apiErrorFrom, userFacingReason } from "../utils/apiError";
import type { EventSeatingConfig, Seat } from "../types/events";
import type {
  SeatAvailabilityResponse,
  SeatReservation,
  SeatReservationSubmit,
} from "../types/seat_reservations";

export interface UseSeatReservationOptions {
  eventId: number | undefined;
  token: string | null | undefined;
  signOut: () => void;
  seatingConfig: EventSeatingConfig | null;
  /** All seats of the event (used to spot a reserved seat that was removed). */
  seats: Seat[];
  /** Whether `seats` has been fetched (the removed-seat check waits for it). */
  seatsLoaded?: boolean;
  attendanceBuckets: number[] | null;
  /** Called after a successful claim / swap / release. */
  onChange?: () => void;
}

export interface UseSeatReservation {
  reservation: SeatReservation | null;
  /** The reservation request has finished (found, 404 or failed). */
  loaded: boolean;
  /** Seats free for the user's attendance (`null` until checked). */
  availableSeatIds: number[] | null;
  /** A claim / release request is in flight. */
  saving: boolean;
  /** Reserve `seatId` (or the unspecified seat, `null`). Resolves true on success. */
  reserve: (seatId: number | null) => Promise<boolean>;
  /** Delete the reservation. Resolves true on success. */
  release: () => Promise<boolean>;
  /** Whether the event lets the user drop a specific seat. */
  canRelease: boolean;
}

const headers = (token: string | null | undefined) => ({
  "Content-Type": "application/json",
  Accept: "application/json",
  Authorization: "Bearer " + token,
});

const CONFLICT_MESSAGE =
  "This seat is already reserved for the selected times. Please choose another seat.";
const MANDATORY_MESSAGE =
  "Seat selection is mandatory for this event. Please select a different seat instead of removing your reservation.";

export function useSeatReservation({
  eventId,
  token,
  signOut,
  seatingConfig,
  seats,
  seatsLoaded = true,
  attendanceBuckets,
  onChange,
}: UseSeatReservationOptions): UseSeatReservation {
  const { enqueueSnackbar } = useSnackbar();
  const hasSeating = Boolean(seatingConfig?.hasSeating);

  const [reservation, setReservation] = useState<SeatReservation | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [availableSeatIds, setAvailableSeatIds] = useState<number[] | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [availabilityTick, setAvailabilityTick] = useState(0);

  // Current reservation
  useEffect(() => {
    if (!eventId || !token || !hasSeating) return;
    let cancelled = false;
    fetch(`/api/events/${eventId}/seat-reservations/me`, {
      headers: headers(token),
    })
      .then((response) => {
        if (response.status === 401) {
          signOut();
          return null;
        }
        if (response.status === 404) return null;
        if (!response.ok) throw new Error("Failed to fetch reservation");
        return response
          .text()
          .then((data) => JSON.parse(data, dateParser) as SeatReservation);
      })
      .then((data) => {
        if (cancelled) return;
        setReservation(data);
        setLoaded(true);
      })
      .catch((error) => {
        console.error("Error fetching seat reservation:", error);
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [eventId, token, signOut, hasSeating, attendanceBuckets]);

  // A reservation that no longer fits the event's rules is treated as none
  // (the user must pick again); warn once per reservation.
  const invalidReason: string | null = (() => {
    if (!reservation || !seatingConfig || !loaded || !seatsLoaded) return null;
    if (reservation.seatId === null && !seatingConfig.allowUnspecifiedSeat) {
      return "Your unspecified seat reservation is no longer valid. The event now requires a specific seat. Please select a seat.";
    }
    if (
      reservation.seatId !== null &&
      seats.length > 0 &&
      !seats.some((s) => s.id === reservation.seatId)
    ) {
      return "Your reserved seat has been removed by the admin. Please select a new seat.";
    }
    return null;
  })();
  const warned = useRef<string | null>(null);
  useEffect(() => {
    if (!invalidReason || !reservation) return;
    const key = `${reservation.id}:${invalidReason}`;
    if (warned.current === key) return;
    warned.current = key;
    enqueueSnackbar(invalidReason, { variant: "warning", persist: true });
  }, [invalidReason, reservation, enqueueSnackbar]);

  // Seats free for the user's attendance
  useEffect(() => {
    if (
      !eventId ||
      !token ||
      !hasSeating ||
      !attendanceBuckets ||
      attendanceBuckets.length === 0
    ) {
      return;
    }
    let cancelled = false;
    fetch(`/api/events/${eventId}/seat-reservations/check-availability`, {
      method: "POST",
      headers: headers(token),
      body: JSON.stringify({ attendanceBuckets }),
    })
      .then((response) => {
        if (response.status === 401) {
          signOut();
          return null;
        }
        if (!response.ok) throw new Error("Failed to check availability");
        return response.json() as Promise<SeatAvailabilityResponse>;
      })
      .then((data) => {
        if (!cancelled && data) setAvailableSeatIds(data.availableSeatIds);
      })
      .catch((error) => {
        console.error("Error checking seat availability:", error);
      });
    return () => {
      cancelled = true;
    };
  }, [
    eventId,
    token,
    signOut,
    hasSeating,
    attendanceBuckets,
    availabilityTick,
  ]);

  const reserve = useCallback(
    async (seatId: number | null) => {
      if (!attendanceBuckets || attendanceBuckets.length === 0) {
        enqueueSnackbar("Please select your attendance times first", {
          variant: "warning",
        });
        return false;
      }
      setSaving(true);
      const body: SeatReservationSubmit = { seatId, attendanceBuckets };
      try {
        const response = await fetch(
          `/api/events/${eventId}/seat-reservations/me`,
          {
            method: reservation ? "PUT" : "POST",
            headers: headers(token),
            body: JSON.stringify(body),
          },
        );
        if (response.status === 401) {
          signOut();
          return false;
        }
        if (!response.ok) {
          const reason = userFacingReason(
            await apiErrorFrom("Unable to save seat reservation", response),
          );
          if (response.status === 409) {
            enqueueSnackbar(reason || CONFLICT_MESSAGE, { variant: "error" });
          } else if (response.status === 400) {
            enqueueSnackbar(reason || "Invalid seat reservation request", {
              variant: "error",
            });
          } else {
            enqueueSnackbar(
              reason
                ? `Failed to save seat reservation: ${reason}`
                : "Failed to save seat reservation",
              { variant: "error" },
            );
          }
          // Someone may have beaten us to it: refresh what is free.
          setAvailabilityTick((t) => t + 1);
          return false;
        }
        const previousSeatId = reservation?.seatId ?? null;
        const data = JSON.parse(
          await response.text(),
          dateParser,
        ) as SeatReservation;
        setReservation(data);
        setAvailableSeatIds((prev) => {
          const next = new Set(prev ?? []);
          if (previousSeatId !== null) next.add(previousSeatId);
          if (data.seatId !== null) next.delete(data.seatId);
          return Array.from(next);
        });
        setAvailabilityTick((t) => t + 1);
        enqueueSnackbar("Seat reservation saved successfully", {
          variant: "success",
        });
        onChange?.();
        return true;
      } catch (error) {
        console.error("Error saving seat reservation:", error);
        enqueueSnackbar("Error saving seat reservation", { variant: "error" });
        return false;
      } finally {
        setSaving(false);
      }
    },
    [
      attendanceBuckets,
      enqueueSnackbar,
      eventId,
      reservation,
      token,
      signOut,
      onChange,
    ],
  );

  const canRelease = !(
    seatingConfig &&
    !seatingConfig.allowUnspecifiedSeat &&
    reservation?.seatId != null
  );

  const release = useCallback(async () => {
    if (!reservation) return false;
    if (!canRelease) {
      enqueueSnackbar(MANDATORY_MESSAGE, { variant: "warning" });
      return false;
    }
    setSaving(true);
    try {
      const response = await fetch(
        `/api/events/${eventId}/seat-reservations/me`,
        { method: "DELETE", headers: headers(token) },
      );
      if (response.status === 401) {
        signOut();
        return false;
      }
      if (response.status === 204 || response.ok) {
        setReservation(null);
        setAvailabilityTick((t) => t + 1);
        enqueueSnackbar("Seat reservation removed", { variant: "success" });
        onChange?.();
        return true;
      }
      const reason = userFacingReason(
        await apiErrorFrom("Unable to remove seat reservation", response),
      );
      enqueueSnackbar(
        reason
          ? `Failed to remove seat reservation: ${reason}`
          : "Failed to remove seat reservation",
        { variant: "error" },
      );
      return false;
    } catch (error) {
      console.error("Error removing seat reservation:", error);
      enqueueSnackbar("Error removing seat reservation", { variant: "error" });
      return false;
    } finally {
      setSaving(false);
    }
  }, [
    reservation,
    canRelease,
    enqueueSnackbar,
    eventId,
    token,
    signOut,
    onChange,
  ]);

  const canCheck = Boolean(
    hasSeating && attendanceBuckets && attendanceBuckets.length > 0,
  );

  return {
    reservation: invalidReason ? null : reservation,
    loaded: loaded || !hasSeating,
    availableSeatIds: canCheck ? availableSeatIds : null,
    saving,
    reserve,
    release,
    canRelease,
  };
}

export default useSeatReservation;
