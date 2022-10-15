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
} from "@mui/material";
import { InvitationData, defaultInvitationsData } from "../types/invitations";
import { UserContext } from "../UserProvider";
import { dateParser } from "../utils";

interface InvitationsTableProps {
  event_id: number;
}

export default function InvitationsTable(props: InvitationsTableProps) {
  const userDetails = useContext(UserContext);
  const token = userDetails?.token;
  const event_id = props.event_id;
  const [invitations, setInvitations] = useState(defaultInvitationsData);

  useEffect(() => {
    if (event_id) {
      fetch(
        `${process.env.REACT_APP_API_PROXY}/api/events/${event_id}/invitations`,
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + token,
          },
        },
      )
        .then((response) => {
          return response
            .text()
            .then((data) => JSON.parse(data, dateParser) as InvitationData[]);
        })
        .then((data) => {
          setInvitations(data);
        });
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event_id]);

  const onClick = (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
    const email = event?.currentTarget.value;
    fetch(
      `${process.env.REACT_APP_API_PROXY}/api/events/${event_id}/invitations/${email}`,
      {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
      },
    ).then((response) => {
      if (response.status === 204) {
        var remainingInvitations = invitations.filter(function (invitation) {
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

    var emailArr = emails.split(",");

    Promise.all<Promise<InvitationData>[]>(
      emailArr.map((email) => {
        return fetch(
          `${process.env.REACT_APP_API_PROXY}/api/events/${event_id}/invitations`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer " + token,
            },
            body: JSON.stringify({ email: email }),
          },
        ).then((response) => {
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
            alert(error);
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
              <TableCell>{invitation.attendance}</TableCell>
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
