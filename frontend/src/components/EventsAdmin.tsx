import * as React from "react";
import moment from "moment";
import { FormEvent, ChangeEvent, useState, useContext } from "react";
import {
  Button,
  Box,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Grid,
  Paper,
  TextField,
} from "@mui/material";
import { LocalizationProvider, DateTimePicker } from "@mui/x-date-pickers";
import { AdapterMoment } from "@mui/x-date-pickers/AdapterMoment";
import { UserContext } from "../UserProvider";
import { dateParser } from "../utils";
import { defaultCreateEvent, EventData } from "../types/events";
import EventTable from "./EventTable";

const EventsAdmin = () => {
  const userDetails = useContext(UserContext);
  const token = userDetails?.token;
  const [open, setOpen] = useState(false);

  const eventsState = useState([] as EventData[]);
  const [events, setEvents] = eventsState;

  const handleClickOpen = () => {
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
  };

  const [formValues, setFormValues] = useState(defaultCreateEvent);

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setFormValues({
      ...formValues,
      [name]: value,
    });
  };

  const handleTimeBeginChange = (value: moment.Moment | null) => {
    setFormValues({
      ...formValues,
      timeBegin: value ?? defaultCreateEvent.timeBegin,
    });
  };

  const handleTimeEndChange = (value: moment.Moment | null) => {
    setFormValues({
      ...formValues,
      timeEnd: value ?? defaultCreateEvent.timeEnd,
    });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    // Prevent page reload
    event.preventDefault();

    fetch(`${process.env.REACT_APP_API_PROXY}/api/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify(formValues),
    })
      .then((response) => {
        if (response.status === 201) {
          setOpen(false);
          return response
            .text()
            .then((data) => JSON.parse(data, dateParser) as EventData);
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
      })
      .then((data) => {
        setEvents([...events, data]);
      });
  };

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Grid container spacing={3}>
        {/* Events */}
        <Grid item xs={12}>
          <Paper sx={{ p: 2, display: "flex", flexDirection: "column" }}>
            <EventTable eventsState={eventsState} />
            <Button variant="outlined" onClick={handleClickOpen}>
              Create Event
            </Button>
          </Paper>
        </Grid>
      </Grid>
      <Dialog open={open} onClose={handleClose}>
        <Box component="form" onSubmit={handleSubmit} sx={{ mt: 1 }}>
          <DialogTitle>Create Event</DialogTitle>
          <DialogContent>
            <DialogContentText>Create an event here!</DialogContentText>

            <TextField
              id="title"
              name="title"
              label="Title"
              type="text"
              autoFocus
              required
              margin="dense"
              fullWidth
              variant="outlined"
              value={formValues.title}
              onChange={handleInputChange}
            />
            <TextField
              id="description"
              name="description"
              label="Description"
              type="text"
              autoFocus
              required
              margin="dense"
              fullWidth
              variant="outlined"
              multiline
              value={formValues.description}
              onChange={handleInputChange}
            />
            <LocalizationProvider
              dateAdapter={AdapterMoment}
              adapterLocale={moment.locale()}
            >
              <DateTimePicker
                label="Start Date"
                value={formValues.timeBegin}
                onChange={handleTimeBeginChange}
                renderInput={(params) => <TextField {...params} />}
                views={["year", "month", "day", "hours"]}
                ampm={false}
                disablePast
              />
              <DateTimePicker
                label="End Date"
                value={formValues.timeEnd}
                onChange={handleTimeEndChange}
                renderInput={(params) => <TextField {...params} />}
                views={["year", "month", "day", "hours"]}
                ampm={false}
                disablePast
              />
            </LocalizationProvider>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleClose}>Cancel</Button>
            <Button type="submit">Create</Button>
          </DialogActions>
        </Box>
      </Dialog>
    </Container>
  );
};

export default EventsAdmin;
