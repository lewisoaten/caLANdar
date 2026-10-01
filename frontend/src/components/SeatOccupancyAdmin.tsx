import * as React from "react";
import { useEffect, useState, useContext, useCallback, useMemo } from "react";
import {
  Typography,
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  MenuItem,
  ListSubheader,
  FormControl,
  InputLabel,
  Select,
  SelectChangeEvent,
  Skeleton,
} from "@mui/material";
import SwapHorizSharp from "@mui/icons-material/SwapHorizSharp";
import EventSeatSharp from "@mui/icons-material/EventSeatSharp";
import DeleteSharp from "@mui/icons-material/DeleteSharp";
import { UserContext, UserDispatchContext } from "../UserProvider";
import { dateParser } from "../utils";
import { Room, Seat, EventSeatingConfig } from "../types/events";
import {
  SeatReservation,
  SeatReservationSubmit,
} from "../types/seat_reservations";
import { InvitationData } from "../types/invitations";
import { useSnackbar } from "notistack";
import {
  EmptyState,
  Panel,
  StatCell,
  StatGrid,
  Tag,
  UserAvatar,
  colors,
  fonts,
  hairline,
  srOnly,
  tint,
} from "./hl";
import {
  AttendancePips,
  ConfirmDialog,
  RowAction,
} from "./InvitationSeatManagementTable";

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

  const [rooms, setRooms] = useState<Room[]>([]);
  const [seats, setSeats] = useState<Seat[]>([]);
  const [seatingConfig, setSeatingConfig] = useState<EventSeatingConfig | null>(
    null,
  );
  const [reservations, setReservations] = useState<SeatReservation[]>([]);
  const [invitations, setInvitations] = useState<InvitationData[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

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
    reloadKey,
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
        `/api/events/${eventId}/seat-reservations/${encodeURIComponent(
          selectedReservation.invitationEmail,
        )}?as_admin=true`,
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
        `/api/events/${eventId}/seat-reservations/${encodeURIComponent(
          emailToDelete,
        )}?as_admin=true`,
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

  // Text alternative for attendance buckets.
  const getAttendanceAriaLabel = (buckets: number[]) => {
    const pattern = buckets
      .map(
        (bucket, idx) =>
          `Bucket ${idx + 1}: ${bucket === 1 ? "Attending" : "Not attending"}`,
      )
      .join(", ");
    return `Attendance pattern: ${pattern}`;
  };

  const seatName = (r: ReservationWithDetails) =>
    r.invitationHandle || r.invitationEmail;

  const retryButton = (
    <Button
      variant="outlined"
      size="small"
      onClick={() => setReloadKey((k) => k + 1)}
    >
      Retry
    </Button>
  );

  if (fetchError) {
    return (
      <Panel title="Seat assignments" kicker="Occupancy" padding="normal">
        <Box
          role="alert"
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: 1.5,
            color: colors.pinkText,
          }}
        >
          {fetchError}
          {retryButton}
        </Box>
      </Panel>
    );
  }

  if (!dataLoaded) {
    return (
      <Panel title="Seat assignments" kicker="Occupancy">
        <Box role="status" aria-label="Loading seat occupancy data">
          <Skeleton variant="rectangular" height={56} sx={{ mb: 2 }} />
          <Skeleton width="40%" />
          <Skeleton width="70%" />
        </Box>
      </Panel>
    );
  }

  if (!seatingConfig?.hasSeating) {
    return (
      <Panel title="Seat assignments" kicker="Occupancy">
        <EmptyState
          icon={<EventSeatSharp />}
          title="Seating is off"
          description="Seating is not enabled for this event. Turn on the seat map above to let attendees pick desks."
        />
      </Panel>
    );
  }

  const assigned = enrichedReservations.filter((r) => r.seatId !== null);
  const occupiedCount = seatsWithOccupancy.filter((s) => s.isOccupied).length;

  const attendeeCell = (reservation: ReservationWithDetails) => (
    <Box
      sx={{
        flex: "1 1 220px",
        minWidth: 0,
        display: "flex",
        alignItems: "center",
        gap: 1.5,
      }}
    >
      <UserAvatar
        name={seatName(reservation)}
        src={reservation.invitationAvatarUrl}
        size={36}
      />
      <Box sx={{ minWidth: 0, display: "flex", flexDirection: "column" }}>
        <Typography
          component="span"
          sx={{ fontSize: 15, fontWeight: 600, overflowWrap: "anywhere" }}
        >
          {seatName(reservation)}
        </Typography>
        {reservation.invitationHandle && (
          <Box
            component="span"
            sx={{
              fontFamily: fonts.mono,
              fontSize: 12,
              color: colors.textMuted,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {reservation.invitationEmail}
          </Box>
        )}
      </Box>
    </Box>
  );

  const rowSx = {
    listStyle: "none",
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "10px 18px",
    p: "12px 20px",
    borderBottom: `1px solid ${hairline.faint}`,
  } as const;

  const subHeading = (text: string, count?: number) => (
    <Box
      component="h3"
      sx={{
        m: 0,
        px: "20px",
        py: "12px",
        display: "flex",
        alignItems: "center",
        gap: 1,
        fontSize: 15,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        borderBottom: `1px solid ${hairline.soft}`,
      }}
    >
      {text}
      {count !== undefined && (
        <Box
          component="span"
          sx={{ fontFamily: fonts.mono, fontSize: 12, color: colors.textMuted }}
        >
          {count}
        </Box>
      )}
    </Box>
  );

  return (
    <Panel
      title="Seat assignments"
      kicker="Occupancy"
      padding="none"
      actions={
        <Box component="span" sx={{ fontSize: 13, color: colors.textMuted }}>
          Move or clear anyone&apos;s desk.
        </Box>
      }
    >
      <Box sx={{ p: "16px 20px" }}>
        <StatGrid
          columns={4}
          sx={{
            "@media (max-width: 480px)": {
              gridTemplateColumns: "repeat(2, minmax(0,1fr))",
            },
          }}
        >
          <StatCell size="lg" value={seats.length} label="Total seats" />
          <StatCell
            size="lg"
            value={occupiedCount}
            label="Occupied"
            tone="lime"
          />
          <StatCell
            size="lg"
            value={unspecifiedReservations.length}
            label="No desk"
            tone="amber"
          />
          <StatCell
            size="lg"
            value={reservations.length}
            label="Reservations"
            tone="cyan"
          />
        </StatGrid>
      </Box>

      {/* Occupancy map by room */}
      {subHeading("Occupancy map")}
      {rooms.length === 0 ? (
        <Box sx={{ p: "16px 20px", color: colors.textMuted, fontSize: 14 }}>
          No rooms configured for this event.
        </Box>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column" }}>
          {rooms.map((room) => {
            const roomSeats = seatsWithOccupancy.filter(
              (s) => s.roomId === room.id,
            );
            const taken = roomSeats.filter((s) => s.isOccupied).length;
            const full = roomSeats.length > 0 && taken === roomSeats.length;
            return (
              <Box
                key={room.id}
                sx={{
                  p: "14px 20px",
                  borderBottom: `1px solid ${hairline.faint}`,
                  display: "flex",
                  flexDirection: "column",
                  gap: 1.25,
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 1.25,
                  }}
                >
                  <Typography
                    component="h4"
                    sx={{
                      m: 0,
                      fontSize: 16,
                      fontWeight: 600,
                      flex: "1 1 auto",
                    }}
                  >
                    {room.name}
                  </Typography>
                  <Tag size="sm" tone={full ? "pink" : "neutral"}>
                    {taken}/{roomSeats.length} occupied
                  </Tag>
                </Box>
                {room.description && (
                  <Typography sx={{ fontSize: 13, color: colors.textMuted }}>
                    {room.description}
                  </Typography>
                )}
                {roomSeats.length === 0 ? (
                  <Typography sx={{ fontSize: 13, color: colors.textMuted }}>
                    No desks in this room yet.
                  </Typography>
                ) : (
                  <Box
                    component="ul"
                    aria-label={`${room.name} desks`}
                    sx={{
                      m: 0,
                      p: 0,
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "6px",
                    }}
                  >
                    {roomSeats.map((seat) => (
                      <Box
                        component="li"
                        key={seat.id}
                        title={
                          seat.isOccupied
                            ? `${seat.label} - ${seat.occupantCount} reservation(s)`
                            : `${seat.label} - Available`
                        }
                        sx={{
                          listStyle: "none",
                          minWidth: 48,
                          height: 36,
                          px: 1,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontFamily: fonts.mono,
                          fontSize: 12,
                          fontWeight: 600,
                          border: `1px solid ${
                            seat.isOccupied
                              ? colors.violetLight
                              : tint("cyan", 0.45)
                          }`,
                          backgroundColor: seat.isOccupied
                            ? tint("violet", 0.12)
                            : "transparent",
                          color: seat.isOccupied
                            ? colors.violetText
                            : colors.cyan,
                        }}
                      >
                        {seat.label}
                        <Box component="span" sx={srOnly}>
                          {seat.isOccupied
                            ? `, taken (${seat.occupantCount} reservation${seat.occupantCount === 1 ? "" : "s"})`
                            : ", free"}
                        </Box>
                      </Box>
                    ))}
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>
      )}

      {/* Seat assignment list */}
      {subHeading("Assigned desks", assigned.length)}
      {assigned.length === 0 ? (
        <Box sx={{ p: "16px 20px", color: colors.textMuted, fontSize: 14 }}>
          No seat reservations found.
        </Box>
      ) : (
        <Box component="ul" aria-label="Assigned desks" sx={{ m: 0, p: 0 }}>
          {assigned.map((reservation) => (
            <Box component="li" key={reservation.id} sx={rowSx}>
              {attendeeCell(reservation)}
              <Box
                sx={{
                  width: 150,
                  minWidth: 0,
                  fontSize: 13,
                  color: colors.textMuted,
                  overflowWrap: "anywhere",
                }}
              >
                {reservation.roomName || "—"}
              </Box>
              <Tag tone="cyan" icon={<EventSeatSharp />}>
                {reservation.seatLabel || "Unknown"}
              </Tag>
              <Box sx={{ width: 140 }}>
                <AttendancePips
                  attendance={reservation.attendanceBuckets}
                  description={getAttendanceAriaLabel(
                    reservation.attendanceBuckets,
                  )}
                />
              </Box>
              <Box sx={{ display: "flex", gap: "6px", ml: "auto" }}>
                <RowAction
                  label={`Move ${reservation.invitationEmail} to different seat`}
                  onClick={() => handleOpenMoveDialog(reservation)}
                >
                  <SwapHorizSharp />
                </RowAction>
                <RowAction
                  danger
                  label={`Clear seat assignment for ${reservation.invitationEmail}`}
                  onClick={() =>
                    handleOpenDeleteDialog(reservation.invitationEmail)
                  }
                >
                  <DeleteSharp />
                </RowAction>
              </Box>
            </Box>
          ))}
        </Box>
      )}

      {/* Unspecified seat reservations */}
      {seatingConfig.allowUnspecifiedSeat && (
        <>
          {subHeading(
            seatingConfig.unspecifiedSeatLabel || "Unspecified seat",
            unspecifiedReservations.length,
          )}
          {unspecifiedReservations.length === 0 ? (
            <Box sx={{ p: "16px 20px", color: colors.textMuted, fontSize: 14 }}>
              No unspecified seat reservations.
            </Box>
          ) : (
            <Box
              component="ul"
              aria-label="Unspecified seat attendees"
              sx={{ m: 0, p: 0 }}
            >
              {unspecifiedReservations.map((reservation) => (
                <Box component="li" key={reservation.id} sx={rowSx}>
                  {attendeeCell(reservation)}
                  <Box sx={{ width: 140 }}>
                    <AttendancePips
                      attendance={reservation.attendanceBuckets}
                      description={getAttendanceAriaLabel(
                        reservation.attendanceBuckets,
                      )}
                    />
                  </Box>
                  <Box sx={{ display: "flex", gap: "6px", ml: "auto" }}>
                    <RowAction
                      label={`Assign ${reservation.invitationEmail} to specific seat`}
                      onClick={() => handleOpenMoveDialog(reservation)}
                    >
                      <EventSeatSharp />
                    </RowAction>
                    <RowAction
                      danger
                      label={`Clear reservation for ${reservation.invitationEmail}`}
                      onClick={() =>
                        handleOpenDeleteDialog(reservation.invitationEmail)
                      }
                    >
                      <DeleteSharp />
                    </RowAction>
                  </Box>
                </Box>
              ))}
            </Box>
          )}
        </>
      )}

      {/* Move/Assign Seat Dialog */}
      <Dialog
        open={moveDialogOpen}
        onClose={handleCloseMoveDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {selectedReservation?.seatId === null
            ? "Assign seat"
            : "Move to a different seat"}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
            <StatGrid columns={2}>
              <StatCell
                value={
                  selectedReservation ? seatName(selectedReservation) : "—"
                }
                label="Attendee"
                sx={{
                  "& > span:first-of-type": {
                    fontSize: 15,
                    overflowWrap: "anywhere",
                  },
                }}
              />
              <StatCell
                value={
                  selectedReservation?.seatLabel
                    ? `${selectedReservation.seatLabel} (${selectedReservation.roomName})`
                    : "Unspecified"
                }
                label="Current seat"
                sx={{ "& > span:first-of-type": { fontSize: 15 } }}
              />
            </StatGrid>

            <FormControl fullWidth>
              <InputLabel id="new-seat-label">New seat</InputLabel>
              <Select
                labelId="new-seat-label"
                id="new-seat-select"
                value={newSeatId === null ? "" : newSeatId}
                label="New seat"
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
                    <ListSubheader
                      key={`room-${room.id}`}
                      sx={{
                        backgroundColor: colors.surfaceSolid,
                        color: colors.textMuted,
                        fontFamily: fonts.mono,
                        fontSize: 11,
                        letterSpacing: "0.14em",
                        textTransform: "uppercase",
                      }}
                    >
                      {room.name}
                    </ListSubheader>,
                    ...roomSeats.map((seat) => (
                      <MenuItem key={seat.id} value={seat.id} sx={{ pl: 3 }}>
                        {seat.label}
                      </MenuItem>
                    )),
                  ];
                })}
              </Select>
            </FormControl>

            <Typography
              sx={{
                fontSize: 13,
                color: colors.amber,
                borderLeft: `2px solid ${colors.amber}`,
                pl: 1.5,
              }}
            >
              This checks for clashes with existing reservations at the selected
              seat.
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={handleCloseMoveDialog}
            disabled={moveInProgress}
            color="inherit"
          >
            Cancel
          </Button>
          <Button
            onClick={handleMoveReservation}
            variant="contained"
            disabled={
              moveInProgress || newSeatId === selectedReservation?.seatId
            }
          >
            {moveInProgress ? "Moving…" : "Confirm move"}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={deleteDialogOpen}
        title="Clear seat assignment?"
        confirmLabel="Clear assignment"
        onCancel={handleCloseDeleteDialog}
        onConfirm={handleClearReservation}
      >
        Clear the seat assignment for <strong>{emailToDelete}</strong>? They
        will need to select a seat again if they want one.
      </ConfirmDialog>
    </Panel>
  );
};

export default SeatOccupancyAdmin;
