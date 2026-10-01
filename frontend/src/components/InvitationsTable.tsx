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
  Typography,
  Popover,
  ToggleButtonGroup,
  ToggleButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  SelectChangeEvent,
} from "@mui/material";
import EditSharp from "@mui/icons-material/EditSharp";
import PersonRemoveSharp from "@mui/icons-material/PersonRemoveSharp";
import ForwardToInboxSharp from "@mui/icons-material/ForwardToInboxSharp";
import PersonAddSharp from "@mui/icons-material/PersonAddSharp";
import GroupSharp from "@mui/icons-material/GroupSharp";
import {
  InvitationData,
  defaultInvitationsData,
  defaultInvitationData,
  RSVP,
} from "../types/invitations";
import { UserContext, UserDispatchContext } from "../UserProvider";
import { dateParser } from "../utils";
import AttendanceSelector from "./AttendanceSelector";
import { EventData, PaginatedEventsResponse } from "../types/events";
import { useSnackbar } from "notistack";
import {
  EmptyState,
  UserAvatar,
  colors,
  fonts,
  hairline,
  tint,
  tones,
} from "./hl";
import {
  ConfirmDialog,
  RowAction,
  parseEmailList,
  rsvpStatus,
} from "./InvitationSeatManagementTable";

interface InvitationsTableProps {
  event: EventData;
  as_admin: boolean;
}

