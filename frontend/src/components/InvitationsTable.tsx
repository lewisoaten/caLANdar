import * as React from "react";
import { useEffect, useState, useContext } from "react";
import {
  Box,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Button,
  Stack,
  Typography,
  Popover,
  ToggleButtonGroup,
  ToggleButton,
} from "@mui/material";
import {
  InvitationData,
  defaultInvitationsData,
  defaultInvitationData,
  RSVP,
} from "../types/invitations";
import { UserContext, UserDispatchContext } from "../UserProvider";
import { dateParser } from "../utils";
import AttendanceSelector from "./AttendanceSelector";
import { EventData } from "../types/events";
import { useSnackbar } from "notistack";

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

  const onClick = (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
    const email = event?.currentTarget.value;
    fetch(
      `/api/events/${event_id}/invitations/${encodeURIComponent(email)}?as_admin=true`,
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
        const remainingInvitations = invitations.filter(function (invitation) {
          return invitation.email !== email;
        });
        setInvitations(remainingInvitations);
      } else {
        alert("Unable to delete invitation");
        throw new Error("Unable to delete invitation");
      }
    });
  };

  const onResendClick = (
    event: React.MouseEvent<HTMLButtonElement, MouseEvent>,
  ) => {
    const email = event?.currentTarget.value;
    fetch(
      `/api/events/${event_id}/invitations/${encodeURIComponent(email)}/resend?as_admin=true`,
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
          alert("Invitation resent successfully");
        } else if (response.status === 400) {
          response.text().then((data) => {
            alert(`Unable to resend invitation: ${data}`);
          });
        } else {
          alert("Unable to resend invitation. Please try again later.");
        }
      })
      .catch((error) => {
        console.error("Network error while resending invitation:", error);
        alert("Network error. Please check your connection and try again.");
      });
  };

  const [open, setOpen] = useState(false);

  const handleClickOpen = () => {
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    // Prevent page reload
    event.preventDefault();

    const data = new FormData(event.currentTarget);
    const emails = data.get("emails") as string;

    const emailArr = emails.split(",");

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
    });
  };

  const handleEditClick = (invitation: InvitationData) => {
    setEditingInvitation(invitation);
    setEditHandle(invitation.handle || "");
    setEditResponse(invitation.response);
    setEditAttendance(invitation.attendance);
    setEditOpen(true);
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
      `/api/events/${event_id}/invitations/${encodeURIComponent(editingInvitation.email)}?as_admin=true`,
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

  const [popoverAnchorEl, setPopoverAnchorEl] = useState<HTMLElement | null>(
    null,
  );

  const [popoverInvitation, setPopoverInvitation] = useState<InvitationData>(
    defaultInvitationData,
  );

  const handlePopoverOpen = (event: React.MouseEvent<HTMLElement>) => {
    if (!popoverOpen) {
      const email = event?.currentTarget.id.replace("attendance-", "");
      const invitation = invitations.find(
        (x) => x.email.toLowerCase() === email.toLowerCase(),
      );
      if (invitation && invitation.attendance) {
        setPopoverInvitation(invitation);
        setPopoverAnchorEl(event.currentTarget);
      }
    }
  };

  const handlePopoverClose = () => {
    setPopoverAnchorEl(null);
  };

  const popoverOpen = Boolean(popoverAnchorEl);

  return (
    <React.Fragment>
      <Typography component="h2" variant="h6" color="primary" gutterBottom>
        Invitations
      </Typography>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Email</TableCell>
            <TableCell>Handle</TableCell>
            <TableCell>Invitation Sent</TableCell>
            <TableCell>Response</TableCell>
            <TableCell>Response Sent</TableCell>
            <TableCell>Attendance</TableCell>
            <TableCell>Last Modified</TableCell>
            <TableCell>Action</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {invitations.map((invitation) => (
            <TableRow key={invitation.email}>
              <TableCell>{invitation.email}</TableCell>
              <TableCell>{invitation.handle}</TableCell>
              <TableCell>{invitation.invitedAt.calendar()}</TableCell>
              <TableCell>{invitation.response}</TableCell>
              <TableCell>{invitation.respondedAt?.calendar()}</TableCell>
              <TableCell
                id={"attendance-" + invitation.email}
                onMouseEnter={handlePopoverOpen}
                onClick={handlePopoverOpen}
                onMouseLeave={handlePopoverClose}
              >
                {invitation.attendance}
              </TableCell>
              <TableCell>{invitation.lastModified.calendar()}</TableCell>
              <TableCell>
                <Stack direction="row" spacing={1}>
                  {invitation.response === null && (
                    <Button
                      onClick={(e) => onResendClick(e)}
                      value={invitation.email}
                      variant="contained"
                      color="primary"
                    >
                      Resend Invite
                    </Button>
                  )}
                  <Button
                    onClick={() => handleEditClick(invitation)}
                    variant="contained"
                    color="primary"
                  >
                    Edit
                  </Button>
                  <Button
                    onClick={(e) => onClick(e)}
                    value={invitation.email}
                    variant="contained"
                    color="error"
                  >
                    Remove
                  </Button>
                </Stack>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Popover
        sx={{
          pointerEvents: "none",
        }}
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
        disableRestoreFocus
      >
        <AttendanceSelector
          timeBegin={props.event.timeBegin}
          timeEnd={props.event.timeEnd}
          value={popoverInvitation.attendance}
        />
      </Popover>
      <Stack direction="row" spacing={2}>
        <Button variant="outlined" onClick={handleClickOpen}>
          Send Inviations
        </Button>
      </Stack>
      <Dialog open={open} onClose={handleClose}>
        <Box component="form" onSubmit={handleSubmit} sx={{ mt: 1 }}>
          <DialogTitle>Send Inviations</DialogTitle>
          <DialogContent>
            <DialogContentText>
              Invite gamers here! Just specify their email addresses separated
              by commas.
            </DialogContentText>

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
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={handleClose}>Cancel</Button>
            <Button type="submit">Create</Button>
          </DialogActions>
        </Box>
      </Dialog>
      <Dialog open={editOpen} onClose={handleEditClose} maxWidth="md" fullWidth>
        <DialogTitle>Edit Invitation Response</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Update the handle and RSVP response for {editingInvitation.email}
          </DialogContentText>
          <Stack spacing={3} sx={{ mt: 2 }}>
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
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleEditClose}>Cancel</Button>
          <Button onClick={handleEditSave} variant="contained">
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </React.Fragment>
  );
}
