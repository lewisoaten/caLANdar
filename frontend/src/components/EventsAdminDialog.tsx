import * as React from "react";
import moment from "moment";
import { FormEvent, ChangeEvent, useState, useContext } from "react";
import {
  Button,
  Box,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  TextField,
} from "@mui/material";
import { LocalizationProvider, DateTimePicker } from "@mui/x-date-pickers";
import { AdapterMoment } from "@mui/x-date-pickers/AdapterMoment";
import { UserContext } from "../UserProvider";
import { dateParser } from "../utils";
import { defaultCreateEvent, EventData } from "../types/events";

interface EventsAminDialogProps {
  open: boolean;
  onClose: (value?: EventData) => void;
  event?: EventData;
}

export default function EventsAdminDialog(props: EventsAminDialogProps) {
  const { open, onClose, event } = props;

  const userDetails = useContext(UserContext);
  const token = userDetails?.token;

  const [formValues, setFormValues] = useState(defaultCreateEvent);

  if (event) {
    setFormValues({
      title: event.title,
      description: event.description,
      timeBegin: event.timeBegin,
      timeEnd: event.timeEnd,
    });
  }

  const cancel = () => {
    onClose();
  };

  const close = (event: EventData) => {
    onClose(event);
  };

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

    fetch(`${process.env.REACT_APP_API_PROXY}/api/events?as_admin=true`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify(formValues),
    })
      .then((response) => {
        if (response.status === 201) {
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
        close(data);
      });
  };

  return (
    <Dialog open={open} onClose={cancel}>
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
          <Button onClick={cancel}>Cancel</Button>
          <Button type="submit">Create</Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
