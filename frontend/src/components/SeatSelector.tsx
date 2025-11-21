import * as React from "react";
import { useEffect, useState, useContext, useCallback } from "react";
import {
  Typography,
  Box,
  Stack,
  Button,
  Chip,
  Alert,
  CircularProgress,
  Grid,
  Card,
  CardContent,
} from "@mui/material";
import EventSeatIcon from "@mui/icons-material/EventSeat";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import { UserContext, UserDispatchContext } from "../UserProvider";
import { dateParser } from "../utils";
import { Room, Seat, EventSeatingConfig } from "../types/events";
import {
  SeatReservation,
  SeatReservationSubmit,
  SeatAvailabilityResponse,
} from "../types/seat_reservations";
import { RSVP, InvitationLiteData } from "../types/invitations";
import { useSnackbar } from "notistack";
import RoomFloorplanView, { SeatDisplayData } from "./RoomFloorplanView";
import moment from "moment";

interface SeatSelectorProps {
  eventId: number;
  attendanceBuckets: number[] | null;
  disabled: boolean;
  onReservationChange?: () => void;
}

interface SeatWithReservation extends Seat {
  isAvailable: boolean;
  isOwnSeat: boolean;
  isOccupied: boolean;
}

const SeatSelector: React.FC<SeatSelectorProps> = ({
  eventId,
  attendanceBuckets,
  disabled,
  onReservationChange,
}) => {
  const { signOut } = useContext(UserDispatchContext);
  const userDetails = useContext(UserContext);
  const token = userDetails?.token;
  const { enqueueSnackbar } = useSnackbar();

  const [rooms, setRooms] = useState<Room[]>([]);
  const [seats, setSeats] = useState<Seat[]>([]);
  const [seatingConfig, setSeatingConfig] = useState<EventSeatingConfig | null>(
    null,
  );
  const [currentReservation, setCurrentReservation] =
    useState<SeatReservation | null>(null);
  const [availableSeats, setAvailableSeats] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);
  const [userRsvpStatus, setUserRsvpStatus] = useState<RSVP | null>(null);

  // Fetch seating configuration
  useEffect(() => {
    if (!eventId || !token) return;

    fetch(`/api/events/${eventId}/seating-config?as_admin=true`, {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: "Bearer " + token,
      },
    })
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
  }, [eventId, token, signOut]);

  // Fetch rooms and seats
  useEffect(() => {
    if (!eventId || !token || !seatingConfig?.hasSeating) return;

    // Fetch rooms
    fetch(`/api/events/${eventId}/rooms?as_admin=true`, {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: "Bearer " + token,
      },
    })
      .then((response) => {
        if (response.status === 401) signOut();
        else if (response.ok)
          return response
            .text()
            .then((data) => JSON.parse(data, dateParser) as Room[]);
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
    fetch(`/api/events/${eventId}/seats?as_admin=true`, {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: "Bearer " + token,
      },
    })
      .then((response) => {
        if (response.status === 401) signOut();
        else if (response.ok)
          return response
            .text()
            .then((data) => JSON.parse(data, dateParser) as Seat[]);
      })
      .then((data) => {
        if (data) {
          setSeats(data);
        }
      })
      .catch((error) => {
        console.error("Error fetching seats:", error);
      });
  }, [eventId, token, signOut, seatingConfig]);

  // Fetch current reservation
  useEffect(() => {
    if (!eventId || !token || !seatingConfig?.hasSeating) return;

    fetch(`/api/events/${eventId}/seat-reservations/me`, {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: "Bearer " + token,
      },
    })
      .then((response) => {
        if (response.status === 401) signOut();
        else if (response.status === 404) {
          // No reservation yet
          setCurrentReservation(null);
          setDataLoaded(true);
          return null;
        } else if (response.ok)
          return response
            .text()
            .then((data) => JSON.parse(data, dateParser) as SeatReservation);
      })
      .then((data) => {
        if (data) {
          setCurrentReservation(data);
        }
        setDataLoaded(true);
      })
      .catch((error) => {
        console.error("Error fetching seat reservation:", error);
        setDataLoaded(true);
      });
  }, [eventId, token, signOut, seatingConfig, attendanceBuckets]);

  // Validate current reservation against seating config and available seats
  useEffect(() => {
    if (
      !currentReservation ||
      !seatingConfig ||
      !dataLoaded ||
      !seats ||
      seats.length === 0
    )
      return;

    // Check if user has unspecified seat but it's no longer allowed
    if (
      currentReservation.seatId === null &&
      !seatingConfig.allowUnspecifiedSeat
    ) {
      enqueueSnackbar(
        "Your unspecified seat reservation is no longer valid. The event now requires a specific seat. Please select a seat.",
        { variant: "warning", persist: true },
      );
      // Clear the invalid reservation from state
      setCurrentReservation(null);
      return;
    }

    // Check if user's specific seat no longer exists
    if (currentReservation.seatId !== null) {
      const seatExists = seats.some((s) => s.id === currentReservation.seatId);
      if (!seatExists) {
        enqueueSnackbar(
          "Your reserved seat has been removed by the admin. Please select a new seat.",
          { variant: "warning", persist: true },
        );
        // Clear the invalid reservation from state
        setCurrentReservation(null);
      }
    }
  }, [currentReservation, seatingConfig, seats, dataLoaded, enqueueSnackbar]);

  // Fetch user's invitation to get avatar URL
  useEffect(() => {
    if (!token || !userDetails?.email || !eventId) return;

    fetch(
      `/api/events/${eventId}/invitations/${encodeURIComponent(
        userDetails.email,
      )}`,
      {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: "Bearer " + token,
        },
      },
    )
      .then((response) => {
        if (response.ok)
          return response.text().then((data) => JSON.parse(data, dateParser));
      })
      .then((data) => {
        if (data?.avatarUrl) {
          setUserAvatarUrl(data.avatarUrl);
        }
        if (data?.response) {
          setUserRsvpStatus(data.response);
        }
      })
      .catch((error) => {
        console.error("Error fetching user invitation for avatar:", error);
      });
  }, [token, userDetails?.email, eventId]);

  const fetchSeatAvailability = useCallback(() => {
    if (
      !eventId ||
      !token ||
      !seatingConfig?.hasSeating ||
      !attendanceBuckets ||
      attendanceBuckets.length === 0
    ) {
      setAvailableSeats([]);
      return;
    }

    fetch(`/api/events/${eventId}/seat-reservations/check-availability`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({
        attendanceBuckets: attendanceBuckets,
      }),
    })
      .then((response) => {
        if (response.status === 401) signOut();
        else if (response.ok)
          return response
            .text()
            .then((data) => JSON.parse(data) as SeatAvailabilityResponse);
      })
      .then((data) => {
        if (data) {
          setAvailableSeats(data.availableSeatIds);
        }
      })
      .catch((error) => {
        console.error("Error checking seat availability:", error);
      });
  }, [eventId, token, seatingConfig, attendanceBuckets, signOut]);

  // Check seat availability when attendance buckets change
  useEffect(() => {
    fetchSeatAvailability();
  }, [fetchSeatAvailability]);

  const handleSeatSelect = async (seatId: number | null) => {
    if (!attendanceBuckets || attendanceBuckets.length === 0) {
      enqueueSnackbar("Please select your attendance times first", {
        variant: "warning",
      });
      return;
    }

    setLoading(true);

    const reservationData: SeatReservationSubmit = {
      seatId: seatId,
      attendanceBuckets: attendanceBuckets,
    };

    try {
      let response;
      if (currentReservation) {
        // Update existing reservation
        response = await fetch(`/api/events/${eventId}/seat-reservations/me`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: "Bearer " + token,
          },
          body: JSON.stringify(reservationData),
        });
      } else {
        // Create new reservation
        response = await fetch(`/api/events/${eventId}/seat-reservations/me`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: "Bearer " + token,
          },
          body: JSON.stringify(reservationData),
        });
      }

      if (response.status === 401) {
        signOut();
        return;
      } else if (response.status === 409) {
        enqueueSnackbar(
          "This seat is already reserved for the selected times. Please choose another seat.",
          { variant: "error" },
        );
      } else if (response.status === 400) {
        const errorText = await response.text();
        enqueueSnackbar(`Invalid request: ${errorText}`, { variant: "error" });
      } else if (response.ok) {
        const previousSeatId = currentReservation?.seatId ?? null;
        const data = JSON.parse(
          await response.text(),
          dateParser,
        ) as SeatReservation;
        setCurrentReservation(data);
        setAvailableSeats((prev) => {
          const updated = new Set(prev);
          if (previousSeatId !== null) {
            updated.add(previousSeatId);
          }
          if (data.seatId !== null) {
            updated.add(data.seatId);
          }
          return Array.from(updated);
        });
        // fetchSeatAvailability() removed - useEffect will handle this
        enqueueSnackbar("Seat reservation saved successfully", {
          variant: "success",
        });
        if (onReservationChange) {
          onReservationChange();
        }
      } else {
        enqueueSnackbar("Failed to save seat reservation", {
          variant: "error",
        });
      }
    } catch (error) {
      console.error("Error saving seat reservation:", error);
      enqueueSnackbar("Error saving seat reservation", { variant: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveReservation = async () => {
    if (!currentReservation) return;

    // Check if seating is mandatory (no unspecified seat allowed and user has a specific seat)
    if (
      seatingConfig &&
      !seatingConfig.allowUnspecifiedSeat &&
      currentReservation.seatId !== null
    ) {
      enqueueSnackbar(
        "Seat selection is mandatory for this event. Please select a different seat instead of removing your reservation.",
        { variant: "warning" },
      );
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        `/api/events/${eventId}/seat-reservations/me`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: "Bearer " + token,
          },
        },
      );

      if (response.status === 401) {
        signOut();
        return;
      } else if (response.status === 204) {
        setCurrentReservation(null);
        enqueueSnackbar("Seat reservation removed", { variant: "success" });
        if (onReservationChange) {
          onReservationChange();
        }
      } else {
        enqueueSnackbar("Failed to remove seat reservation", {
          variant: "error",
        });
      }
    } catch (error) {
      console.error("Error removing seat reservation:", error);
      enqueueSnackbar("Error removing seat reservation", { variant: "error" });
    } finally {
      setLoading(false);
    }
  };

  // Helper function to get seat status
  const getSeatStatus = (seat: Seat): SeatWithReservation => {
    const isOwnSeat = currentReservation?.seatId === seat.id;
    const isAvailable = availableSeats.includes(seat.id);
    const isOccupied = !isAvailable && !isOwnSeat;

    return {
      ...seat,
      isAvailable,
      isOwnSeat,
      isOccupied,
    };
  };

  // Helper to get seats for a room
  const getSeatsForRoom = (roomId: number): SeatWithReservation[] => {
    return seats
      .filter((seat) => seat.roomId === roomId)
      .map((seat) => getSeatStatus(seat));
  };

  const convertSeatToDisplayData = (
    seat: SeatWithReservation,
  ): SeatDisplayData => {
    const isInteractive = !seat.isOccupied && !disabled;

    // Create occupants array based on whether it's the user's seat
    const occupants: InvitationLiteData[] = seat.isOwnSeat
      ? [
          {
            eventId,
            avatarUrl: userAvatarUrl,
            handle: null, // We don't have handle in SeatSelector context
            response: userRsvpStatus,
            attendance: attendanceBuckets,
            seatId: seat.id,
            lastModified: moment(),
          },
        ]
      : [];

    return {
      seat,
      occupants,
      isOwnSeat: seat.isOwnSeat,
      isAvailable: seat.isAvailable,
      onClick: isInteractive ? () => handleSeatSelect(seat.id) : undefined,
      onKeyDown: isInteractive
        ? (e: React.KeyboardEvent<HTMLDivElement>) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleSeatSelect(seat.id);
            }
          }
        : undefined,
    };
  };

  if (!seatingConfig || !seatingConfig.hasSeating) {
    return null;
  }

  if (!dataLoaded) {
    return (
      <Box display="flex" justifyContent="center" p={3}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Typography component="h2" variant="h6" color="primary" gutterBottom>
        Seat Selection
      </Typography>

      {!attendanceBuckets || attendanceBuckets.length === 0 ? (
        <Alert severity="info" sx={{ mb: 2 }}>
          Please select your RSVP and attendance times above to choose your
          seat.
        </Alert>
      ) : (
        <>
          {/* Current reservation display */}
          {currentReservation && (
            <Alert
              severity="success"
              sx={{ mb: 2 }}
              action={
                <Button
                  color="inherit"
                  size="small"
                  onClick={handleRemoveReservation}
                  disabled={loading || disabled}
                >
                  Remove
                </Button>
              }
            >
              {currentReservation.seatId ? (
                <>
                  You have reserved seat{" "}
                  <strong>
                    {
                      seats.find((s) => s.id === currentReservation.seatId)
                        ?.label
                    }
                  </strong>
                </>
              ) : (
                <>You have reserved an unspecified seat</>
              )}
            </Alert>
          )}

          {/* Unspecified seat option */}
          {seatingConfig.allowUnspecifiedSeat && (
            <Box sx={{ mb: 3 }}>
              <Button
                variant={
                  currentReservation && !currentReservation.seatId
                    ? "contained"
                    : "outlined"
                }
                color="primary"
                startIcon={<EventSeatIcon />}
                onClick={() => handleSeatSelect(null)}
                disabled={loading || disabled}
                fullWidth
                sx={{ justifyContent: "flex-start", py: 1.5 }}
              >
                {seatingConfig.unspecifiedSeatLabel || "Unspecified Seat"}
              </Button>
            </Box>
          )}

          {/* Legend */}
          <Stack direction="row" spacing={2} sx={{ mb: 2 }} flexWrap="wrap">
            <Chip
              icon={<EventSeatIcon />}
              label="Available"
              color="success"
              variant="outlined"
              size="small"
            />
            <Chip
              icon={<CheckCircleIcon />}
              label="Your Seat"
              color="primary"
              size="small"
            />
            <Chip
              icon={<EventSeatIcon />}
              label="Occupied"
              color="default"
              disabled
              size="small"
            />
          </Stack>

          {/* Rooms and seats */}
          {rooms.length === 0 ? (
            <Alert severity="info">
              No rooms or seats have been configured for this event yet.
            </Alert>
          ) : (
            <Stack spacing={3}>
              {rooms.map((room) => {
                const roomSeats = getSeatsForRoom(room.id);
                if (roomSeats.length === 0) return null;

                return (
                  <Card key={room.id} variant="outlined">
                    <CardContent>
                      <Typography variant="h6" gutterBottom>
                        {room.name}
                      </Typography>
                      {room.description && (
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          gutterBottom
                        >
                          {room.description}
                        </Typography>
                      )}

                      {/* Floorplan visualization using RoomFloorplanView */}
                      <RoomFloorplanView
                        room={room}
                        seats={roomSeats.map(convertSeatToDisplayData)}
                      />

                      {/* List view of seats */}
                      <Grid container spacing={1}>
                        {roomSeats.map((seat) => (
                          <Grid size={{ xs: 6, sm: 4, md: 3 }} key={seat.id}>
                            <Button
                              variant={
                                seat.isOwnSeat ? "contained" : "outlined"
                              }
                              color={
                                seat.isOwnSeat
                                  ? userRsvpStatus === RSVP.yes
                                    ? "primary"
                                    : userRsvpStatus === RSVP.maybe
                                      ? "warning"
                                      : "primary"
                                  : seat.isAvailable
                                    ? "success"
                                    : "inherit"
                              }
                              startIcon={
                                seat.isOwnSeat ? (
                                  <CheckCircleIcon />
                                ) : (
                                  <EventSeatIcon />
                                )
                              }
                              onClick={() => handleSeatSelect(seat.id)}
                              disabled={seat.isOccupied || loading || disabled}
                              fullWidth
                              sx={{
                                justifyContent: "flex-start",
                                minHeight: 44, // Ensure minimum tap target
                              }}
                              aria-label={`Seat ${seat.label}${
                                seat.description ? `, ${seat.description}` : ""
                              }${
                                seat.isOwnSeat
                                  ? " (your seat)"
                                  : seat.isOccupied
                                    ? " (occupied)"
                                    : " (available)"
                              }`}
                            >
                              {seat.label}
                              {seat.isOwnSeat &&
                                userRsvpStatus === RSVP.maybe &&
                                " (Maybe)"}
                            </Button>
                          </Grid>
                        ))}
                      </Grid>
                    </CardContent>
                  </Card>
                );
              })}
            </Stack>
          )}
        </>
      )}
    </Box>
  );
};

export default SeatSelector;
