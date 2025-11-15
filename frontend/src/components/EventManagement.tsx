import * as React from "react";
import { useEffect, useState, useContext } from "react";
import {
  Container,
  Button,
  Paper,
  Stack,
  Typography,
  Grid,
} from "@mui/material";
import { useParams, useNavigate } from "react-router-dom";
import { UserContext, UserDispatchContext } from "../UserProvider";
import { dateParser } from "../utils";
import { EventData, defaultEventData } from "../types/events";
import InvitationsTable from "./InvitationsTable";
import EventsAdminDialog from "./EventsAdminDialog";
import SendEmailDialog from "./SendEmailDialog";
import EventSeatingConfig from "./EventSeatingConfig";

const EventManagement = () => {
  const { signOut } = useContext(UserDispatchContext);
  const userDetails = useContext(UserContext);
  const token = userDetails?.token;
  const [event, setEvent] = useState(defaultEventData);
  const [open, setOpen] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);

  const handleClose = (value?: EventData) => {
    setOpen(false);

    // If value is set, then refresh event with details
    if (value) {
      updateEvent();
    }
  };

  const navigate = useNavigate();

  const { id } = useParams();

  const updateEvent = () => {
    fetch(`/api/events/${id}?as_admin=true`, {
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
            .then((data) => JSON.parse(data, dateParser) as EventData);
      })
      .then((data) => {
        if (data) setEvent(data);
      });
  };

  useEffect(() => {
    updateEvent();
  }, []);

  const editOnClick = () => {
    setOpen(true);
  };

  const deleteOnClick = () => {
    fetch(`/api/events/${id}?as_admin=true`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: "Bearer " + token,
      },
    }).then((response) => {
      if (response.status === 401) signOut();
      else if (response.status === 204) {
        navigate("..");
      } else {
        alert("Unable to delete event");
        throw new Error("Unable to delete event");
      }
    });
  };

  const handleEmailDialogOpen = () => {
    setEmailDialogOpen(true);
  };

  const handleEmailDialogClose = () => {
    setEmailDialogOpen(false);
  };

  return (
    <React.Fragment>
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 12, lg: 12 }}>
            <Paper
              sx={{
                p: 2,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
                <Button onClick={editOnClick} variant="contained">
                  Edit
                </Button>
                <Button
                  onClick={handleEmailDialogOpen}
                  variant="contained"
                  color="secondary"
                >
                  Send Email
                </Button>
                <Button
                  onClick={deleteOnClick}
                  variant="contained"
                  color="error"
                >
                  Delete
                </Button>
              </Stack>
              <Typography
                component="h2"
                variant="h6"
                color="primary"
                gutterBottom
              >
                {event.title}
              </Typography>
              <Typography
                variant="body1"
                gutterBottom
                sx={{ whiteSpace: "pre-wrap" }}
              >
                {event.description}
              </Typography>
            </Paper>
          </Grid>
        </Grid>
      </Container>
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 12, lg: 12 }}>
            <EventSeatingConfig eventId={event.id} />
          </Grid>
        </Grid>
      </Container>
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 12, lg: 12 }}>
            <Paper
              sx={{
                p: 2,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <InvitationsTable event={event} as_admin={true} />
            </Paper>
          </Grid>
        </Grid>
      </Container>
      <EventsAdminDialog open={open} event={event} onClose={handleClose} />
      <SendEmailDialog
        open={emailDialogOpen}
        onClose={handleEmailDialogClose}
        event={event}
      />
    </React.Fragment>
  );
};

export default EventManagement;
