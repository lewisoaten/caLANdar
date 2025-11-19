import * as React from "react";
import { useEffect, useState, useContext, useCallback, useMemo } from "react";
import {
  Typography,
  Box,
  Stack,
  Chip,
  Alert,
  CircularProgress,
  Grid,
  Card,
  CardContent,
  Avatar,
  Container,
  Paper,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import EventSeatIcon from "@mui/icons-material/EventSeat";
import PersonIcon from "@mui/icons-material/Person";
import { UserContext, UserDispatchContext } from "../UserProvider";
import { dateParser } from "../utils";
import { Room, Seat, EventSeatingConfig } from "../types/events";
import { InvitationLiteData } from "../types/invitations";
import { useParams } from "react-router-dom";
import RoomFloorplanView, { SeatDisplayData } from "./RoomFloorplanView";

interface SeatWithOccupancy extends Seat {
  invitations: InvitationLiteData[];
  isOccupied: boolean;
  occupantCount: number;
}

interface InvitationWithDetails extends InvitationLiteData {
  seatLabel: string | null;
  roomName: string | null;
}

const EventSeatMap: React.FC = () => {
  const { signOut } = useContext(UserDispatchContext);
  const userDetails = useContext(UserContext);
  const token = userDetails?.token;
  const theme = useTheme();
  const { id: eventId } = useParams<{ id: string }>();

  const [rooms, setRooms] = useState<Room[]>([]);
  const [seats, setSeats] = useState<Seat[]>([]);
  const [seatingConfig, setSeatingConfig] = useState<EventSeatingConfig | null>(
    null,
  );
  const [invitations, setInvitations] = useState<InvitationLiteData[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Fetch seating configuration
  const fetchSeatingConfig = useCallback(() => {
    if (!eventId || !token) return Promise.resolve();

    return fetch(`/api/events/${eventId}/seating-config`, {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: "Bearer " + token,
      },
    })
      .then((response) => {
        if (response.status === 401) {
          signOut();
          throw new Error("Unauthorized");
        }
        if (!response.ok) {
          throw new Error("Failed to fetch seating config");
        }
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
        setFetchError("Failed to load seating configuration");
        throw error;
      });
  }, [eventId, token, signOut]);

  // Fetch rooms
  const fetchRooms = useCallback(() => {
    if (!eventId || !token) return Promise.resolve();

    return fetch(`/api/events/${eventId}/rooms`, {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: "Bearer " + token,
      },
    })
      .then((response) => {
        if (response.status === 401) {
          signOut();
          throw new Error("Unauthorized");
        }
        if (!response.ok) {
          throw new Error("Failed to fetch rooms");
        }
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
        throw error;
      });
  }, [eventId, token, signOut]);

  // Fetch seats
  const fetchSeats = useCallback(() => {
    if (!eventId || !token) return Promise.resolve();

    return fetch(`/api/events/${eventId}/seats`, {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: "Bearer " + token,
      },
    })
      .then((response) => {
        if (response.status === 401) {
          signOut();
          throw new Error("Unauthorized");
        }
        if (!response.ok) {
          throw new Error("Failed to fetch seats");
        }
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
        throw error;
      });
  }, [eventId, token, signOut]);

  // Fetch invitations with seat information (non-admin endpoint)
  const fetchInvitations = useCallback(() => {
    if (!eventId || !token) return Promise.resolve();

    return fetch(`/api/events/${eventId}/invitations`, {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: "Bearer " + token,
      },
    })
      .then((response) => {
        if (response.status === 401) {
          signOut();
          throw new Error("Unauthorized");
        }
        if (!response.ok) {
          throw new Error("Failed to fetch invitations");
        }
        return response
          .text()
          .then((data) => JSON.parse(data, dateParser) as InvitationLiteData[]);
      })
      .then((data) => {
        if (data) {
          setInvitations(data);
        }
      })
      .catch((error) => {
        console.error("Error fetching invitations:", error);
        throw error;
      });
  }, [eventId, token, signOut]);

  // Load all data
  useEffect(() => {
    setDataLoaded(false);
    setFetchError(null);

    Promise.all([
      fetchSeatingConfig(),
      fetchRooms(),
      fetchSeats(),
      fetchInvitations(),
    ])
      .then(() => {
        setDataLoaded(true);
      })
      .catch((error) => {
        console.error("Error loading data:", error);
        setFetchError(
          "Failed to load seat map data. Please try refreshing the page.",
        );
        setDataLoaded(true);
      });
  }, [eventId, fetchSeatingConfig, fetchRooms, fetchSeats, fetchInvitations]);

  // Build enriched invitation list with seat/room details
  const enrichedInvitations: InvitationWithDetails[] = useMemo(
    () =>
      invitations.map((invitation) => {
        const seat = seats.find((s) => s.id === invitation.seatId);
        const room = seat ? rooms.find((r) => r.id === seat.roomId) : null;

        return {
          ...invitation,
          seatLabel: seat?.label || null,
          roomName: room?.name || null,
        };
      }),
    [invitations, seats, rooms],
  );

  // Group invitations by seat
  const seatsWithOccupancy: SeatWithOccupancy[] = useMemo(
    () =>
      seats.map((seat) => {
        const seatInvitations = invitations.filter(
          (inv) => inv.seatId === seat.id,
        );
        return {
          ...seat,
          invitations: seatInvitations,
          isOccupied: seatInvitations.length > 0,
          occupantCount: seatInvitations.length,
        };
      }),
    [seats, invitations],
  );

  // Unspecified seat invitations
  const unspecifiedInvitations = useMemo(
    () => enrichedInvitations.filter((inv) => inv.seatId === null),
    [enrichedInvitations],
  );

  // Helper to get seats for a room
  const getSeatsForRoom = (roomId: number): SeatWithOccupancy[] => {
    return seatsWithOccupancy.filter((seat) => seat.roomId === roomId);
  };

  // Get the first invitation for a seat (for display)
  const getSeatOccupant = (
    seat: SeatWithOccupancy,
  ): InvitationWithDetails | null => {
    if (!seat.isOccupied) return null;
    return enrichedInvitations.find((inv) => inv.seatId === seat.id) || null;
  };

  // Convert seats to SeatDisplayData for RoomFloorplanView
  const convertToSeatDisplayData = (
    seat: SeatWithOccupancy,
  ): SeatDisplayData => {
    const occupant = getSeatOccupant(seat);
    const isOccupied = seat.isOccupied;

    const occupantName = occupant?.handle || "Someone";

    const tooltip = isOccupied && occupant
      ? `${seat.label} - ${occupantName}`
      : `${seat.label}${seat.description ? ` - ${seat.description}` : ""} - Available`;

    const ariaLabel = isOccupied && occupant
      ? `Seat ${seat.label} occupied by ${occupantName}`
      : `Seat ${seat.label} available`;

    return {
      seat,
      tooltip,
      ariaLabel,
      onClick: undefined, // Read-only view, no interaction
      styles: {
        backgroundColor: isOccupied
          ? "transparent"
          : theme.palette.success.main,
        border: isOccupied
          ? "none"
          : `2px solid ${alpha(theme.palette.success.dark, 0.35)}`,
        color: isOccupied
          ? theme.palette.primary.main
          : theme.palette.common.white,
        zIndex: 1,
      },
      icon: isOccupied && occupant ? "avatar" : "seat",
      avatarSrc:
        isOccupied && occupant
          ? occupant.avatarUrl ||
            "https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y"
          : undefined,
      avatarAlt: isOccupied && occupant ? occupantName : undefined,
    };
  };

  if (!seatingConfig?.hasSeating) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Paper sx={{ p: 3, textAlign: "center" }}>
          <Typography variant="body1" color="text.secondary">
            Seating is not enabled for this event.
          </Typography>
        </Paper>
      </Container>
    );
  }

  if (!dataLoaded) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Paper sx={{ p: 3, textAlign: "center" }}>
          <CircularProgress />
          <Typography variant="body2" sx={{ mt: 2 }}>
            Loading seat map...
          </Typography>
        </Paper>
      </Container>
    );
  }

  if (fetchError) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Paper sx={{ p: 3 }}>
          <Alert severity="error">{fetchError}</Alert>
        </Paper>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Paper sx={{ p: 3 }}>
        <Stack spacing={3}>
          {/* Header */}
          <Box>
            <Typography variant="h4" gutterBottom>
              Seat Map
            </Typography>
            <Typography variant="body1" color="text.secondary">
              View the event&apos;s room layout and see which seats are occupied
            </Typography>
          </Box>

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
              icon={<PersonIcon />}
              label="Occupied"
              color="primary"
              size="small"
            />
            {seatingConfig.allowUnspecifiedSeat && (
              <Chip
                icon={<EventSeatIcon />}
                label="Unspecified"
                color="default"
                variant="outlined"
                size="small"
              />
            )}
          </Stack>

          {/* Summary Statistics */}
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="body2" color="text.secondary">
                    Total Seats
                  </Typography>
                  <Typography variant="h4">{seats.length}</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="body2" color="text.secondary">
                    Occupied Seats
                  </Typography>
                  <Typography variant="h4">
                    {seatsWithOccupancy.filter((s) => s.isOccupied).length}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="body2" color="text.secondary">
                    Available Seats
                  </Typography>
                  <Typography variant="h4">
                    {seatsWithOccupancy.filter((s) => !s.isOccupied).length}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            {seatingConfig.allowUnspecifiedSeat && (
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="body2" color="text.secondary">
                      Unspecified Seats
                    </Typography>
                    <Typography variant="h4">
                      {unspecifiedInvitations.length}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            )}
          </Grid>

          {/* Room Floorplans */}
          {rooms.length === 0 ? (
            <Alert severity="info">
              No rooms or seats have been configured for this event yet.
            </Alert>
          ) : (
            <Stack spacing={3}>
              {rooms.map((room) => {
                const roomSeats = getSeatsForRoom(room.id);
                if (roomSeats.length === 0) return null;

                const occupiedCount = roomSeats.filter(
                  (s) => s.isOccupied,
                ).length;
                const totalCount = roomSeats.length;

                return (
                  <Card key={room.id} variant="outlined">
                    <CardContent>
                      <Box
                        sx={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          mb: 2,
                        }}
                      >
                        <Typography variant="h6">{room.name}</Typography>
                        <Chip
                          label={`${occupiedCount}/${totalCount} occupied`}
                          color={
                            occupiedCount === totalCount ? "error" : "default"
                          }
                          size="small"
                        />
                      </Box>
                      {room.description && (
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ mb: 2 }}
                        >
                          {room.description}
                        </Typography>
                      )}

                      {/* Floorplan visualization using RoomFloorplanView */}
                      <RoomFloorplanView
                        room={room}
                        seats={roomSeats.map(convertToSeatDisplayData)}
                      />

                      {/* List view of seats */}
                      <Grid container spacing={1}>
                        {roomSeats.map((seat) => {
                          const occupant = getSeatOccupant(seat);
                          const isOccupied = seat.isOccupied;

                          return (
                            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={seat.id}>
                              <Card
                                variant="outlined"
                                sx={{
                                  backgroundColor: isOccupied
                                    ? alpha(theme.palette.primary.main, 0.1)
                                    : alpha(theme.palette.success.main, 0.1),
                                  border: `1px solid ${isOccupied ? theme.palette.primary.main : theme.palette.success.main}`,
                                }}
                              >
                                <CardContent
                                  sx={{ p: 2, "&:last-child": { pb: 2 } }}
                                >
                                  <Stack
                                    direction="row"
                                    spacing={2}
                                    alignItems="center"
                                  >
                                    {isOccupied && occupant ? (
                                      <Avatar
                                        src={
                                          occupant.avatarUrl ||
                                          "https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y"
                                        }
                                        alt={occupant.handle || "Someone"}
                                        sx={{ width: 40, height: 40 }}
                                      >
                                        <PersonIcon />
                                      </Avatar>
                                    ) : (
                                      <Box
                                        sx={{
                                          width: 40,
                                          height: 40,
                                          borderRadius: "50%",
                                          backgroundColor:
                                            theme.palette.success.main,
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "center",
                                          color: theme.palette.common.white,
                                        }}
                                      >
                                        <EventSeatIcon fontSize="small" />
                                      </Box>
                                    )}
                                    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                                      <Typography
                                        variant="body1"
                                        fontWeight="bold"
                                      >
                                        {seat.label}
                                      </Typography>
                                      {isOccupied && occupant ? (
                                        <Typography
                                          variant="body2"
                                          color="text.secondary"
                                          noWrap
                                        >
                                          {occupant.handle || "Someone"}
                                        </Typography>
                                      ) : (
                                        <Typography
                                          variant="body2"
                                          color="success.main"
                                        >
                                          Available
                                        </Typography>
                                      )}
                                    </Box>
                                  </Stack>
                                </CardContent>
                              </Card>
                            </Grid>
                          );
                        })}
                      </Grid>
                    </CardContent>
                  </Card>
                );
              })}
            </Stack>
          )}

          {/* Unspecified Seat Attendees */}
          {seatingConfig.allowUnspecifiedSeat &&
            unspecifiedInvitations.length > 0 && (
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Attendees with Unspecified Seats
                  </Typography>
                  <Grid container spacing={1}>
                    {unspecifiedInvitations.map((invitation, index) => (
                      <Grid
                        size={{ xs: 12, sm: 6, md: 4 }}
                        key={`unspecified-${index}`}
                      >
                        <Card
                          variant="outlined"
                          sx={{
                            backgroundColor: alpha(
                              theme.palette.grey[500],
                              0.1,
                            ),
                          }}
                        >
                          <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
                            <Stack
                              direction="row"
                              spacing={2}
                              alignItems="center"
                            >
                              <Avatar
                                src={
                                  invitation.avatarUrl ||
                                  "https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y"
                                }
                                alt={invitation.handle || "Someone"}
                                sx={{ width: 40, height: 40 }}
                              >
                                <PersonIcon />
                              </Avatar>
                              <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                                <Typography variant="body1" fontWeight="bold">
                                  {invitation.handle || "Someone"}
                                </Typography>
                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                >
                                  Unspecified Seat
                                </Typography>
                              </Box>
                            </Stack>
                          </CardContent>
                        </Card>
                      </Grid>
                    ))}
                  </Grid>
                </CardContent>
              </Card>
            )}
        </Stack>
      </Paper>
    </Container>
  );
};

export default EventSeatMap;
