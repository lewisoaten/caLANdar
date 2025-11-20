import * as React from "react";
import { useEffect, useState, useContext, useCallback } from "react";
import moment from "moment";
import {
  Box,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  TextField,
  Button,
  Stack,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Avatar,
  Chip,
  Tooltip,
  IconButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  SelectChangeEvent,
  useTheme,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import PersonIcon from "@mui/icons-material/Person";
import EventSeatIcon from "@mui/icons-material/EventSeat";
import SendIcon from "@mui/icons-material/Send";
import { InvitationData, RSVP } from "../types/invitations";
import { SeatReservation } from "../types/seat_reservations";
import { EventData, Room, Seat } from "../types/events";
import { UserContext, UserDispatchContext } from "../UserProvider";
import { dateParser } from "../utils";
import { getAttendanceDescription } from "../utils/attendanceDescription";
import { useSnackbar } from "notistack";
import RSVPWizard from "./RSVPWizard/RSVPWizard";

interface InvitationSeatManagementTableProps {
  event: EventData;
  as_admin: boolean;
}

interface CombinedAttendeeData {
  email: string;
  avatarUrl: string | null;
  handle: string | null;
  invitedAt: moment.Moment;
  respondedAt: moment.Moment | null;
  response: RSVP | null;
  attendance: number[] | null;
  lastModified: moment.Moment;
  seatId: number | null;
  reservationId: number | null;
  reservationLastModified: moment.Moment | null;
}

export default function InvitationSeatManagementTable(
  props: InvitationSeatManagementTableProps,
) {
  const { signOut } = useContext(UserDispatchContext);
  const userDetails = useContext(UserContext);
  const token = userDetails?.token;
  const event_id = props.event.id;
  const { enqueueSnackbar } = useSnackbar();
  const theme = useTheme();

  const [invitations, setInvitations] = useState<InvitationData[]>([]);
  const [reservations, setReservations] = useState<SeatReservation[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [seats, setSeats] = useState<Seat[]>([]);
  const [loading, setLoading] = useState(true);

  // RSVP Wizard state
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editingInvitation, setEditingInvitation] = useState<
    InvitationData | undefined
  >(undefined);

  // Send invitations dialog state
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [emailsValue, setEmailsValue] = useState<string>("");
  const [availableEvents, setAvailableEvents] = useState<EventData[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<number | "">(0);

  // Fetch all data
  const fetchData = useCallback(() => {
    if (!event_id || !token) return;

    setLoading(true);

    Promise.all([
      // Fetch invitations
      fetch(`/api/events/${event_id}/invitations?as_admin=${props.as_admin}`, {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: "Bearer " + token,
        },
      })
        .then((response) => {
          if (response.status === 401) signOut();
          else
            return response
              .text()
              .then((data) => JSON.parse(data, dateParser) as InvitationData[]);
        })
        .then((data) => {
          if (data) setInvitations(data);
        }),

      // Fetch seat reservations
      fetch(`/api/events/${event_id}/seat-reservations?as_admin=true`, {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: "Bearer " + token,
        },
      })
        .then((response) => {
          if (response.status === 401) signOut();
          else
            return response
              .text()
              .then(
                (data) => JSON.parse(data, dateParser) as SeatReservation[],
              );
        })
        .then((data) => {
          if (data) setReservations(data);
        }),

      // Fetch rooms
      fetch(`/api/events/${event_id}/rooms?as_admin=true`, {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: "Bearer " + token,
        },
      })
        .then((response) => {
          if (response.status === 401) signOut();
          else return response.json() as Promise<Room[]>;
        })
        .then((data) => {
          if (data) setRooms(data);
        }),

      // Fetch seats
      fetch(`/api/events/${event_id}/seats?as_admin=true`, {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: "Bearer " + token,
        },
      })
        .then((response) => {
          if (response.status === 401) signOut();
          else return response.json() as Promise<Seat[]>;
        })
        .then((data) => {
          if (data) setSeats(data);
        }),
    ]).finally(() => {
      setLoading(false);
    });
  }, [event_id, token, props.as_admin, signOut]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Fetch available events for pre-fill
  useEffect(() => {
    if (!token) return;

    fetch("/api/events?as_admin=true", {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: "Bearer " + token,
      },
    })
      .then((response) => {
        if (response.status === 401) signOut();
        else
          return response
            .text()
            .then((data) => JSON.parse(data, dateParser) as EventData[]);
      })
      .then((data) => {
        if (data) {
          setAvailableEvents(data.filter((e) => e.id !== event_id));
        }
      });
  }, [token, event_id, signOut]);

  // Combine invitations and reservations
  const combinedData: CombinedAttendeeData[] = invitations.map((inv) => {
    const reservation = reservations.find(
      (r) => r.invitationEmail.toLowerCase() === inv.email.toLowerCase(),
    );
    return {
      email: inv.email,
      avatarUrl: inv.avatarUrl,
      handle: inv.handle,
      invitedAt: inv.invitedAt,
      respondedAt: inv.respondedAt,
      response: inv.response,
      attendance: inv.attendance,
      lastModified: inv.lastModified,
      seatId: reservation?.seatId || null,
      reservationId: reservation?.id || null,
      reservationLastModified: reservation?.lastModified || null,
    };
  });

  // Get seat label for a seat ID
  const getSeatLabel = (seatId: number | null): string => {
    if (!seatId) return "No seat";
    const seat = seats.find((s) => s.id === seatId);
    if (!seat) return "Unknown seat";
    const room = rooms.find((r) => r.id === seat.roomId);
    return room ? `${room.name} - ${seat.label}` : seat.label;
  };

  // Handle edit - open wizard
  const handleEdit = (attendee: CombinedAttendeeData) => {
    const invitation: InvitationData = {
      eventId: event_id,
      email: attendee.email,
      avatarUrl: attendee.avatarUrl,
      handle: attendee.handle,
      invitedAt: attendee.invitedAt,
      respondedAt: attendee.respondedAt,
      response: attendee.response,
      attendance: attendee.attendance,
      lastModified: attendee.lastModified,
    };
    setEditingInvitation(invitation);
    setWizardOpen(true);
  };

  const handleWizardClose = () => {
    setWizardOpen(false);
    setEditingInvitation(undefined);
  };

  const handleWizardSaved = () => {
    fetchData(); // Refresh the data
  };

  // Handle delete invitation
  const handleDeleteInvitation = async (email: string) => {
    if (
      !confirm(`Are you sure you want to delete the invitation for ${email}?`)
    )
      return;

    try {
      const response = await fetch(
        `/api/events/${event_id}/invitations/${encodeURIComponent(
          email,
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
      } else if (response.status === 204) {
        enqueueSnackbar("Invitation deleted successfully", {
          variant: "success",
        });
        fetchData();
      } else {
        enqueueSnackbar("Unable to delete invitation", { variant: "error" });
      }
    } catch (error) {
      console.error("Error deleting:", error);
      enqueueSnackbar("Network error", { variant: "error" });
    }
  };

  // Handle resend invitation
  const handleResendInvitation = async (email: string) => {
    try {
      const response = await fetch(
        `/api/events/${event_id}/invitations/${encodeURIComponent(
          email,
        )}/resend?as_admin=true`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: "Bearer " + token,
          },
        },
      );

      if (response.status === 401) {
        signOut();
      } else if (response.status === 204) {
        enqueueSnackbar("Invitation resent successfully", {
          variant: "success",
        });
      } else {
        const text = await response.text();
        enqueueSnackbar(text || "Unable to resend invitation", {
          variant: "error",
        });
      }
    } catch (error) {
      console.error("Error resending:", error);
      enqueueSnackbar("Network error", { variant: "error" });
    }
  };

  // Render attendance pips
  const renderAttendancePips = (
    attendance: number[] | null,
    response: RSVP | null,
  ) => {
    if (!attendance || attendance.length === 0 || response === RSVP.no)
      return null;

    const description = getAttendanceDescription(
      attendance,
      props.event.timeBegin,
      props.event.timeEnd,
    );

    const pipColor =
      response === RSVP.yes
        ? theme.palette.success.main // Green for Yes
        : response === RSVP.maybe
          ? theme.palette.warning.main // Orange for Maybe
          : theme.palette.success.main;

    return (
      <Tooltip title={description} enterDelay={200} arrow>
        <Box
          sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}
          role="img"
          aria-label={description}
        >
          {attendance.map((bucket, index) => (
            <Box
              key={index}
              sx={{
                width: 8,
                height: 8,
                backgroundColor:
                  bucket === 1
                    ? pipColor
                    : theme.palette.action.disabledBackground,
                border: `1px solid ${theme.palette.divider}`,
                borderRadius: "50%",
              }}
            />
          ))}
        </Box>
      </Tooltip>
    );
  };

  // Send invitations handlers
  const handleSendDialogOpen = () => {
    setSendDialogOpen(true);
  };

  const handleSendDialogClose = () => {
    setSendDialogOpen(false);
    setEmailsValue("");
    setSelectedEventId(0);
  };

  const handleEventSelect = (event: SelectChangeEvent<number | "">) => {
    const selectedId = event.target.value as number;
    setSelectedEventId(selectedId);

    if (selectedId && selectedId !== 0) {
      // Fetch invitations for the selected event
      fetch(`/api/events/${selectedId}/invitations?as_admin=true`, {
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
              .then((data) => JSON.parse(data, dateParser) as InvitationData[]);
        })
        .then((data) => {
          if (data) {
            // Extract emails and populate the text field
            const emails = data.map((inv) => inv.email).join(", ");
            setEmailsValue(emails);
          }
        })
        .catch((error) => {
          console.error("Error fetching invitations:", error);
        });
    }
  };

  const handleSendInvitations = async (e: React.FormEvent) => {
    e.preventDefault();

    const emails = emailsValue
      .split(",")
      .map((email) => email.trim())
      .filter((email) => email.length > 0);

    if (emails.length === 0) {
      enqueueSnackbar("Please enter at least one email", { variant: "error" });
      return;
    }

    try {
      await Promise.all(
        emails.map(async (email) => {
          const response = await fetch(
            `/api/events/${event_id}/invitations?as_admin=true`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                Authorization: "Bearer " + token,
              },
              body: JSON.stringify({ email }),
            },
          );

          if (response.status === 401) {
            signOut();
            throw new Error("Unauthorized");
          } else if (response.ok) {
            return response
              .text()
              .then((data) => JSON.parse(data, dateParser) as InvitationData);
          } else if (response.status === 400) {
            const error = "Invalid event data.";
            throw new Error(error);
          } else {
            throw new Error("Failed to send invitation");
          }
        }),
      );

      enqueueSnackbar("Invitations sent successfully", { variant: "success" });
      handleSendDialogClose();
      fetchData();
    } catch (error) {
      console.error("Error sending invitations:", error);
      enqueueSnackbar("Failed to send some invitations", { variant: "error" });
    }
  };

  if (loading) {
    return (
      <Box sx={{ p: 2, textAlign: "center" }}>
        <Typography>Loading...</Typography>
      </Box>
    );
  }

  return (
    <React.Fragment>
      <Typography variant="h6" gutterBottom>
        Invitations & Seat Assignments
      </Typography>
      <TableContainer component={Paper} variant="outlined">
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Attendee</TableCell>
              <TableCell>Handle</TableCell>
              <TableCell>RSVP</TableCell>
              <TableCell>Attendance</TableCell>
              <TableCell>Seat</TableCell>
              <TableCell>Timestamps</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {combinedData.map((attendee) => (
              <TableRow key={attendee.email} hover>
                <TableCell>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Avatar
                      src={
                        attendee.avatarUrl ||
                        "https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y"
                      }
                      alt={attendee.email}
                      sx={{ width: 32, height: 32 }}
                    >
                      <PersonIcon />
                    </Avatar>
                    <Tooltip title={attendee.email} enterDelay={500}>
                      <Typography variant="body2" noWrap>
                        {attendee.email}
                      </Typography>
                    </Tooltip>
                  </Box>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">
                    {attendee.handle || "-"}
                  </Typography>
                </TableCell>
                <TableCell>
                  {attendee.response ? (
                    <Chip
                      label={attendee.response}
                      size="small"
                      color={
                        attendee.response === RSVP.yes
                          ? "success"
                          : attendee.response === RSVP.maybe
                            ? "warning"
                            : "error"
                      }
                      sx={{ height: 20, fontSize: "0.7rem" }}
                    />
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      No response
                    </Typography>
                  )}
                </TableCell>
                <TableCell>
                  {renderAttendancePips(attendee.attendance, attendee.response)}
                </TableCell>
                <TableCell>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                    {attendee.seatId && <EventSeatIcon fontSize="small" />}
                    <Typography variant="body2">
                      {getSeatLabel(attendee.seatId)}
                    </Typography>
                  </Box>
                </TableCell>
                <TableCell>
                  <Tooltip
                    title={
                      <Box>
                        <Typography variant="caption" display="block">
                          Invited: {attendee.invitedAt.calendar()}
                        </Typography>
                        {attendee.respondedAt && (
                          <Typography variant="caption" display="block">
                            Responded: {attendee.respondedAt.calendar()}
                          </Typography>
                        )}
                        <Typography variant="caption" display="block">
                          Last Modified: {attendee.lastModified.calendar()}
                        </Typography>
                        {attendee.reservationLastModified && (
                          <Typography variant="caption" display="block">
                            Seat Modified:{" "}
                            {attendee.reservationLastModified.calendar()}
                          </Typography>
                        )}
                      </Box>
                    }
                    arrow
                  >
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ cursor: "help" }}
                    >
                      {attendee.lastModified.fromNow()}
                    </Typography>
                  </Tooltip>
                </TableCell>
                <TableCell align="right">
                  <Stack
                    direction="row"
                    spacing={0.5}
                    justifyContent="flex-end"
                  >
                    {!attendee.response && (
                      <Tooltip title="Resend invitation">
                        <IconButton
                          size="small"
                          onClick={() => handleResendInvitation(attendee.email)}
                        >
                          <SendIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                    <Tooltip title="Edit">
                      <IconButton
                        size="small"
                        onClick={() => handleEdit(attendee)}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton
                        size="small"
                        onClick={() => handleDeleteInvitation(attendee.email)}
                        color="error"
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
        <Button variant="outlined" onClick={handleSendDialogOpen}>
          Send Invitations
        </Button>
      </Stack>

      {/* Send Invitations Dialog */}
      <Dialog
        open={sendDialogOpen}
        onClose={handleSendDialogClose}
        maxWidth="sm"
        fullWidth
      >
        <Box component="form" onSubmit={handleSendInvitations}>
          <DialogTitle>Send Invitations</DialogTitle>
          <DialogContent>
            <DialogContentText>
              Invite gamers here! Just specify their email addresses separated
              by commas.
            </DialogContentText>

            <FormControl fullWidth margin="dense">
              <InputLabel id="event-select-label">
                Pre-fill from another event (optional)
              </InputLabel>
              <Select
                labelId="event-select-label"
                id="event-select"
                value={selectedEventId}
                label="Pre-fill from another event (optional)"
                onChange={handleEventSelect}
              >
                <MenuItem value={0}>
                  <em>None</em>
                </MenuItem>
                {availableEvents.map((evt) => (
                  <MenuItem key={evt.id} value={evt.id}>
                    {evt.title} ({evt.timeBegin.format("MMM D, YYYY")})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              id="emails"
              name="emails"
              label="Emails"
              type="text"
              autoFocus
              required
              margin="dense"
              fullWidth
              variant="outlined"
              value={emailsValue}
              onChange={(e) => setEmailsValue(e.target.value)}
              helperText="Separate multiple emails with commas"
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={handleSendDialogClose}>Cancel</Button>
            <Button type="submit" variant="contained">
              Send
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      {/* RSVP Wizard for editing */}
      <RSVPWizard
        open={wizardOpen}
        onClose={handleWizardClose}
        event={props.event}
        initialData={editingInvitation}
        onSaved={handleWizardSaved}
        asAdmin={true}
      />
    </React.Fragment>
  );
}
