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
} from "@mui/material";
import {
  InvitationData,
  defaultInvitationsData,
  defaultInvitationData,
} from "../types/invitations";
import { UserContext, UserDispatchContext } from "../UserProvider";
import { dateParser } from "../utils";
import AttendanceSelector from "./AttendanceSelector";
import { EventData } from "../types/events";

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
                <Button
                  onClick={(e) => onClick(e)}
                  value={invitation.email}
                  variant="contained"
                  color="error"
                >
                  Remove
                </Button>
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
    </React.Fragment>
  );
}
