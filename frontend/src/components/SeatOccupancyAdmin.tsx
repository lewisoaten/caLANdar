import * as React from "react";
import { useEffect, useState, useContext, useCallback, useMemo } from "react";
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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  MenuItem,
  FormControl,
  InputLabel,
  Select,
  SelectChangeEvent,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Avatar,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import EventSeatIcon from "@mui/icons-material/EventSeat";
import PersonIcon from "@mui/icons-material/Person";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import WarningIcon from "@mui/icons-material/Warning";
import { UserContext, UserDispatchContext } from "../UserProvider";
import { dateParser } from "../utils";
import { Room, Seat, EventSeatingConfig } from "../types/events";
import {
  SeatReservation,
  SeatReservationSubmit,
} from "../types/seat_reservations";
import { InvitationData } from "../types/invitations";
import { useSnackbar } from "notistack";

interface SeatOccupancyAdminProps {
  eventId: number;
  refreshTrigger?: number; // Optional trigger to force refresh
}

interface SeatWithOccupancy extends Seat {
  reservations: SeatReservation[];
  isOccupied: boolean;
  occupantCount: number;
}

interface ReservationWithDetails extends SeatReservation {
  seatLabel: string | null;
  roomName: string | null;
  invitationHandle: string | null;
  invitationAvatarUrl: string | null;
}

