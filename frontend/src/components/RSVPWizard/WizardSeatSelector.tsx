import * as React from "react";
import { useEffect, useState, useContext, useMemo } from "react";
import { Box, Button, CircularProgress, Typography } from "@mui/material";
import DeskSharp from "@mui/icons-material/DeskSharp";
import CheckSharp from "@mui/icons-material/CheckSharp";
import { UserContext, UserDispatchContext } from "../../UserProvider";
import { Seat } from "../../types/events";
import { InvitationLiteData } from "../../types/invitations";
import { SeatAvailabilityResponse } from "../../types/seat_reservations";
import { colors, fonts, hairline, tint } from "../hl";
import { displayCallsign } from "../../utils/callsign";
import {
  SeatFloorPlan,
  FloorPlanLegend,
  type FloorPlanDesk,
} from "../SeatFloorPlan";
import {
  ownDeskLabel,
  roomCode,
  sortRooms,
  type FloorPlanRoom,
  type FloorPlanSeat,
} from "../seatFloorPlanModel";

interface WizardSeatSelectorProps {
  eventId: number;
  attendanceBuckets: number[] | null;
  selectedSeatId: number | null;
  reservedSeatId: number | null;
  onSeatSelect: (
    seatId: number | null,
    label?: string,
    roomName?: string,
  ) => void;
  allowUnspecifiedSeat: boolean;
  unspecifiedSeatLabel?: string;
  disabled: boolean;
}

/**
 * The RSVP wizard's graphical seat picker: every room drawn as a floor plan
 * (free / taken with avatar / your pick), plus the "Bring my own desk"
 * (unspecified seat) option when the event allows it. Nothing is saved here;
 * the wizard reserves the seat when the RSVP is confirmed.
 */
