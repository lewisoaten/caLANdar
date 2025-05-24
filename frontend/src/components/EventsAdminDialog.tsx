import * as React from "react";
import moment from "moment/min/moment-with-locales";
import { FormEvent, ChangeEvent, useState, useContext, useEffect } from "react";
import {
  Button,
  Box,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  TextField,
  Grid,
} from "@mui/material";
import { AdapterMoment } from "@mui/x-date-pickers/AdapterMoment";
import { LocalizationProvider, DateTimePicker } from "@mui/x-date-pickers";
import { UserContext, UserDispatchContext } from "../UserProvider";
import { dateParser } from "../utils";
import {
  defaultCreateEvent,
  defaultEventData,
  EventData,
} from "../types/events";

interface EventsAminDialogProps {
  open: boolean;
  onClose: (value?: EventData) => void;
  event?: EventData;
}

export default function EventsAdminDialog(props: EventsAminDialogProps) {
  const { open, onClose, event } = props;

  const createMode = !event;

  const { signOut } = useContext(UserDispatchContext);
  const userDetails = useContext(UserContext);
  const token = userDetails?.token;

  const [formValues, setFormValues] = useState(
    createMode ? defaultEventData : event,
  );

  useEffect(() => {
    setFormValues(createMode ? defaultEventData : event);
  }, [props]);

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
    value?.startOf("hour");
    setFormValues({
      ...formValues,
      timeBegin: value ?? defaultCreateEvent.timeBegin,
    });
  };

  const handleTimeEndChange = (value: moment.Moment | null) => {
    value?.startOf("hour");
    setFormValues({
      ...formValues,
      timeEnd: value ?? defaultCreateEvent.timeEnd,
    });
  };

  const postNewEvent = () => {
    fetch(`/api/events?as_admin=true`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify(
        (({ title, description, timeBegin, timeEnd }) => ({
          title,
          description,
          timeBegin,
          timeEnd,
        }))(formValues),
      ),
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
          signOut();
        } else {
          response.text().then((data) => console.log(data));
          const error = `Something has gone wrong, please contact the administrator. More details: ${response.status}`;
          alert(error);
          throw new Error(error);
        }
      })
      .then((data) => {
        if (data) close(data);
      });
  };

  const putEvent = () => {
    fetch(`/api/events/${event?.id}?as_admin=true`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify(formValues),
    }).then((response) => {
      if (response.status === 204) {
        close(formValues);
      } else if (response.status === 400) {
        const error = "Invalid event data.";
        alert(error);
        throw new Error(error);
      } else if (response.status === 401) {
        signOut();
      } else {
        const error =
          "Something has gone wrong, please contact the administrator.";
        alert(error);
        throw new Error(error);
      }
    });
  };

  const getBase64 = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      // Make new FileReader
      const reader = new FileReader();

      // Convert the file to base64 text
      reader.readAsDataURL(file);

      // on reader load somthing...
      reader.onload = () => {
        // remove data url part
        const base64 = reader.result?.toString().split(",")[1];
        resolve(base64 as string);
      };
    });
  };

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.currentTarget.files || event.currentTarget.files.length === 0) {
      setFormValues({
        ...formValues,
        image: undefined,
      });
      return;
    }

    // I've kept this example simple by using the first image instead of multiple
    getBase64(event.currentTarget.files[0])
      .then((result) => {
        setFormValues({
          ...formValues,
          image: result,
        });
      })
      .catch((err) => {
        setFormValues({
          ...formValues,
          image: undefined,
        });
        throw err;
      });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    // Prevent page reload
    event.preventDefault();

    if (createMode) {
      postNewEvent();
    } else {
      putEvent();
    }
  };

  const locale =
    navigator.languages && navigator.languages.length
      ? navigator.languages[0]
      : navigator.language;
  moment.locale(locale);

  return (
    <Dialog open={open} onClose={cancel}>
      <Box component="form" onSubmit={handleSubmit} sx={{ mt: 1 }}>
        <DialogTitle>Create/Edit Event</DialogTitle>
        <DialogContent>
          <DialogContentText>Create an event here!</DialogContentText>
          <Grid container spacing={2}>
            <Grid size={12}>
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
            </Grid>
            <Grid size={12}>
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
            </Grid>
            <LocalizationProvider
              dateAdapter={AdapterMoment}
              adapterLocale={moment.locale()}
            >
              <Grid size={6}>
                <DateTimePicker
                  label="Start Date"
                  value={formValues.timeBegin}
                  onChange={handleTimeBeginChange}
                  slots={{
                    textField: (textFieldProps) => (
                      <TextField {...textFieldProps} />
                    ),
                  }}
                  views={["year", "month", "day", "hours"]}
                  ampm={false}
                />
              </Grid>
              <Grid size={6}>
                <DateTimePicker
                  label="End Date"
                  value={formValues.timeEnd}
                  onChange={handleTimeEndChange}
                  slots={{
                    textField: (textFieldProps) => (
                      <TextField {...textFieldProps} />
                    ),
                  }}
                  views={["year", "month", "day", "hours"]}
                  ampm={false}
                />
              </Grid>
              <Grid size={12}>
                <TextField
                  id="image"
                  name="image"
                  label="Image"
                  type="file"
                  margin="dense"
                  fullWidth
                  variant="outlined"
                  onChange={handleImageChange}
                />
              </Grid>
              <Grid size={12} sx={{ overflow: "none", height: 140 }}>
                <img
                  style={{ objectFit: "cover", width: "100%", height: "100%" }}
                  src={
                    (formValues.image &&
                      "data:image/png;base64," + formValues.image) ||
                    "/static/lan_party_image.jpg"
                  }
                  alt="LAN Party Theme"
                />
              </Grid>
            </LocalizationProvider>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={cancel}>Cancel</Button>
          <Button type="submit">Create</Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
