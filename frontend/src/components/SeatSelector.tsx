import * as React from "react";
import { useEffect, useState, useContext, useMemo } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Typography,
} from "@mui/material";
import DeskSharp from "@mui/icons-material/DeskSharp";
import { UserContext, UserDispatchContext } from "../UserProvider";
import { dateParser } from "../utils";
import { EventSeatingConfig } from "../types/events";
import { RSVP } from "../types/invitations";
import { Kicker, colors, fonts } from "./hl";
import {
  SeatFloorPlan,
  FloorPlanLegend,
  type FloorPlanDesk,
} from "./SeatFloorPlan";
import {
  roomCode,
  sortRooms,
  type FloorPlanRoom,
  type FloorPlanSeat,
} from "./seatFloorPlanModel";
import { useSeatReservation } from "./useSeatReservation";

interface SeatSelectorProps {
  eventId: number;
  attendanceBuckets: number[] | null;
  disabled: boolean;
  onReservationChange?: () => void;
}

/**
 * Standalone seat picker that saves immediately (claim / swap / remove),
 * drawing each room as a floor plan. The seat map page and the RSVP wizard
 * have their own flows; this one is for embedding next to an RSVP form.
 */
const SeatSelector: React.FC<SeatSelectorProps> = ({
  eventId,
  attendanceBuckets,
  disabled,
  onReservationChange,
}) => {
  const { signOut } = useContext(UserDispatchContext);
  const userDetails = useContext(UserContext);
  const token = userDetails?.token;

  const [rooms, setRooms] = useState<FloorPlanRoom[]>([]);
  const [seats, setSeats] = useState<FloorPlanSeat[]>([]);
  const [seatsLoaded, setSeatsLoaded] = useState(false);
  const [seatingConfig, setSeatingConfig] = useState<EventSeatingConfig | null>(
    null,
  );
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);
  const [userHandle, setUserHandle] = useState<string | null>(null);
  const [userRsvpStatus, setUserRsvpStatus] = useState<RSVP | null>(null);

  const headers = useMemo(
    () => ({
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: "Bearer " + token,
    }),
    [token],
  );

  // Fetch seating configuration
  useEffect(() => {
    if (!eventId || !token) return;

    fetch(`/api/events/${eventId}/seating-config?as_admin=true`, { headers })
      .then((response) => {
        if (response.status === 401) signOut();
        else if (response.ok)
          return response
            .text()
            .then((data) => JSON.parse(data, dateParser) as EventSeatingConfig);
      })
      .then((data) => {
        if (data) {
          setSeatingConfig(data);
        }
      })
      .catch((error) => {
        console.error("Error fetching seating config:", error);
      });
  }, [eventId, token, signOut, headers]);

  // Fetch rooms and seats
  useEffect(() => {
    if (!eventId || !token || !seatingConfig?.hasSeating) return;

    fetch(`/api/events/${eventId}/rooms?as_admin=true`, { headers })
      .then((response) => {
        if (response.status === 401) signOut();
        else if (response.ok)
          return response
            .text()
            .then((data) => JSON.parse(data, dateParser) as FloorPlanRoom[]);
      })
      .then((data) => {
        if (data) {
          setRooms(data);
        }
      })
      .catch((error) => {
        console.error("Error fetching rooms:", error);
      });

    fetch(`/api/events/${eventId}/seats?as_admin=true`, { headers })
      .then((response) => {
        if (response.status === 401) signOut();
        else if (response.ok)
          return response
            .text()
            .then((data) => JSON.parse(data, dateParser) as FloorPlanSeat[]);
      })
      .then((data) => {
        if (data) {
          setSeats(data);
        }
      })
      .catch((error) => {
        console.error("Error fetching seats:", error);
      })
      .finally(() => setSeatsLoaded(true));
  }, [eventId, token, signOut, seatingConfig, headers]);

  // Fetch user's invitation to get avatar URL
  useEffect(() => {
    if (!token || !userDetails?.email || !eventId) return;

    fetch(
      `/api/events/${eventId}/invitations/${encodeURIComponent(
        userDetails.email,
      )}`,
      { headers },
    )
      .then((response) => {
        if (response.ok)
          return response.text().then((data) => JSON.parse(data, dateParser));
      })
      .then((data) => {
        if (data?.avatarUrl) {
          setUserAvatarUrl(data.avatarUrl);
        }
        if (data?.handle) {
          setUserHandle(data.handle);
        }
        if (data?.response) {
          setUserRsvpStatus(data.response);
        }
      })
      .catch((error) => {
        console.error("Error fetching user invitation for avatar:", error);
      });
  }, [token, userDetails?.email, eventId, headers]);

  const {
    reservation: currentReservation,
    loaded: dataLoaded,
    availableSeatIds,
    saving: loading,
    reserve,
    release,
  } = useSeatReservation({
    eventId,
    token,
    signOut,
    seatingConfig,
    seats,
    seatsLoaded,
    attendanceBuckets,
    onChange: onReservationChange,
  });

  const available = availableSeatIds ?? [];

  const desksFor = (roomSeats: FloorPlanSeat[]): FloorPlanDesk[] =>
    roomSeats.map((seat) => {
      const isOwnSeat = currentReservation?.seatId === seat.id;
      const isAvailable = available.includes(seat.id);
      return {
        seat,
        state: isOwnSeat ? "mine" : isAvailable ? "free" : "taken",
        occupants: isOwnSeat
          ? [{ name: userHandle, avatarUrl: userAvatarUrl }]
          : [],
        sub:
          isOwnSeat && userRsvpStatus === RSVP.maybe
            ? "YOU · MAYBE"
            : undefined,
        disabled: disabled || loading,
      };
    });

  if (!seatingConfig || !seatingConfig.hasSeating) {
    return null;
  }

  if (!dataLoaded) {
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

  const currentSeat = seats.find((s) => s.id === currentReservation?.seatId);
  const orderedRooms = sortRooms(rooms).filter((room) =>
    seats.some((s) => s.roomId === room.id),
  );

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Typography component="h2" variant="h3">
        Seat Selection
      </Typography>

      {!attendanceBuckets || attendanceBuckets.length === 0 ? (
        <Alert severity="info">
          Please select your RSVP and attendance times above to choose your
          seat.
        </Alert>
      ) : (
        <>
          {/* Current reservation display */}
          {currentReservation && (
            <Alert
              severity="success"
              action={
                <Button
                  color="inherit"
                  size="small"
                  onClick={() => release()}
                  disabled={loading || disabled}
                >
                  Remove
                </Button>
              }
            >
              {currentReservation.seatId ? (
                <>
                  You have reserved seat <strong>{currentSeat?.label}</strong>
                </>
              ) : (
                <>You have reserved an unspecified seat</>
              )}
            </Alert>
          )}

          {/* Unspecified seat option */}
          {seatingConfig.allowUnspecifiedSeat && (
            <Button
              variant={
                currentReservation && !currentReservation.seatId
                  ? "contained"
                  : "outlined"
              }
              color="primary"
              startIcon={<DeskSharp />}
              onClick={() => reserve(null)}
              disabled={loading || disabled}
              aria-pressed={Boolean(
                currentReservation && !currentReservation.seatId,
              )}
              fullWidth
              sx={{ justifyContent: "flex-start" }}
            >
              {seatingConfig.unspecifiedSeatLabel || "Unspecified Seat"}
            </Button>
          )}

          <FloorPlanLegend
            items={[
              { key: "free", label: "Available" },
              { key: "mine", label: "Your Seat" },
              { key: "taken", label: "Occupied" },
            ]}
          />

          {/* Rooms and seats */}
          {orderedRooms.length === 0 ? (
            <Alert severity="info">
              No rooms or seats have been configured for this event yet.
            </Alert>
          ) : (
            orderedRooms.map((room, index) => {
              const roomSeats = seats.filter((s) => s.roomId === room.id);
              const desks = desksFor(roomSeats);
              return (
                <Box
                  key={room.id}
                  component="section"
                  aria-label={room.name}
                  sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}
                >
                  <Kicker component="h3" prefix={false}>
                    {roomCode(index)} · {room.name}
                  </Kicker>
                  {room.description && (
                    <Typography sx={{ fontSize: 13, color: colors.textMuted }}>
                      {room.description}
                    </Typography>
                  )}
                  <SeatFloorPlan
                    room={room}
                    desks={desks}
                    label={`${room.name} floor plan`}
                    selectable={false}
                    onDeskSelect={(seat) => {
                      if (seat.id !== currentReservation?.seatId) {
                        reserve(seat.id);
                      }
                    }}
                  />
                  <Box
                    component="span"
                    sx={{
                      fontFamily: fonts.mono,
                      fontSize: 11,
                      letterSpacing: "0.16em",
                      color: colors.cyan,
                    }}
                  >
                    {desks.filter((d) => d.state === "free").length} FREE
                  </Box>
                </Box>
              );
            })
          )}
        </>
      )}
    </Box>
  );
};

export default SeatSelector;