const SeatOccupancyAdmin: React.FC<SeatOccupancyAdminProps> = ({
  eventId,
  refreshTrigger = 0,
}) => {
  const { signOut } = useContext(UserDispatchContext);
  const userDetails = useContext(UserContext);
  const token = userDetails?.token;
  const { enqueueSnackbar } = useSnackbar();
  const theme = useTheme();

  const [rooms, setRooms] = useState<Room[]>([]);
  const [seats, setSeats] = useState<Seat[]>([]);
  const [seatingConfig, setSeatingConfig] = useState<EventSeatingConfig | null>(
    null,
  );
  const [reservations, setReservations] = useState<SeatReservation[]>([]);
  const [invitations, setInvitations] = useState<InvitationData[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Move/Edit dialog state
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [selectedReservation, setSelectedReservation] =
    useState<ReservationWithDetails | null>(null);
  const [newSeatId, setNewSeatId] = useState<number | null>(null);
  const [moveInProgress, setMoveInProgress] = useState(false);

  // Delete confirmation dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [emailToDelete, setEmailToDelete] = useState<string | null>(null);

  // Fetch seating configuration
  const fetchSeatingConfig = useCallback(() => {
    if (!eventId || !token) return Promise.resolve();

    return fetch(`/api/events/${eventId}/seating-config?as_admin=true`, {
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

    return fetch(`/api/events/${eventId}/rooms?as_admin=true`, {
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

    return fetch(`/api/events/${eventId}/seats?as_admin=true`, {
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

  // Fetch all seat reservations
  const fetchReservations = useCallback(() => {
    if (!eventId || !token) return Promise.resolve();

    return fetch(`/api/events/${eventId}/seat-reservations?as_admin=true`, {
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
          throw new Error("Failed to fetch reservations");
        }
        return response
          .text()
          .then((data) => JSON.parse(data, dateParser) as SeatReservation[]);
      })
      .then((data) => {
        if (data) {
          setReservations(data);
        }
      })
      .catch((error) => {
        console.error("Error fetching seat reservations:", error);
        throw error;
      });
  }, [eventId, token, signOut]);

  // Fetch invitations to get user details
  const fetchInvitations = useCallback(() => {
    if (!eventId || !token) return Promise.resolve();

    return fetch(`/api/events/${eventId}/invitations?as_admin=true`, {
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
          .then((data) => JSON.parse(data, dateParser) as InvitationData[]);
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
      fetchReservations(),
      fetchInvitations(),
    ])
      .then(() => {
        setDataLoaded(true);
      })
      .catch((error) => {
        console.error("Error loading data:", error);
        setFetchError(
          "Failed to load seat occupancy data. Please try refreshing the page.",
        );
        setDataLoaded(true); // Set to true so we show the error message instead of loading
      });
  }, [
    eventId,
    refreshTrigger,
    fetchSeatingConfig,
    fetchRooms,
    fetchSeats,
    fetchReservations,
    fetchInvitations,
  ]);

  // Build enriched reservation list with seat/room/user details
  const enrichedReservations: ReservationWithDetails[] = useMemo(
    () =>
      reservations.map((reservation) => {
        const seat = seats.find((s) => s.id === reservation.seatId);
        const room = seat ? rooms.find((r) => r.id === seat.roomId) : null;
        const invitation = invitations.find(
          (i) => i.email === reservation.invitationEmail,
        );

        return {
          ...reservation,
          seatLabel: seat?.label || null,
          roomName: room?.name || null,
          invitationHandle: invitation?.handle || null,
          invitationAvatarUrl: invitation?.avatarUrl || null,
        };
      }),
    [reservations, seats, rooms, invitations],
  );

  // Group reservations by seat
  const seatsWithOccupancy: SeatWithOccupancy[] = useMemo(
    () =>
      seats.map((seat) => {
        const seatReservations = reservations.filter(
          (r) => r.seatId === seat.id,
        );
        return {
          ...seat,
          reservations: seatReservations,
          isOccupied: seatReservations.length > 0,
          occupantCount: seatReservations.length,
        };
      }),
    [seats, reservations],
  );

  // Unspecified seat reservations
  const unspecifiedReservations = useMemo(
    () => enrichedReservations.filter((r) => r.seatId === null),
    [enrichedReservations],
  );

  // Handle opening move dialog
  const handleOpenMoveDialog = (reservation: ReservationWithDetails) => {
    setSelectedReservation(reservation);
    setNewSeatId(reservation.seatId);
    setMoveDialogOpen(true);
  };

  // Handle closing move dialog
  const handleCloseMoveDialog = () => {
    setMoveDialogOpen(false);
    setSelectedReservation(null);
    setNewSeatId(null);
  };

  // Handle moving a reservation
  const handleMoveReservation = async () => {
    if (!selectedReservation || !token) return;

    setMoveInProgress(true);

    try {
      const submitData: SeatReservationSubmit = {
        seatId: newSeatId,
        attendanceBuckets: selectedReservation.attendanceBuckets,
      };

      const response = await fetch(
        `/api/events/${eventId}/seat-reservations/${encodeURIComponent(selectedReservation.invitationEmail)}?as_admin=true`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: "Bearer " + token,
          },
          body: JSON.stringify(submitData),
        },
      );

      if (response.status === 401) {
        signOut();
        return;
      }

      if (response.status === 409) {
        // Conflict - seat already occupied for those times
        enqueueSnackbar(
          "This seat is already reserved for one or more of the selected time periods. Please choose a different seat.",
          { variant: "error" },
        );
        setMoveInProgress(false);
        return;
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Failed to update seat reservation");
      }

      enqueueSnackbar("Seat assignment updated successfully", {
        variant: "success",
      });
      handleCloseMoveDialog();
      fetchReservations(); // Refresh the list
    } catch (error) {
      console.error("Error moving reservation:", error);
      enqueueSnackbar(
        error instanceof Error
          ? error.message
          : "Failed to update seat assignment",
        { variant: "error" },
      );
    } finally {
      setMoveInProgress(false);
    }
  };

  // Handle opening delete dialog
  const handleOpenDeleteDialog = (email: string) => {
    setEmailToDelete(email);
    setDeleteDialogOpen(true);
  };

  // Handle closing delete dialog
  const handleCloseDeleteDialog = () => {
    setDeleteDialogOpen(false);
    setEmailToDelete(null);
  };

  // Handle clearing a reservation
  const handleClearReservation = async () => {
    if (!token || !emailToDelete) return;

    try {
      const response = await fetch(
        `/api/events/${eventId}/seat-reservations/${encodeURIComponent(emailToDelete)}?as_admin=true`,
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
      }

      if (!response.ok) {
        throw new Error("Failed to delete seat reservation");
      }

      enqueueSnackbar("Seat assignment cleared successfully", {
        variant: "success",
      });
      handleCloseDeleteDialog();
      fetchReservations(); // Refresh the list
    } catch (error) {
      console.error("Error clearing reservation:", error);
      enqueueSnackbar("Failed to clear seat assignment", { variant: "error" });
    }
  };

  // Helper to generate aria-label for attendance buckets
  const getAttendanceAriaLabel = (buckets: number[]) => {
    const pattern = buckets
      .map(
        (bucket, idx) =>
          `Bucket ${idx + 1}: ${bucket === 1 ? "Attending" : "Not attending"}`,
      )
      .join(", ");
    return `Attendance pattern: ${pattern}`;
  };

  // Render attendance buckets as a visual indicator
  const renderAttendanceBuckets = (buckets: number[]) => {
    return (
      <Box
        sx={{ display: "flex", gap: 0.5 }}
        role="img"
        aria-label={getAttendanceAriaLabel(buckets)}
      >
        {buckets.map((bucket, index) => (
          <Tooltip
            key={index}
            title={`Bucket ${index + 1}: ${bucket === 1 ? "Attending" : "Not attending"}`}
            enterDelay={200}
          >
            <Box
              sx={{
                width: 12,
                height: 12,
                backgroundColor:
                  bucket === 1
                    ? theme.palette.success.main
                    : theme.palette.action.disabledBackground,
                border: `1px solid ${theme.palette.divider}`,
                borderRadius: 0.5,
              }}
            />
          </Tooltip>
        ))}
      </Box>
    );
  };

  if (!seatingConfig?.hasSeating) {
    return (
      <Paper sx={{ p: 3, textAlign: "center" }}>
        <Typography variant="body1" color="text.secondary">
          Seating is not enabled for this event.
        </Typography>
      </Paper>
    );
  }

  if (!dataLoaded) {
    return (
      <Paper sx={{ p: 3, textAlign: "center" }}>
        <CircularProgress />
        <Typography variant="body2" sx={{ mt: 2 }}>
          Loading seat occupancy data...
        </Typography>
      </Paper>
    );
  }

  if (fetchError) {
    return (
      <Paper sx={{ p: 3 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          {fetchError}
        </Alert>
        <Button
          variant="contained"
          onClick={() => {
            setFetchError(null);
            setDataLoaded(false);
            // Trigger re-fetch by using the current dependencies
            Promise.all([
              fetchSeatingConfig(),
              fetchRooms(),
              fetchSeats(),
              fetchReservations(),
              fetchInvitations(),
            ])
              .then(() => {
                setDataLoaded(true);
              })
              .catch((error) => {
                console.error("Error loading data:", error);
                setFetchError(
                  "Failed to load seat occupancy data. Please try refreshing the page.",
                );
                setDataLoaded(true);
              });
          }}
        >
          Retry
        </Button>
      </Paper>
    );
  }

  return (
    <Paper sx={{ p: 3 }}>
      <Stack spacing={3}>
        {/* Header */}
        <Box>
          <Typography variant="h5" gutterBottom>
            Seat Occupancy Overview
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Manage seat assignments for all attendees
          </Typography>
        </Box>

        {/* Summary Statistics */}
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Card>
              <CardContent>
                <Typography variant="body2" color="text.secondary">
                  Total Seats
                </Typography>
                <Typography variant="h4">{seats.length}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Card>
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
            <Card>
              <CardContent>
                <Typography variant="body2" color="text.secondary">
                  Unspecified Seats
                </Typography>
                <Typography variant="h4">
                  {unspecifiedReservations.length}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Card>
              <CardContent>
                <Typography variant="body2" color="text.secondary">
                  Total Reservations
                </Typography>
                <Typography variant="h4">{reservations.length}</Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Occupancy Map by Room */}
        <Box>
          <Typography variant="h6" gutterBottom>
            Occupancy Map
          </Typography>
          {rooms.length === 0 ? (
            <Alert severity="info">No rooms configured for this event.</Alert>
          ) : (
            <Stack spacing={2}>
              {rooms.map((room) => {
                const roomSeats = seatsWithOccupancy.filter(
                  (s) => s.roomId === room.id,
                );
                const occupiedCount = roomSeats.filter(
                  (s) => s.isOccupied,
                ).length;
                const totalCount = roomSeats.length;

                return (
                  <Card key={room.id}>
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
                      <Grid container spacing={1}>
                        {roomSeats.map((seat) => (
                          <Grid size="auto" key={seat.id}>
                            <Tooltip
                              title={
                                seat.isOccupied
                                  ? `${seat.label} - ${seat.occupantCount} reservation(s)`
                                  : `${seat.label} - Available`
                              }
                            >
                              <Chip
                                icon={<EventSeatIcon />}
                                label={seat.label}
                                size="small"
                                color={seat.isOccupied ? "primary" : "default"}
                                variant={
                                  seat.isOccupied ? "filled" : "outlined"
                                }
                                sx={{ minWidth: 80 }}
                              />
                            </Tooltip>
                          </Grid>
                        ))}
                      </Grid>
                    </CardContent>
                  </Card>
                );
              })}
            </Stack>
          )}
        </Box>

        {/* Seat Assignment Table */}
        <Box>
          <Typography variant="h6" gutterBottom>
            Seat Assignments
          </Typography>
          {enrichedReservations.length === 0 ? (
            <Alert severity="info">No seat reservations found.</Alert>
          ) : (
            <TableContainer>
              <Table aria-label="seat assignments table">
                <TableHead>
                  <TableRow>
                    <TableCell>Attendee</TableCell>
                    <TableCell>Room</TableCell>
                    <TableCell>Seat</TableCell>
                    <TableCell>Attendance</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {enrichedReservations
                    .filter((r) => r.seatId !== null)
                    .map((reservation) => (
                      <TableRow key={reservation.id} hover>
                        <TableCell>
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 1,
                            }}
                          >
                            {reservation.invitationAvatarUrl ? (
                              <Avatar
                                src={reservation.invitationAvatarUrl}
                                alt={
                                  reservation.invitationHandle ||
                                  reservation.invitationEmail
                                }
                                sx={{ width: 32, height: 32 }}
                              />
                            ) : (
                              <Avatar sx={{ width: 32, height: 32 }}>
                                <PersonIcon />
                              </Avatar>
                            )}
                            <Box>
                              <Typography variant="body2">
                                {reservation.invitationHandle ||
                                  reservation.invitationEmail}
                              </Typography>
                              {reservation.invitationHandle && (
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                >
                                  {reservation.invitationEmail}
                                </Typography>
                              )}
                            </Box>
                          </Box>
                        </TableCell>
                        <TableCell>{reservation.roomName || "—"}</TableCell>
                        <TableCell>
                          <Chip
                            icon={<EventSeatIcon />}
                            label={reservation.seatLabel || "Unknown"}
                            size="small"
                            color="primary"
                          />
                        </TableCell>
                        <TableCell>
                          {renderAttendanceBuckets(
                            reservation.attendanceBuckets,
                          )}
                        </TableCell>
                        <TableCell align="right">
                          <Tooltip title="Move to different seat">
                            <IconButton
                              size="small"
                              onClick={() => handleOpenMoveDialog(reservation)}
                              aria-label={`Move ${reservation.invitationEmail} to different seat`}
                            >
                              <SwapHorizIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Clear seat assignment">
                            <IconButton
                              size="small"
                              onClick={() =>
                                handleOpenDeleteDialog(
                                  reservation.invitationEmail,
                                )
                              }
                              aria-label={`Clear seat assignment for ${reservation.invitationEmail}`}
                            >
                              <DeleteIcon />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>

        {/* Unspecified Seat Reservations */}
        {seatingConfig.allowUnspecifiedSeat && (
          <Box>
            <Typography variant="h6" gutterBottom>
              Unspecified Seat Attendees
            </Typography>
            {unspecifiedReservations.length === 0 ? (
              <Alert severity="info">No unspecified seat reservations.</Alert>
            ) : (
              <TableContainer>
                <Table aria-label="unspecified seat reservations table">
                  <TableHead>
                    <TableRow>
                      <TableCell>Attendee</TableCell>
                      <TableCell>Attendance</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {unspecifiedReservations.map((reservation) => (
                      <TableRow key={reservation.id} hover>
                        <TableCell>
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 1,
                            }}
                          >
                            {reservation.invitationAvatarUrl ? (
                              <Avatar
                                src={reservation.invitationAvatarUrl}
                                alt={
                                  reservation.invitationHandle ||
                                  reservation.invitationEmail
                                }
                                sx={{ width: 32, height: 32 }}
                              />
                            ) : (
                              <Avatar sx={{ width: 32, height: 32 }}>
                                <PersonIcon />
                              </Avatar>
                            )}
                            <Box>
                              <Typography variant="body2">
                                {reservation.invitationHandle ||
                                  reservation.invitationEmail}
                              </Typography>
                              {reservation.invitationHandle && (
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                >
                                  {reservation.invitationEmail}
                                </Typography>
                              )}
                            </Box>
                          </Box>
                        </TableCell>
                        <TableCell>
                          {renderAttendanceBuckets(
                            reservation.attendanceBuckets,
                          )}
                        </TableCell>
                        <TableCell align="right">
                          <Tooltip title="Assign to specific seat">
                            <IconButton
                              size="small"
                              onClick={() => handleOpenMoveDialog(reservation)}
                              aria-label={`Assign ${reservation.invitationEmail} to specific seat`}
                            >
                              <EditIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Clear reservation">
                            <IconButton
                              size="small"
                              onClick={() =>
                                handleOpenDeleteDialog(
                                  reservation.invitationEmail,
                                )
                              }
                              aria-label={`Clear reservation for ${reservation.invitationEmail}`}
                            >
                              <DeleteIcon />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        )}
      </Stack>

      {/* Move/Assign Seat Dialog */}
      <Dialog
        open={moveDialogOpen}
        onClose={handleCloseMoveDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {selectedReservation?.seatId === null
            ? "Assign Seat"
            : "Move to Different Seat"}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Box>
              <Typography variant="body2" color="text.secondary">
                Attendee
              </Typography>
              <Typography variant="body1">
                {selectedReservation?.invitationHandle ||
                  selectedReservation?.invitationEmail}
              </Typography>
            </Box>

            <Box>
              <Typography variant="body2" color="text.secondary">
                Current Seat
              </Typography>
              <Typography variant="body1">
                {selectedReservation?.seatLabel
                  ? `${selectedReservation.seatLabel} (${selectedReservation.roomName})`
                  : "Unspecified Seat"}
              </Typography>
            </Box>

            <FormControl fullWidth>
              <InputLabel id="new-seat-label">New Seat</InputLabel>
              <Select
                labelId="new-seat-label"
                id="new-seat-select"
                value={newSeatId === null ? "" : newSeatId}
                label="New Seat"
                onChange={(e: SelectChangeEvent<number | string>) => {
                  const value = e.target.value;
                  setNewSeatId(value === "" ? null : Number(value));
                }}
              >
                {seatingConfig?.allowUnspecifiedSeat && (
                  <MenuItem value="">
                    <em>{seatingConfig.unspecifiedSeatLabel}</em>
                  </MenuItem>
                )}
                {rooms.flatMap((room) => {
                  const roomSeats = seats.filter((s) => s.roomId === room.id);
                  return [
                    <MenuItem key={`room-${room.id}`} disabled>
                      <strong>{room.name}</strong>
                    </MenuItem>,
                    ...roomSeats.map((seat) => (
                      <MenuItem key={seat.id} value={seat.id}>
                        &nbsp;&nbsp;{seat.label}
                      </MenuItem>
                    )),
                  ];
                })}
              </Select>
            </FormControl>

            <Alert severity="warning" icon={<WarningIcon />}>
              This will check for conflicts with existing reservations at the
              selected seat.
            </Alert>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseMoveDialog} disabled={moveInProgress}>
            Cancel
          </Button>
          <Button
            onClick={handleMoveReservation}
            variant="contained"
            disabled={
              moveInProgress || newSeatId === selectedReservation?.seatId
            }
          >
            {moveInProgress ? "Moving..." : "Confirm Move"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={handleCloseDeleteDialog}
        maxWidth="sm"
      >
        <DialogTitle>Confirm Clear Assignment</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to clear the seat assignment for{" "}
            <strong>{emailToDelete}</strong>?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            This action will remove their seat reservation. They will need to
            select a seat again if they want one.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDeleteDialog}>Cancel</Button>
          <Button
            onClick={handleClearReservation}
            variant="contained"
            color="error"
          >
            Clear Assignment
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
};

export default SeatOccupancyAdmin;
