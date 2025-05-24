import * as React from "react";
import moment from "moment";
import { useEffect, useState, useContext } from "react";
import { Container, Paper, Typography } from "@mui/material";
import Grid from "@mui/material/Grid";
import { UserContext, UserDispatchContext } from "../UserProvider";
import { useParams } from "react-router-dom";
import { dateParser } from "../utils";
import { EventData, defaultEventData } from "../types/events";
import InvitationResponse from "./InvitationResponse";
import EventGameSuggestions from "./EventGameSuggestions";
import EventAttendeeList from "./EventAttendeeList";

const Event = () => {
  const { signOut } = useContext(UserDispatchContext);
  const userDetails = useContext(UserContext);
  const token = userDetails?.token;
  const [event, setEvent] = useState(defaultEventData);
  const [loaded, setLoaded] = useState(false);
  const [responded, setResponded] = useState(false);

  const { id } = useParams();

  useEffect(() => {
    fetch(`/api/events/${id}`, {
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
        if (data) {
          setEvent(data);
          setLoaded(true);
        }
      });
  }, []);

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Grid container spacing={3}>
        <Grid xs={12} md={12} lg={12}>
          <Paper
            sx={{
              p: 2,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <Grid container spacing={2}>
              <Grid xs={6}>
                <Typography
                  component="h2"
                  variant="h4"
                  color="primary"
                  gutterBottom
                >
                  {event.title}
                </Typography>
              </Grid>
              <Grid xs={6}>
                <Paper variant="outlined">
                  <Typography
                    component="h3"
                    variant="h6"
                    display="block"
                    align="center"
                    color="primary"
                    gutterBottom
                  >
                    Gaming {event.timeBegin.fromNow()}!
                  </Typography>
                </Paper>
              </Grid>
              <Grid xs={12}>
                <Typography
                  variant="body1"
                  gutterBottom
                  sx={{ whiteSpace: "pre-wrap" }}
                >
                  {event.description}
                </Typography>
              </Grid>
              <Grid xs={12}>
                {loaded && (
                  <InvitationResponse
                    event={event}
                    setResponded={setResponded}
                    disabled={event.timeEnd.isSameOrBefore(moment())}
                  />
                )}
              </Grid>
            </Grid>
          </Paper>
        </Grid>
        <Grid xs={12} md={6} lg={6}>
          <Paper
            sx={{
              p: 2,
              display: "flex",
              flexDirection: "column",
            }}
          >
            {loaded && (
              <EventAttendeeList event_id={event.id} responded={responded} />
            )}
          </Paper>
        </Grid>
        <Grid xs={12} md={6} lg={6}>
          <Paper
            sx={{
              p: 2,
              display: "flex",
              flexDirection: "column",
            }}
          >
            {loaded && (
              <EventGameSuggestions
                event_id={event.id}
                responded={responded}
                disabled={event.timeEnd.isSameOrBefore(moment())}
              />
            )}
          </Paper>
        </Grid>
      </Grid>
    </Container>
  );
};

export default Event;
