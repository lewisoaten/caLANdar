import * as React from "react";
import { useState } from "react";
import { Button, Container, Paper, Stack } from "@mui/material";
import Grid from "@mui/material/Grid";
import { EventData } from "../types/events";
import EventTable from "./EventTable";
import EventsAdminDialog from "./EventsAdminDialog";

const EventsAdmin = () => {
  const [open, setOpen] = useState(false);

  const eventsState = useState([] as EventData[]);
  const [events, setEvents] = eventsState;

  const handleClickOpen = () => {
    setOpen(true);
  };

  const handleClose = (value?: EventData) => {
    setOpen(false);

    // If value is set, then add it to the events
    if (value) {
      setEvents([...events, value]);
    }
  };

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Grid container spacing={3}>
        {/* Events */}
        <Grid xs={12}>
          <Paper sx={{ p: 2, display: "flex", flexDirection: "column" }}>
            <EventTable eventsState={eventsState} asAdmin={true} />
            <Stack direction="row" spacing={2}>
              <Button variant="outlined" onClick={handleClickOpen}>
                Create Event
              </Button>
            </Stack>
          </Paper>
        </Grid>
      </Grid>
      <EventsAdminDialog open={open} onClose={handleClose} />
    </Container>
  );
};

export default EventsAdmin;
