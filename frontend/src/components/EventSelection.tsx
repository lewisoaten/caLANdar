import * as React from "react";
import { useEffect, useContext, useState } from "react";
import {
  Box,
  Container,
  FormControl,
  FormControlLabel,
  Switch,
  Typography,
  Grid,
} from "@mui/material";
import { dateParser } from "../utils";
import { UserContext, UserDispatchContext } from "../UserProvider";
import { EventData } from "../types/events";
import EventCard from "./EventCard";
import moment from "moment";

const Event = () => {
  const { signOut } = useContext(UserDispatchContext);
  const userDetails = useContext(UserContext);
  const token = userDetails?.token;

  const [events, setEvents] = useState([] as EventData[]);

  const [showOldEvents, setShowOldEvents] = React.useState(false);

  const handleShowOldEvents = (event: React.ChangeEvent<HTMLInputElement>) => {
    setShowOldEvents(event.target.checked);
  };

  useEffect(() => {
    fetch(`/api/events`, {
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
            .then((data) => JSON.parse(data, dateParser) as Array<EventData>);
      })
      .then((data) => {
        if (!data) {
          return [] as EventData[];
        }

        data.sort((a, b) => b.timeBegin.unix() - a.timeBegin.unix());

        setEvents(data);
      });
  }, []);

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Grid
        container
        spacing={{ xs: 2, md: 3 }}
        columns={{ sm: 4, md: 8, lg: 12 }}
      >
        <Grid sx={{ gridColumn: { sm: 'span 4', md: 'span 8', lg: 'span 12' } }}>
          <Box display="flex" justifyContent="flex-end">
            <FormControl>
              <FormControlLabel
                control={
                  <Switch
                    checked={showOldEvents}
                    onChange={handleShowOldEvents}
                  />
                }
                label={
                  <Typography color="text.secondary">
                    Show Old Events
                  </Typography>
                }
                labelPlacement="start"
              />
            </FormControl>
          </Box>
        </Grid>
        {events.map((event) => {
          if (event.timeEnd.isAfter(moment()) || showOldEvents) {
            return (
              <Grid sx={{ gridColumn: 'span 4' }} key={event.id}>
                <EventCard event={event} />
              </Grid>
            );
          } else {
            return null;
          }
        })}
      </Grid>
    </Container>
  );
};

export default Event;
