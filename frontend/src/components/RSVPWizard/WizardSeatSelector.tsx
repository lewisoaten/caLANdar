import * as React from "react";
import { useEffect, useState, useContext } from "react";
import {
  Typography,
  Box,
  Stack,
  Button,
  Alert,
  CircularProgress,
  Tooltip,
  Grid,
  Card,
  CardContent,
  CardMedia,
  Chip,
} from "@mui/material";
import EventSeatIcon from "@mui/icons-material/EventSeat";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import { UserContext, UserDispatchContext } from "../../UserProvider";
import { Room, Seat } from "../../types/events";
import { SeatAvailabilityResponse } from "../../types/seat_reservations";

interface WizardSeatSelectorProps {
  eventId: number;
  attendanceBuckets: number[] | null;
  selectedSeatId: number | null;
  onSeatSelect: (
    seatId: number | null,
    label?: string,
    roomName?: string,
  ) => void;
  allowUnspecifiedSeat: boolean;
  unspecifiedSeatLabel?: string;
  disabled: boolean;
}

interface SeatWithAvailability extends Seat {
  isAvailable: boolean;
  isSelected: boolean;
}

const WizardSeatSelector: React.FC<WizardSeatSelectorProps> = ({
  eventId,
  attendanceBuckets,
  selectedSeatId,
  onSeatSelect,
  allowUnspecifiedSeat,
  unspecifiedSeatLabel = "Unspecified Seat",
  disabled,
}) => {
  const { signOut } = useContext(UserDispatchContext);
  const userDetails = useContext(UserContext);
  const token = userDetails?.token;

  const [rooms, setRooms] = useState<Room[]>([]);
  const [seats, setSeats] = useState<Seat[]>([]);
  const [availableSeats, setAvailableSeats] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch rooms and seats
  useEffect(() => {
    if (!eventId || !token) return;

    setLoading(true);

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
    fetch(`/api/events/${eventId}/seats?as_admin=true`, {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: "Bearer " + token,
      },
    })
      .then((response) => {
        if (response.status === 401) signOut();
        else if (response.ok) return response.json();
      })
      .then((data) => {
        if (data) {
          setSeats(data);
        }
      })
      .catch((error) => {
        console.error("Error fetching seats:", error);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [eventId, token, signOut]);

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
        if (response.status === 401) signOut();
        else if (response.ok) return response.json();
      })
      .then((data: SeatAvailabilityResponse) => {
        if (data?.availableSeatIds) {
          setAvailableSeats(data.availableSeatIds);
        }
      })
      .catch((error) => {
        console.error("Error fetching seat availability:", error);
      });
  }, [eventId, token, attendanceBuckets, signOut]);

  const handleSeatClick = async (seatId: number) => {
    if (disabled) return;

    // Toggle selection
    if (selectedSeatId === seatId) {
      onSeatSelect(null);
    } else {
      // Fetch seat details before calling callback
      const seat = seats.find((s) => s.id === seatId);
      if (seat) {
        try {
          // Fetch seat details to get label
          const seatResponse = await fetch(
            `/api/events/${eventId}/seats/${seatId}`,
            {
              headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                Authorization: "Bearer " + token,
              },
            },
          );

          if (seatResponse.ok) {
            const seatData = await seatResponse.json();
            let roomName: string | undefined;

            // Fetch room name if roomId exists
            if (seatData.roomId) {
              const roomResponse = await fetch(
                `/api/events/${eventId}/rooms/${seatData.roomId}`,
                {
                  headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                    Authorization: "Bearer " + token,
                  },
                },
              );

              if (roomResponse.ok) {
                const roomData = await roomResponse.json();
                roomName = roomData.name;
              }
            }

            // Call callback with full seat information
            onSeatSelect(seatId, seatData.label, roomName);
          } else {
            // Fallback: just pass seatId
            onSeatSelect(seatId);
          }
        } catch (error) {
          console.error("Error fetching seat details:", error);
          // Fallback: just pass seatId
          onSeatSelect(seatId);
        }
      } else {
        onSeatSelect(seatId);
      }
    }
  };

  const handleUnspecifiedSeat = () => {
    if (disabled) return;
    onSeatSelect(null, unspecifiedSeatLabel, undefined);
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" p={3}>
        <CircularProgress />
      </Box>
    );
  }

  if (rooms.length === 0 || seats.length === 0) {
    return (
      <Alert severity="info">
        No seats are currently configured for this event.
      </Alert>
    );
  }

  const seatsWithAvailability: SeatWithAvailability[] = seats.map((seat) => ({
    ...seat,
    isAvailable: availableSeats.includes(seat.id),
    isSelected: selectedSeatId === seat.id,
  }));

  const getRoomSeats = (roomId: number) => {
    return seatsWithAvailability.filter((seat) => seat.roomId === roomId);
  };

  return (
    <Stack spacing={3}>
      {allowUnspecifiedSeat && (
        <Box>
          <Button
            variant={selectedSeatId === null ? "contained" : "outlined"}
            onClick={handleUnspecifiedSeat}
            disabled={disabled}
            fullWidth
          >
            {selectedSeatId === null && <CheckCircleIcon sx={{ mr: 1 }} />}
            {unspecifiedSeatLabel}
          </Button>
        </Box>
      )}

      {/* Legend */}
      <Stack direction="row" spacing={2} flexWrap="wrap">
        <Chip
          icon={<EventSeatIcon />}
          label="Available"
          color="success"
          variant="outlined"
          size="small"
        />
        <Chip
          icon={<CheckCircleIcon />}
          label="Selected"
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

      {rooms.map((room) => {
        const roomSeats = getRoomSeats(room.id);
        if (roomSeats.length === 0) return null;

        return (
          <Card key={room.id} variant="outlined">
            <CardContent>
              <Typography variant="h6" gutterBottom>
                {room.name}
              </Typography>
              {room.description && (
                <Typography variant="body2" color="text.secondary" gutterBottom>
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
                        title={`${seat.label}${seat.description ? ` - ${seat.description}` : ""}${seat.isSelected ? " (selected)" : !seat.isAvailable ? " (occupied)" : " (available)"}`}
                        placement="top"
                      >
                        <Box
                          onClick={() => {
                            if (seat.isAvailable && !disabled) {
                              handleSeatClick(seat.id);
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
                            backgroundColor: seat.isSelected
                              ? "primary.main"
                              : !seat.isAvailable
                                ? "action.disabledBackground"
                                : "success.main",
                            color: "white",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor:
                              !seat.isAvailable || disabled
                                ? "not-allowed"
                                : "pointer",
                            pointerEvents: "auto",
                            border: "2px solid",
                            borderColor: seat.isSelected
                              ? "primary.dark"
                              : "transparent",
                            fontSize: "0.75rem",
                            fontWeight: "bold",
                            opacity:
                              !seat.isAvailable && !seat.isSelected ? 0.5 : 1,
                            transition: "all 0.2s",
                            "&:hover": {
                              transform:
                                seat.isAvailable && !disabled
                                  ? "translate(-50%, -50%) scale(1.1)"
                                  : "translate(-50%, -50%)",
                            },
                            minWidth: 44,
                            minHeight: 44,
                          }}
                          role="button"
                          aria-label={`Seat ${seat.label}${seat.isSelected ? " (selected)" : !seat.isAvailable ? " (occupied)" : " (available)"}`}
                          tabIndex={!seat.isAvailable || disabled ? -1 : 0}
                          onKeyDown={(e) => {
                            if (
                              (e.key === "Enter" || e.key === " ") &&
                              seat.isAvailable &&
                              !disabled
                            ) {
                              e.preventDefault();
                              handleSeatClick(seat.id);
                            }
                          }}
                        >
                          {seat.isSelected ? (
                            <CheckCircleIcon fontSize="small" />
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
                {roomSeats.map((seat) => {
                  const isDisabled = disabled || !seat.isAvailable;

                  return (
                    <Grid key={seat.id} size="auto">
                      <Tooltip
                        title={
                          !seat.isAvailable
                            ? "Not available for your attendance"
                            : seat.isSelected
                              ? "Selected"
                              : "Click to select"
                        }
                      >
                        <span>
                          <Button
                            variant={seat.isSelected ? "contained" : "outlined"}
                            onClick={() => handleSeatClick(seat.id)}
                            disabled={isDisabled}
                            size="small"
                            startIcon={
                              seat.isSelected ? (
                                <CheckCircleIcon />
                              ) : (
                                <EventSeatIcon />
                              )
                            }
                            color={
                              seat.isSelected
                                ? "primary"
                                : seat.isAvailable
                                  ? "success"
                                  : "inherit"
                            }
                            sx={{ minHeight: 44 }}
                          >
                            {seat.label}
                          </Button>
                        </span>
                      </Tooltip>
                    </Grid>
                  );
                })}
              </Grid>
            </CardContent>
          </Card>
        );
      })}

      {selectedSeatId !== null && (
        <Alert severity="info">
          Seat will be reserved when you confirm your RSVP
        </Alert>
      )}
    </Stack>
  );
};

export default WizardSeatSelector;
