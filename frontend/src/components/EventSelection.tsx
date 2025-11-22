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
  Pagination,
  CircularProgress,
} from "@mui/material";
import { dateParser } from "../utils";
import { UserContext, UserDispatchContext } from "../UserProvider";
import { EventData } from "../types/events";
import EventCard from "./EventCard";

const Event = () => {
  const { signOut } = useContext(UserDispatchContext);
  const userDetails = useContext(UserContext);
  const token = userDetails?.token;

  const [events, setEvents] = useState([] as EventData[]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const pageSize = 20;

  const [showOldEvents, setShowOldEvents] = React.useState(false);

  const handleShowOldEvents = (event: React.ChangeEvent<HTMLInputElement>) => {
    setShowOldEvents(event.target.checked);
    setPage(1); // Reset to first page when changing filter
  };

  const handlePageChange = (
    _event: React.ChangeEvent<unknown>,
    value: number,
  ) => {
    setPage(value);
    window.scrollTo(0, 0); // Scroll to top when changing pages
  };

  useEffect(() => {
    setLoading(true);
    const filter = showOldEvents ? "all" : "upcoming";

    fetch(`/api/events?page=${page}&limit=${pageSize}&filter=${filter}`, {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: "Bearer " + token,
      },
    })
      .then((response) => {
        if (response.status === 401) signOut();
        else if (response.ok) return response.json();
      })
      .then((data) => {
        if (!data) {
          setEvents([]);
          setTotalPages(1);
          setLoading(false);
          return;
        }

        // Parse the events from the paginated response
        const parsedEvents = JSON.parse(
          JSON.stringify(data.events),
          dateParser,
        ) as Array<EventData>;

        setEvents(parsedEvents);
        setTotalPages(data.totalPages || 1);
        setLoading(false);
      })
      .catch((error) => {
        console.error("Error fetching events:", error);
        setLoading(false);
      });
  }, [page, showOldEvents, token, signOut]);

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Grid
        container
        spacing={{ xs: 2, md: 3 }}
        columns={{ sm: 4, md: 8, lg: 12 }}
      >
        <Grid size={{ sm: 4, md: 8, lg: 12 }}>
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
        {loading ? (
          <Grid size={{ sm: 4, md: 8, lg: 12 }}>
            <Box display="flex" justifyContent="center" p={4}>
              <CircularProgress />
            </Box>
          </Grid>
        ) : (
          events.map((event) => (
            <Grid size={4} key={event.id}>
              <EventCard event={event} />
            </Grid>
          ))
        )}
        {!loading && events.length > 0 && totalPages > 1 && (
          <Grid size={{ sm: 4, md: 8, lg: 12 }}>
            <Box display="flex" justifyContent="center" mt={2}>
              <Pagination
                count={totalPages}
                page={page}
                onChange={handlePageChange}
                color="primary"
                size="large"
              />
            </Box>
          </Grid>
        )}
      </Grid>
    </Container>
  );
};

export default Event;
