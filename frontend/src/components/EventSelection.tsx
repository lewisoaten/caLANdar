import * as React from "react";
import { useEffect, useContext, useState } from "react";
import {
  Box,
  Container,
  FormControl,
  FormControlLabel,
  Grid,
  Switch,
  Typography,
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
    fetch(`${process.env.REACT_APP_API_PROXY}/api/events`, {
      headers: {
        "Content-Type": "application/json",
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

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Grid
        container
        spacing={{ xs: 2, md: 3 }}
        columns={{ sm: 4, md: 8, lg: 12 }}
      >
        <Grid item sm={4} md={8} lg={12}>
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
              <Grid item xs={4}>
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
