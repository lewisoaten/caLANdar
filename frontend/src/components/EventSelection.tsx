import * as React from "react";
import { useState } from "react";
import {
  Container,
  Grid,
  Paper,
  Card,
  CardMedia,
  CardContent,
  Typography,
  CardActions,
  Button,
} from "@mui/material";
import { Link } from "react-router-dom";
import { EventData } from "../types/events";
import EventTable from "./EventTable";

const Event = () => {
  const eventsState = useState([] as EventData[]);
  const [events, setEvents] = eventsState;

  return (
    <React.Fragment>
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Card>
              <CardMedia
                component="img"
                height="140"
                image="/static/lan_party_image.jpg"
                alt="lan party image"
              />
              <CardContent>
                <Typography gutterBottom variant="h5" component="div">
                  {
                    events.sort(
                      (a, b) => a.timeBegin.unix() - b.timeBegin.unix(),
                    )[0]?.title
                  }
                </Typography>
                <Typography variant="subtitle1" gutterBottom>
                  {events
                    .sort((a, b) => a.timeBegin.unix() - b.timeBegin.unix())[0]
                    ?.timeBegin.calendar()}{" "}
                  to{" "}
                  {events
                    .sort((a, b) => a.timeBegin.unix() - b.timeBegin.unix())[0]
                    ?.timeEnd.calendar()}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {
                    events.sort(
                      (a, b) => a.timeBegin.unix() - b.timeBegin.unix(),
                    )[0]?.description
                  }
                </Typography>
              </CardContent>
              <CardActions>
                <Button
                  size="small"
                  component={Link}
                  to={events
                    .sort((a, b) => a.timeBegin.unix() - b.timeBegin.unix())[0]
                    ?.id.toString()}
                >
                  Open
                </Button>
              </CardActions>
            </Card>
          </Grid>
        </Grid>
      </Container>
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Grid container spacing={3}>
          {/* Events */}
          <Grid item xs={12}>
            <Paper sx={{ p: 2, display: "flex", flexDirection: "column" }}>
              <EventTable eventsState={eventsState} />
            </Paper>
          </Grid>
        </Grid>
      </Container>
    </React.Fragment>
  );
};

export default Event;
