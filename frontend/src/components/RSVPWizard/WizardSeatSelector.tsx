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
  onSeatSelect: (seatId: number | null, label?: string, roomName?: string) => void;
  allowUnspecifiedSeat: boolean;
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
      const seat = seats.find(s => s.id === seatId);
      if (seat) {
        try {
          // Fetch seat details to get label
          const seatResponse = await fetch(`/api/events/${eventId}/seats/${seatId}`, {
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              Authorization: "Bearer " + token,
            },
          });
          
          if (seatResponse.ok) {
            const seatData = await seatResponse.json();
            let roomName: string | undefined;
            
            // Fetch room name if roomId exists
            if (seatData.roomId) {
              const roomResponse = await fetch(`/api/events/${eventId}/rooms/${seatData.roomId}`, {
                headers: {
                  "Content-Type": "application/json",
                  Accept: "application/json",
                  Authorization: "Bearer " + token,
                },
              });
              
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
    onSeatSelect(null);
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
            Skip seat selection (Unspecified Seat)
          </Button>
        </Box>
      )}

      {rooms.map((room) => {
        const roomSeats = getRoomSeats(room.id);
        if (roomSeats.length === 0) return null;

        return (
          <Card key={room.id} variant="outlined">
            <CardContent>
              <Typography variant="h6" gutterBottom>
                {room.name}
              </Typography>
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
                            color={seat.isSelected ? "primary" : "inherit"}
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

      {selectedSeatId && (
        <Alert severity="info">
          Seat will be reserved when you confirm your RSVP
        </Alert>
      )}
    </Stack>
  );
};

export default WizardSeatSelector;
