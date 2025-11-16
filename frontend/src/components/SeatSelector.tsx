import * as React from "react";
import { useEffect, useState, useContext } from "react";
import {
  Typography,
  Box,
  Stack,
  Button,
  Chip,
  Alert,
  CircularProgress,
  Tooltip,
  Grid,
  Card,
  CardContent,
  CardMedia,
  Avatar,
} from "@mui/material";
import EventSeatIcon from "@mui/icons-material/EventSeat";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import PersonIcon from "@mui/icons-material/Person";
import { UserContext, UserDispatchContext } from "../UserProvider";
import { dateParser } from "../utils";
import { Room, Seat, EventSeatingConfig } from "../types/events";
import {
  SeatReservation,
  SeatReservationSubmit,
  SeatAvailabilityResponse,
} from "../types/seat_reservations";
import { useSnackbar } from "notistack";

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
  }, [eventId, token, signOut, seatingConfig]);

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

  // Fetch user profile for avatar
  useEffect(() => {
    if (!token || !userDetails?.email) return;

    fetch(`/api/profiles/${encodeURIComponent(userDetails.email)}`, {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: "Bearer " + token,
      },
    })
      .then((response) => {
        if (response.ok)
          return response.text().then((data) => JSON.parse(data, dateParser));
      })
      .then((data) => {
        if (data?.avatarUrl) {
          setUserAvatarUrl(data.avatarUrl);
        }
      })
      .catch((error) => {
        console.error("Error fetching user profile:", error);
      });
  }, [token, userDetails?.email]);

  // Check seat availability when attendance buckets change
  useEffect(() => {
    if (
      !eventId ||
      !token ||
      !seatingConfig?.hasSeating ||
      !attendanceBuckets ||
      attendanceBuckets.length === 0
    )
      return;

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
  }, [eventId, token, signOut, attendanceBuckets, seatingConfig]);

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
        const data = JSON.parse(
          await response.text(),
          dateParser,
        ) as SeatReservation;
        setCurrentReservation(data);
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

                      {/* Floorplan visualization if image exists */}
                      {room.image && (
                        <Box
                          sx={{
                            position: "relative",
                            mb: 2,
                            paddingTop: "75%",
                          }}
                        >
                          <CardMedia
                            component="img"
                            image={room.image}
                            alt={`${room.name} floorplan`}
                            sx={{
                              position: "absolute",
                              top: 0,
                              left: 0,
                              width: "100%",
                              height: "100%",
                              objectFit: "contain",
                              border: "1px solid",
                              borderColor: "divider",
                              borderRadius: 1,
                            }}
                          />
                          {/* Overlay seats on floorplan */}
                          <Box
                            sx={{
                              position: "absolute",
                              top: 0,
                              left: 0,
                              width: "100%",
                              height: "100%",
                              pointerEvents: "none",
                            }}
                          >
                            {roomSeats.map((seat) => (
                              <Tooltip
                                key={seat.id}
                                title={`${seat.label}${seat.description ? ` - ${seat.description}` : ""}`}
                                placement="top"
                              >
                                <Box
                                  onClick={() => {
                                    if (!seat.isOccupied && !disabled) {
                                      handleSeatSelect(seat.id);
                                    }
                                  }}
                                  sx={{
                                    position: "absolute",
                                    left: `${seat.x * 100}%`,
                                    top: `${seat.y * 100}%`,
                                    transform: "translate(-50%, -50%)",
                                    width: 44,
                                    height: 44,
                                    borderRadius: "50%",
                                    backgroundColor: seat.isOwnSeat
                                      ? "transparent"
                                      : seat.isOccupied
                                        ? "action.disabledBackground"
                                        : "success.main",
                                    color: "white",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    cursor:
                                      seat.isOccupied || disabled
                                        ? "not-allowed"
                                        : "pointer",
                                    pointerEvents: "auto",
                                    border: !seat.isOwnSeat
                                      ? "2px solid"
                                      : "none",
                                    borderColor: !seat.isOwnSeat
                                      ? "transparent"
                                      : undefined,
                                    fontSize: "0.75rem",
                                    fontWeight: "bold",
                                    opacity: seat.isOccupied ? 0.5 : 1,
                                    transition: "all 0.2s",
                                    "&:hover": {
                                      transform:
                                        !seat.isOccupied && !disabled
                                          ? "translate(-50%, -50%) scale(1.1)"
                                          : "translate(-50%, -50%)",
                                    },
                                    // Ensure minimum tap target size for accessibility
                                    minWidth: 44,
                                    minHeight: 44,
                                  }}
                                  role="button"
                                  aria-label={`Seat ${seat.label}${seat.isOwnSeat ? " (your seat)" : seat.isOccupied ? " (occupied)" : " (available)"}`}
                                  tabIndex={
                                    seat.isOccupied || disabled ? -1 : 0
                                  }
                                  onKeyDown={(e) => {
                                    if (
                                      (e.key === "Enter" || e.key === " ") &&
                                      !seat.isOccupied &&
                                      !disabled
                                    ) {
                                      e.preventDefault();
                                      handleSeatSelect(seat.id);
                                    }
                                  }}
                                >
                                  {seat.isOwnSeat ? (
                                    <Avatar
                                      src={
                                        userAvatarUrl ||
                                        "https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y"
                                      }
                                      alt="Your seat"
                                      sx={{
                                        width: 36,
                                        height: 36,
                                        border: "3px solid",
                                        borderColor: "secondary.main",
                                      }}
                                    >
                                      <PersonIcon />
                                    </Avatar>
                                  ) : (
                                    <EventSeatIcon fontSize="small" />
                                  )}
                                </Box>
                              </Tooltip>
                            ))}
                          </Box>
                        </Box>
                      )}

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
                                  ? "primary"
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
                              aria-label={`Seat ${seat.label}${seat.description ? `, ${seat.description}` : ""}${seat.isOwnSeat ? " (your seat)" : seat.isOccupied ? " (occupied)" : " (available)"}`}
                            >
                              {seat.label}
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
