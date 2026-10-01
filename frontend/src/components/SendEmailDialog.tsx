import * as React from "react";
import { FormEvent, useState, useContext, useEffect } from "react";
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
import SendSharp from "@mui/icons-material/SendSharp";
import { useSnackbar } from "notistack";
import { UserContext, UserDispatchContext } from "../UserProvider";
import { EventData } from "../types/events";
import { RSVP } from "../types/invitations";
import { FilterChips, colors, fonts, hairline } from "./hl";

interface SendEmailDialogProps {
  open: boolean;
  onClose: () => void;
  event: EventData;
  /** `dialog` (default) or `inline` (the Broadcast tab of Event management). */
  variant?: "dialog" | "inline";
}

export type RecipientFilter =
  "all" | "rsvpYes" | "rsvpYesMaybe" | "notResponded";

export const RECIPIENT_OPTIONS: ReadonlyArray<{
  id: RecipientFilter;
  label: string;
}> = [
  { id: "all", label: "Everyone" },
  { id: "rsvpYes", label: "Going" },
  { id: "rsvpYesMaybe", label: "Going + maybe" },
  { id: "notResponded", label: "No reply" },
];

/** How many invitees each recipient filter reaches. */
export function recipientCounts(
  invitations: ReadonlyArray<{ response: RSVP | string | null }>,
): Record<RecipientFilter, number> {
  const yes = invitations.filter((i) => i.response === RSVP.yes).length;
  const maybe = invitations.filter((i) => i.response === RSVP.maybe).length;
  return {
    all: invitations.length,
    rsvpYes: yes,
    rsvpYesMaybe: yes + maybe,
    notResponded: invitations.filter((i) => !i.response).length,
  };
}

const labelSx = {
  fontFamily: fonts.mono,
  fontSize: 11,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: colors.textMuted,
} as const;

const inputSx = {
  "& .MuiOutlinedInput-root": { backgroundColor: "rgba(6,7,11,0.6)" },
  "& input": { fontSize: 16 },
  "& textarea": { fontSize: 15, lineHeight: 1.55 },
} as const;

export default function SendEmailDialog(props: SendEmailDialogProps) {
  const { open, onClose, event, variant = "dialog" } = props;
  const inline = variant === "inline";
  const uid = React.useId();

  const { signOut } = useContext(UserDispatchContext);
  const userDetails = useContext(UserContext);
  const token = userDetails?.token;
  const { enqueueSnackbar } = useSnackbar();

  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState<RecipientFilter>("rsvpYes");
  const [sending, setSending] = useState(false);
  const [counts, setCounts] = useState<Record<RecipientFilter, number> | null>(
    null,
  );
  const [status, setStatus] = useState<{
    tone: "ok" | "error";
    text: string;
  } | null>(null);

  // Recipient counts for the audience chips.
  useEffect(() => {
    if (!open || !event.id || !token) return;
    const controller = new AbortController();
    fetch(`/api/events/${event.id}/invitations?as_admin=true`, {
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: "Bearer " + token,
      },
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (Array.isArray(data)) setCounts(recipientCounts(data));
      })
      .catch(() => {
        // Counts are a nicety; the form works without them.
      });
    return () => controller.abort();
  }, [open, event.id, token]);

  const cancel = () => {
    onClose();
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSending(true);
    setStatus(null);
    const reach = counts?.[filter];

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
          enqueueSnackbar("Email sent successfully!", { variant: "success" });
          setStatus({
            tone: "ok",
            text:
              reach === undefined
                ? "Email sent."
                : `Sent to ${reach} ${reach === 1 ? "person" : "people"}.`,
          });
          setSubject("");
          setMessage("");
          setFilter("rsvpYes");
          onClose();
        } else if (response.status === 400) {
          return response.text().then((data) => {
            enqueueSnackbar(`Invalid request: ${data}`, { variant: "error" });
            throw new Error(`Invalid request: ${data}`);
          });
        } else if (response.status === 401) {
          signOut();
        } else {
          return response.text().then((data) => {
            enqueueSnackbar(`Something went wrong: ${data}`, {
              variant: "error",
            });
            throw new Error(`Something went wrong: ${data}`);
          });
        }
      })
      .catch((err) => {
        console.error("Error sending email:", err);
        setStatus({ tone: "error", text: "The email could not be sent." });
      })
      .finally(() => {
        setSending(false);
      });
  };

  const body = (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <Box component="span" id={`${uid}-to`} sx={labelSx}>
          Send to
        </Box>
        <FilterChips
          label="Recipients"
          options={RECIPIENT_OPTIONS.map((o) => ({
            ...o,
            count: counts ? counts[o.id] : undefined,
          }))}
          value={filter}
          onChange={(v) => {
            setFilter(v);
            setStatus(null);
          }}
        />
      </Box>
      <Box sx={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <Box component="label" htmlFor={`${uid}-subject`} sx={labelSx}>
          Subject
        </Box>
        <TextField
          id={`${uid}-subject`}
          name="subject"
          type="text"
          required
          fullWidth
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          sx={inputSx}
        />
      </Box>
      <Box sx={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <Box component="label" htmlFor={`${uid}-message`} sx={labelSx}>
          Message
        </Box>
        <TextField
          id={`${uid}-message`}
          name="message"
          type="text"
          required
          fullWidth
          multiline
          minRows={6}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          helperText="Sent from caLANdar to the selected recipients along with the event details."
          sx={inputSx}
        />
      </Box>
    </Box>
  );

  const statusText = (
    <Box
      component="span"
      aria-live="polite"
      sx={{
        fontSize: 14,
        color: status?.tone === "error" ? colors.pinkText : colors.lime,
      }}
    >
      {status?.text}
    </Box>
  );

  if (inline) {
    return (
      <Box
        component="form"
        onSubmit={handleSubmit}
        aria-label={`Broadcast to guests of ${event.title}`}
        sx={{
          maxWidth: 760,
          border: `1px solid ${hairline.panel}`,
          backgroundColor: colors.surface,
          p: "20px",
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        {body}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.75,
            flexWrap: "wrap",
            justifyContent: "flex-end",
          }}
        >
          {statusText}
          <Button
            type="submit"
            variant="contained"
            disabled={sending}
            startIcon={<SendSharp />}
          >
            {sending ? "Sending…" : "Send broadcast"}
          </Button>
        </Box>
      </Box>
    );
  }

  return (
    <Dialog open={open} onClose={cancel} maxWidth="md" fullWidth>
      <Box component="form" onSubmit={handleSubmit}>
        <DialogTitle>Send email to guests</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Send a custom email to guests of <strong>{event.title}</strong>. The
            email will be sent from caLANdar and will include event details.
          </DialogContentText>
          {body}
        </DialogContent>
        <DialogActions>
          {statusText}
          <Button onClick={cancel} disabled={sending} color="inherit">
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={sending}
            startIcon={<SendSharp />}
          >
            {sending ? "Sending…" : "Send email"}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
