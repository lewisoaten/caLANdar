import * as React from "react";
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
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  SelectChangeEvent,
} from "@mui/material";
import { UserContext, UserDispatchContext } from "../UserProvider";
import { EventData } from "../types/events";

interface SendEmailDialogProps {
  open: boolean;
  onClose: () => void;
  event: EventData;
}

type RecipientFilter = "all" | "rsvpYes" | "rsvpYesMaybe" | "notResponded";

export default function SendEmailDialog(props: SendEmailDialogProps) {
  const { open, onClose, event } = props;

  const { signOut } = useContext(UserDispatchContext);
  const userDetails = useContext(UserContext);
  const token = userDetails?.token;

  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState<RecipientFilter>("rsvpYes");
  const [sending, setSending] = useState(false);

  const cancel = () => {
    onClose();
  };

  const handleSubjectChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSubject(event.target.value);
  };

  const handleMessageChange = (event: ChangeEvent<HTMLInputElement>) => {
    setMessage(event.target.value);
  };

  const handleFilterChange = (event: SelectChangeEvent<RecipientFilter>) => {
    setFilter(event.target.value as RecipientFilter);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    // Prevent page reload
    event.preventDefault();

    setSending(true);

    fetch(`/api/events/${props.event.id}/email?as_admin=true`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({
        filter,
        subject,
        message,
      }),
    })
      .then((response) => {
        if (response.status === 204) {
          alert("Email sent successfully!");
          // Reset form
          setSubject("");
          setMessage("");
          setFilter("rsvpYes");
          onClose();
        } else if (response.status === 400) {
          return response.text().then((data) => {
            const error = `Invalid request: ${data}`;
            alert(error);
            throw new Error(error);
          });
        } else if (response.status === 401) {
          signOut();
        } else {
          return response.text().then((data) => {
            const error = `Something went wrong: ${data}`;
            alert(error);
            throw new Error(error);
          });
        }
      })
      .catch((err) => {
        console.error("Error sending email:", err);
      })
      .finally(() => {
        setSending(false);
      });
  };

  return (
    <Dialog open={open} onClose={cancel} maxWidth="md" fullWidth>
      <Box component="form" onSubmit={handleSubmit} sx={{ mt: 1 }}>
        <DialogTitle>Send Email to Event Guests</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Send a custom email to guests of <strong>{event.title}</strong>. The
            email will be sent from CaLANdar and will include event details.
          </DialogContentText>

          <FormControl fullWidth margin="dense" required>
            <InputLabel id="recipient-filter-label">Recipients</InputLabel>
            <Select
              labelId="recipient-filter-label"
              id="recipient-filter"
              value={filter}
              label="Recipients"
              onChange={handleFilterChange}
            >
              <MenuItem value="all">All invitees</MenuItem>
              <MenuItem value="rsvpYes">RSVP: Yes</MenuItem>
              <MenuItem value="rsvpYesMaybe">RSVP: Yes & Maybe</MenuItem>
              <MenuItem value="notResponded">Not responded yet</MenuItem>
            </Select>
          </FormControl>

          <TextField
            id="subject"
            name="subject"
            label="Email Subject"
            type="text"
            required
            margin="dense"
            fullWidth
            variant="outlined"
            value={subject}
            onChange={handleSubjectChange}
          />

          <TextField
            id="message"
            name="message"
            label="Message"
            type="text"
            required
            margin="dense"
            fullWidth
            variant="outlined"
            multiline
            rows={6}
            value={message}
            onChange={handleMessageChange}
            helperText="This message will be sent to the selected recipients along with event details"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={cancel} disabled={sending}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={sending}>
            {sending ? "Sending..." : "Send Email"}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