export default function InvitationsTable(props: InvitationsTableProps) {
  const { signOut } = useContext(UserDispatchContext);
  const userDetails = useContext(UserContext);
  const token = userDetails?.token;
  const event_id = props.event.id;
  const [invitations, setInvitations] = useState(defaultInvitationsData);
  const { enqueueSnackbar } = useSnackbar();

  // Edit invitation state
  const [editOpen, setEditOpen] = useState(false);
  const [editingInvitation, setEditingInvitation] = useState<InvitationData>(
    defaultInvitationData,
  );
  const [editHandle, setEditHandle] = useState("");
  const [editResponse, setEditResponse] = useState<RSVP | null>(null);
  const [editAttendance, setEditAttendance] = useState<number[] | null>(null);

  // Pre-fill invitation state
  const [availableEvents, setAvailableEvents] = useState<EventData[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<number | "">(0);
  const [emailsValue, setEmailsValue] = useState<string>("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  useEffect(() => {
    if (event_id) {
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
        });
    }
  }, [event_id]);

  const handleDeleteInvitation = useCallback(
    (email: string) => () => {
      fetch(
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
      ).then((response) => {
        if (response.status === 401) signOut();
        else if (response.status === 204) {
          const remainingInvitations = invitations.filter(
            (invitation) => invitation.email !== email,
          );
          setInvitations(remainingInvitations);
          setPendingDelete(null);
          enqueueSnackbar("Invitation deleted successfully", {
            variant: "success",
          });
        } else {
          enqueueSnackbar("Unable to delete invitation", { variant: "error" });
        }
      });
    },
    [event_id, invitations, token, signOut, enqueueSnackbar],
  );

  const handleEditInvitation = useCallback(
    (email: string) => () => {
      const invitation = invitations.find((inv) => inv.email === email);
      if (invitation) {
        setEditingInvitation(invitation);
        setEditHandle(invitation.handle || "");
        setEditResponse(invitation.response);
        setEditAttendance(invitation.attendance);
        setEditOpen(true);
      }
    },
    [invitations],
  );

  // Curried so row actions can pass the email directly
  const handleResendInvitation = useCallback(
    (email: string) => () => {
      fetch(
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
      )
        .then((response) => {
          if (response.status === 401) {
            signOut();
          } else if (response.status === 204) {
            enqueueSnackbar("Invitation resent successfully", {
              variant: "success",
            });
          } else if (response.status === 400) {
            response.text().then((data) => {
              enqueueSnackbar(`Unable to resend invitation: ${data}`, {
                variant: "error",
              });
            });
          } else {
            enqueueSnackbar(
              "Unable to resend invitation. Please try again later.",
              {
                variant: "error",
              },
            );
          }
        })
        .catch((error) => {
          console.error("Network error while resending invitation:", error);
          enqueueSnackbar(
            "Network error. Please check your connection and try again.",
            {
              variant: "error",
            },
          );
        });
    },
    [event_id, token, signOut, enqueueSnackbar],
  );

  const [open, setOpen] = useState(false);

  const handleClickOpen = () => {
    setOpen(true);
    // Fetch available events when opening the dialog
    fetch(`/api/events?as_admin=true`, {
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
            .then(
              (data) => JSON.parse(data, dateParser) as PaginatedEventsResponse,
            );
      })
      .then((data) => {
        if (data && data.events) {
          // Filter out the current event
          const otherEvents = data.events.filter((evt) => evt.id !== event_id);
          setAvailableEvents(otherEvents);
        }
      })
      .catch((error) => {
        console.error("Error fetching events:", error);
        enqueueSnackbar("Failed to load events for pre-fill", {
          variant: "error",
        });
      });
  };

  const handleClose = () => {
    setOpen(false);
    // Reset pre-fill state
    setSelectedEventId(0);
    setEmailsValue("");
  };

  const handleEventSelect = (event: SelectChangeEvent<number | "">) => {
    const selectedId = event.target.value as number | "";
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
          enqueueSnackbar("Failed to load invitations for selected event", {
            variant: "error",
          });
        });
    } else {
      setEmailsValue("");
    }
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    // Prevent page reload
    event.preventDefault();

    const data = new FormData(event.currentTarget);
    const emails = data.get("emails") as string;

    const emailArr = parseEmailList(emails);

    Promise.all<Promise<InvitationData>[]>(
      emailArr.map((email) => {
        return fetch(`/api/events/${event_id}/invitations?as_admin=true`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: "Bearer " + token,
          },
          body: JSON.stringify({ email: email.trim() }),
        }).then((response) => {
          if (response.status === 201) {
            setOpen(false);
            return response
              .text()
              .then((data) => JSON.parse(data, dateParser) as InvitationData);
          } else if (response.status === 400) {
            const error = "Invalid event data.";
            alert(error);
            throw new Error(error);
          } else if (response.status === 401) {
            const error = "You are not authorized to create an event.";
            signOut();
            throw new Error(error);
          } else {
            const error =
              "Something has gone wrong, please contact the administrator.";
            alert(error);
            throw new Error(error);
          }
        });
      }),
    ).then((results) => {
      setInvitations([...invitations, ...results]);
      enqueueSnackbar("Invitations sent successfully", { variant: "success" });
    });
  };

  const handleEditClose = () => {
    setEditOpen(false);
  };

  const handleEditSave = () => {
    if (!editHandle || !editResponse) {
      enqueueSnackbar("Handle and response are required", { variant: "error" });
      return;
    }

    fetch(
      `/api/events/${event_id}/invitations/${encodeURIComponent(
        editingInvitation.email,
      )}?as_admin=true`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({
          handle: editHandle,
          response: editResponse,
          attendance: editAttendance,
        }),
      },
    )
      .then((response) => {
        if (response.status === 401) {
          signOut();
        } else if (response.status === 204) {
          enqueueSnackbar("Invitation updated successfully", {
            variant: "success",
          });
          setEditOpen(false);
          // Update the local state
          const updatedInvitations = invitations.map((inv) =>
            inv.email === editingInvitation.email
              ? {
                  ...inv,
                  handle: editHandle,
                  response: editResponse,
                  attendance: editAttendance,
                }
              : inv,
          );
          setInvitations(updatedInvitations);
        } else {
          enqueueSnackbar("Unable to update invitation", { variant: "error" });
        }
      })
      .catch((error) => {
        console.error("Network error updating invitation:", error);
        enqueueSnackbar("Network error: Unable to update invitation", {
          variant: "error",
        });
      });
  };

  const handleEditResponseChange = (
    _event: React.MouseEvent<HTMLElement>,
    newResponse: string,
  ) => {
    setEditResponse(newResponse as RSVP);
    // Clear attendance if response is "No"
    if (newResponse === RSVP.no) {
      setEditAttendance(null);
    }
  };

  const handleEditAttendanceChange = (newAttendance: number[]) => {
    setEditAttendance(newAttendance);
  };

  // State and handlers for attendance popover
  const [popoverAnchorEl, setPopoverAnchorEl] = useState<HTMLElement | null>(
    null,
  );
  const [popoverInvitation, setPopoverInvitation] = useState<InvitationData>(
    defaultInvitationData,
  );

  const handlePopoverOpen = (
    event: React.MouseEvent<HTMLElement>,
    invitation: InvitationData,
  ) => {
    if (invitation.attendance) {
      setPopoverInvitation(invitation);
      setPopoverAnchorEl(event.currentTarget);
    }
  };

  const handlePopoverClose = () => {
    setPopoverAnchorEl(null);
  };

  const popoverOpen = Boolean(popoverAnchorEl);

  const formatMomentDate = (value: moment.Moment | null) =>
    value == null ? "—" : value.calendar();

  const sorted = [...invitations].sort(
    (x, y) => moment(y.invitedAt).valueOf() - moment(x.invitedAt).valueOf(),
  );

  return (
    <React.Fragment>
      <Box
        component="section"
        aria-labelledby="invitations-heading"
        sx={{
          border: `1px solid ${hairline.panel}`,
          backgroundColor: colors.surface,
          minWidth: 0,
        }}
      >
        <Box
          sx={{
            p: "14px 20px",
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 1.5,
            borderBottom: `1px solid ${hairline.soft}`,
          }}
        >
          <Typography
            id="invitations-heading"
            component="h2"
            sx={{
              m: 0,
              flex: 1,
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            Invitations
          </Typography>
          <Button
            variant="contained"
            size="small"
            startIcon={<PersonAddSharp />}
            onClick={handleClickOpen}
          >
            Send invitations
          </Button>
        </Box>
        {sorted.length === 0 ? (
          <EmptyState
            icon={<GroupSharp />}
            title="Nobody invited yet"
            description="Send invitations by email to get the party started."
          />
        ) : (
          <Box component="ul" aria-label="Invitations" sx={{ m: 0, p: 0 }}>
            {sorted.map((row) => {
              const st = rsvpStatus(row.response);
              return (
                <Box
                  component="li"
                  key={row.email}
                  sx={{
                    listStyle: "none",
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: "10px 18px",
                    p: "12px 20px",
                    borderBottom: `1px solid ${hairline.faint}`,
                    "&:hover": { backgroundColor: tint("cyan", 0.03) },
                  }}
                >
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
                      name={row.handle || row.email}
                      src={row.avatarUrl}
                    />
                    <Box
                      sx={{
                        minWidth: 0,
                        display: "flex",
                        flexDirection: "column",
                      }}
                    >
                      <Typography
                        component="span"
                        sx={{
                          fontSize: 15,
                          fontWeight: 600,
                          color: row.handle ? colors.text : colors.textMuted,
                          overflowWrap: "anywhere",
                        }}
                      >
                        {row.handle || "No callsign yet"}
                      </Typography>
                      <Box
                        component="span"
                        title={row.email}
                        sx={{
                          fontFamily: fonts.mono,
                          fontSize: 12,
                          color: colors.textMuted,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {row.email}
                      </Box>
                    </Box>
                  </Box>
                  <Box
                    component="span"
                    sx={{
                      width: 80,
                      fontFamily: fonts.mono,
                      fontSize: 11,
                      letterSpacing: "0.12em",
                      color: tones[st.tone].fg,
                    }}
                  >
                    {st.label}
                  </Box>
                  <Box
                    sx={{
                      width: 200,
                      display: "flex",
                      flexDirection: "column",
                      fontSize: 12,
                      color: colors.textMuted,
                    }}
                  >
                    <span>Invited {formatMomentDate(row.invitedAt)}</span>
                    <span>Responded {formatMomentDate(row.respondedAt)}</span>
                  </Box>
                  <Box sx={{ width: 110 }}>
                    {row.attendance ? (
                      <Button
                        variant="text"
                        size="small"
                        onClick={(e) => handlePopoverOpen(e, row)}
                        aria-haspopup="dialog"
                        sx={{ px: 1, fontFamily: fonts.mono, fontSize: 12 }}
                      >
                        {row.attendance.filter((b) => b === 1).length}/
                        {row.attendance.length} slots
                      </Button>
                    ) : (
                      <Box
                        component="span"
                        sx={{ color: colors.textDim, fontSize: 13 }}
                      >
                        —
                      </Box>
                    )}
                  </Box>
                  <Box sx={{ display: "flex", gap: "6px", ml: "auto" }}>
                    {row.response == null && (
                      <RowAction
                        label={`Resend invite to ${row.email}`}
                        onClick={handleResendInvitation(row.email)}
                      >
                        <ForwardToInboxSharp />
                      </RowAction>
                    )}
                    <RowAction
                      label={`Edit ${row.email}`}
                      onClick={handleEditInvitation(row.email)}
                    >
                      <EditSharp />
                    </RowAction>
                    <RowAction
                      danger
                      label={`Remove ${row.email}`}
                      onClick={() => setPendingDelete(row.email)}
                    >
                      <PersonRemoveSharp />
                    </RowAction>
                  </Box>
                </Box>
              );
            })}
          </Box>
        )}
      </Box>
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Remove invitation?"
        confirmLabel="Remove"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() =>
          pendingDelete && handleDeleteInvitation(pendingDelete)()
        }
      >
        Remove <strong>{pendingDelete}</strong> from this event?
      </ConfirmDialog>
      <Popover
        open={popoverOpen}
        anchorEl={popoverAnchorEl}
        anchorOrigin={{
          vertical: "center",
          horizontal: "left",
        }}
        transformOrigin={{
          vertical: "center",
          horizontal: "right",
        }}
        onClose={handlePopoverClose}
      >
        <Box sx={{ p: 2 }}>
          <Typography sx={{ mb: 1, fontSize: 14, fontWeight: 600 }}>
            {popoverInvitation.handle || popoverInvitation.email}
          </Typography>
          <AttendanceSelector
            timeBegin={props.event.timeBegin}
            timeEnd={props.event.timeEnd}
            value={popoverInvitation.attendance}
          />
        </Box>
      </Popover>
      <Dialog open={open} onClose={handleClose}>
        <Box component="form" onSubmit={handleSubmit} sx={{ mt: 1 }}>
          <DialogTitle>Send invitations</DialogTitle>
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
              multiline
              value={emailsValue}
              onChange={(e) => setEmailsValue(e.target.value)}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={handleClose} color="inherit">
              Cancel
            </Button>
            <Button type="submit" variant="contained">
              Send
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
      <Dialog open={editOpen} onClose={handleEditClose} maxWidth="md" fullWidth>
        <DialogTitle>Edit Invitation Response</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Update the handle and RSVP response for {editingInvitation.email}
          </DialogContentText>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 3, mt: 2 }}>
            <TextField
              label="Handle"
              variant="outlined"
              fullWidth
              value={editHandle}
              onChange={(e) => setEditHandle(e.target.value)}
              required
            />
            <Box>
              <Typography variant="subtitle2" gutterBottom>
                RSVP Response
              </Typography>
              <ToggleButtonGroup
                color="primary"
                value={editResponse}
                exclusive
                onChange={handleEditResponseChange}
                aria-label="Response"
                fullWidth
              >
                <ToggleButton color="success" value="yes">
                  Yes
                </ToggleButton>
                <ToggleButton color="warning" value="maybe">
                  Maybe
                </ToggleButton>
                <ToggleButton color="error" value="no">
                  No
                </ToggleButton>
              </ToggleButtonGroup>
            </Box>
            {editResponse !== null && editResponse !== RSVP.no && (
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  Times Attending
                </Typography>
                <AttendanceSelector
                  timeBegin={props.event.timeBegin}
                  timeEnd={props.event.timeEnd}
                  value={editAttendance}
                  onChange={handleEditAttendanceChange}
                />
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleEditClose} color="inherit">
            Cancel
          </Button>
          <Button onClick={handleEditSave} variant="contained">
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </React.Fragment>
  );
}