const WizardSeatSelector: React.FC<WizardSeatSelectorProps> = ({
  eventId,
  attendanceBuckets,
  selectedSeatId,
  reservedSeatId,
  onSeatSelect,
  allowUnspecifiedSeat,
  unspecifiedSeatLabel = "Unspecified Seat",
  disabled,
}) => {
  const { signOut } = useContext(UserDispatchContext);
  const userDetails = useContext(UserContext);
  const token = userDetails?.token;

  const [rooms, setRooms] = useState<FloorPlanRoom[]>([]);
  const [seats, setSeats] = useState<FloorPlanSeat[]>([]);
  const [occupants, setOccupants] = useState<InvitationLiteData[]>([]);
  const [availableSeats, setAvailableSeats] = useState<number[]>([]);
  // Keys of the requests that have finished, so a new event/attendance shows
  // the spinner again without resetting state inside the effects.
  const [seatsLoadedFor, setSeatsLoadedFor] = useState<number | null>(null);
  const availabilityKey = attendanceBuckets
    ? `${eventId}:${attendanceBuckets.join("")}`
    : null;
  const [availabilityLoadedFor, setAvailabilityLoadedFor] = useState<
    string | null
  >(null);
  // Which request failed (so a retry or new attendance clears it), and a
  // counter to re-run the requests from the error state's Retry button.
  const [seatsFailedFor, setSeatsFailedFor] = useState<number | null>(null);
  const [availabilityFailedFor, setAvailabilityFailedFor] = useState<
    string | null
  >(null);
  const [retry, setRetry] = useState(0);
  const loading = Boolean(eventId && token) && seatsLoadedFor !== eventId;
  const availabilityLoaded = availabilityLoadedFor === availabilityKey;

  const ownDesk = ownDeskLabel(unspecifiedSeatLabel);

  // Fetch rooms and seats
  useEffect(() => {
    if (!eventId || !token) return;

    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: "Bearer " + token,
    };

    // Fetch rooms
    fetch(`/api/events/${eventId}/rooms`, { headers })
      .then((response) => {
        if (response.status === 401) signOut();
        else if (response.ok) return response.json();
      })
      .then((data) => {
        if (data) {
          setRooms(data);
        }
      })
      .catch((error) => {
        console.error("Error fetching rooms:", error);
      });

    // Fetch seats
    fetch(`/api/events/${eventId}/seats`, { headers })
      .then((response) => {
        if (response.status === 401) {
          signOut();
          return undefined;
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((data) => {
        if (data) {
          setSeats(data);
          setSeatsFailedFor(null);
        }
      })
      .catch((error) => {
        console.error("Error fetching seats:", error);
        setSeatsFailedFor(eventId);
      })
      .finally(() => {
        setSeatsLoadedFor(eventId);
      });

    // Who sits where, for the avatars on taken desks (optional extra).
    Promise.resolve()
      .then(() => fetch(`/api/events/${eventId}/invitations`, { headers }))
      .then((response) => (response?.ok ? response.json() : null))
      .then((data) => {
        if (Array.isArray(data)) setOccupants(data);
      })
      .catch((error) => {
        console.error("Error fetching seat occupants:", error);
      });
  }, [eventId, token, signOut, retry]);

  // Fetch seat availability
  useEffect(() => {
    if (!eventId || !token || !attendanceBuckets) return;

    fetch(`/api/events/${eventId}/seat-reservations/check-availability`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({ attendanceBuckets }),
    })
      .then((response) => {
        if (response.status === 401) {
          signOut();
          return undefined;
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<SeatAvailabilityResponse>;
      })
      .then((data) => {
        if (data?.availableSeatIds) {
          setAvailableSeats(data.availableSeatIds);
          setAvailabilityFailedFor(null);
        }
      })
      .catch((error) => {
        console.error("Error fetching seat availability:", error);
        // Without availability every desk would read as taken: show an
        // error with a retry instead of a misleading plan.
        setAvailabilityFailedFor(`${eventId}:${attendanceBuckets.join("")}`);
      })
      .finally(() =>
        setAvailabilityLoadedFor(`${eventId}:${attendanceBuckets.join("")}`),
      );
  }, [eventId, token, attendanceBuckets, signOut, retry]);

  const handleSeatClick = async (seatId: number) => {
    if (disabled) return;

    // Toggle selection
    if (selectedSeatId === seatId) {
      onSeatSelect(null);
    } else {
      // Fetch seat details before calling callback
      const seat = seats.find((s) => s.id === seatId);
      if (seat) {
        const room = rooms.find((r) => r.id === seat.roomId);
        if (room) {
          // Call callback with full seat information
          onSeatSelect(seat.id, seat.label, room.name);
        } else {
          onSeatSelect(seat.id, seat.label);
        }
      } else {
        // This should not happen: seatId exists but seat data is missing.
        // This indicates a data inconsistency.
        console.warn(
          `handleSeatClick: seatId ${seatId} not found in seats array.`,
        );
        onSeatSelect(seatId);
      }
    }
  };

  const handleUnspecifiedSeat = () => {
    if (disabled) return;
    onSeatSelect(null, ownDesk, undefined);
  };

  const desksFor = useMemo(
    () =>
      (roomSeats: Seat[]): FloorPlanDesk[] =>
        roomSeats.map((seat) => {
          const isAvailable =
            availableSeats.includes(seat.id) || seat.id === reservedSeatId;
          const isSelected = selectedSeatId === seat.id;
          const people =
            seat.id === reservedSeatId
              ? []
              : occupants
                  .filter((o) => o.seatId === seat.id)
                  .map((o) => ({
                    name: displayCallsign(o.handle),
                    avatarUrl: o.avatarUrl,
                  }));
          return {
            seat,
            state: isSelected ? "selected" : isAvailable ? "free" : "taken",
            occupants: people,
            sub: isSelected ? "YOU" : undefined,
            disabled: disabled || !isAvailable,
          };
        }),
    [availableSeats, reservedSeatId, selectedSeatId, occupants, disabled],
  );

  const byoPressed = selectedSeatId === null;
  const byoButton = allowUnspecifiedSeat && (
    <Box
      component="button"
      type="button"
      onClick={handleUnspecifiedSeat}
      disabled={disabled}
      aria-pressed={byoPressed}
      sx={{
        minHeight: 48,
        px: 2,
        display: "flex",
        alignItems: "center",
        gap: 1.25,
        cursor: disabled ? "default" : "pointer",
        textAlign: "left",
        borderRadius: 0,
        fontFamily: fonts.ui,
        fontSize: 15,
        border: `1px solid ${byoPressed ? colors.cyan : hairline.control}`,
        backgroundColor: byoPressed ? tint("cyan", 0.14) : "transparent",
        color: byoPressed ? colors.cyan : colors.text,
        opacity: disabled ? 0.6 : 1,
        "&:hover": disabled ? {} : { borderColor: colors.cyan },
        "&:focus-visible": {
          outline: `2px solid ${colors.cyan}`,
          outlineOffset: "2px",
        },
        "& svg": { fontSize: 20, flex: "none" },
      }}
    >
      <DeskSharp aria-hidden="true" />
      <Box component="span" sx={{ flex: 1 }}>
        {ownDesk}
      </Box>
      {byoPressed && <CheckSharp aria-hidden="true" />}
    </Box>
  );

  if (loading || (attendanceBuckets && !availabilityLoaded && seats.length)) {
    return (
      <Box
        role="status"
        aria-label="Loading seats"
        sx={{
          display: "flex",
          justifyContent: "center",
          p: 3,
        }}
      >
        <CircularProgress aria-hidden="true" />
      </Box>
    );
  }

  const loadFailed =
    seatsFailedFor === eventId ||
    (availabilityKey !== null && availabilityFailedFor === availabilityKey);
  if (loadFailed) {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Box
          role="alert"
          sx={{
            p: 2,
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 1.5,
            border: `1px solid ${tint("pink", 0.45)}`,
            backgroundColor: tint("pink", 0.06),
            color: colors.text,
            fontSize: 15,
          }}
        >
          <Box component="span" sx={{ flex: "1 1 220px" }}>
            Couldn&apos;t check which desks are free.{" "}
            {allowUnspecifiedSeat
              ? "Try again, or bring your own desk."
              : "Try again to pick your desk."}
          </Box>
          <Button
            variant="outlined"
            size="small"
            disabled={disabled}
            onClick={() => {
              setSeatsFailedFor(null);
              setAvailabilityFailedFor(null);
              setSeatsLoadedFor(null);
              setAvailabilityLoadedFor(null);
              setRetry((r) => r + 1);
            }}
          >
            Retry
          </Button>
        </Box>
        {byoButton}
      </Box>
    );
  }

  const orderedRooms = sortRooms(rooms).filter((room) =>
    seats.some((s) => s.roomId === room.id),
  );

  if (orderedRooms.length === 0 || seats.length === 0) {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Box
          role="status"
          sx={{
            p: 2,
            border: `1px dashed ${hairline.control}`,
            color: colors.textMuted,
            fontSize: 15,
          }}
        >
          No seats are currently configured for this event.
        </Box>
        {byoButton}
      </Box>
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {orderedRooms.map((room, index) => {
        const roomSeats = seats.filter((s) => s.roomId === room.id);
        const desks = desksFor(roomSeats);
        const free = desks.filter((d) => d.state === "free").length;
        const headingId = `wizard-room-${room.id}`;
        return (
          <Box
            key={room.id}
            component="section"
            aria-labelledby={headingId}
            sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}
          >
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                gap: 1.25,
                fontFamily: fonts.mono,
                fontSize: 11,
                letterSpacing: "0.16em",
                color: colors.textDim,
                textTransform: "uppercase",
              }}
            >
              <Box component="h3" id={headingId} sx={{ m: 0, font: "inherit" }}>
                {roomCode(index)} · {room.name}
              </Box>
              <Box component="span" sx={{ color: colors.cyan, flex: "none" }}>
                {free} FREE
              </Box>
            </Box>
            {room.description && (
              <Typography sx={{ fontSize: 13, color: colors.textMuted }}>
                {room.description}
              </Typography>
            )}
            <SeatFloorPlan
              room={room}
              desks={desks}
              label={`${room.name} floor plan`}
              onDeskSelect={disabled ? undefined : (s) => handleSeatClick(s.id)}
            />
          </Box>
        );
      })}

      <FloorPlanLegend
        size="sm"
        items={[{ key: "selected", label: "Your pick" }, "free", "taken"]}
      />

      {byoButton}

      {selectedSeatId !== null &&
        (() => {
          const picked = seats.find((s) => s.id === selectedSeatId);
          const about = picked?.description?.trim();
          return (
            <Box role="status" sx={{ fontSize: 13, color: colors.textMuted }}>
              {picked && (
                <Box
                  component="span"
                  sx={{ display: "block", color: colors.text }}
                >
                  You selected {picked.label}
                  {about ? ` — ${about}` : ""}
                </Box>
              )}
              Seat will be reserved when you confirm your RSVP
            </Box>
          );
        })()}
    </Box>
  );
};

export default WizardSeatSelector;
