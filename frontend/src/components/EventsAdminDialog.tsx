import * as React from "react";
import moment from "moment";
import { FormEvent, ChangeEvent, useState, useContext, useRef } from "react";
import {
  Button,
  Box,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  TextField,
  Typography,
} from "@mui/material";
import UploadSharp from "@mui/icons-material/UploadSharp";
import { UserContext, UserDispatchContext } from "../UserProvider";
import { dateParser } from "../utils";
import { EventData } from "../types/events";
import { eventImageSrc } from "../utils/eventImage";
import { colors, fonts, hairline, tint } from "./hl";

interface EventsAminDialogProps {
  open: boolean;
  onClose: (value?: EventData) => void;
  event?: EventData;
  /**
   * `dialog` (default): a modal. `inline`: the same form rendered in the page
   * (the design's new-event panel on Manage events, and the Details tab of
   * Event management).
   */
  variant?: "dialog" | "inline";
  /** Inline edit only: shows a "Delete event" button next to Save. */
  onDelete?: () => void;
}

/** `datetime-local` value (local time, minutes precision). */
export const toLocalInput = (m: moment.MomentInput) =>
  moment(m).isValid() ? moment(m).format("YYYY-MM-DDTHH:mm") : "";

/** Parse a `datetime-local` value, rounded down to the hour like before. */
export const fromLocalInput = (value: string): moment.Moment | null => {
  const m = moment(value, "YYYY-MM-DDTHH:mm", true);
  return m.isValid() ? m.startOf("hour") : null;
};

/** Defaults for a new event: starts at the next whole hour, runs a day. */
export const newEventDefaults = (now: moment.Moment = moment()): EventData => {
  const begin = now.clone().add(1, "hour").startOf("hour");
  return {
    id: 0,
    createdAt: now.clone(),
    lastModified: now.clone(),
    title: "",
    description: "",
    image: undefined,
    timeBegin: begin,
    timeEnd: begin.clone().add(1, "day"),
  };
};

/** Validation message for the time range, if any. */
export const timeRangeError = (
  begin: moment.MomentInput,
  end: moment.MomentInput,
): string | null => {
  if (!moment(begin).isValid()) return "Enter a start date and time.";
  if (!moment(end).isValid()) return "Enter an end date and time.";
  if (moment(end).isBefore(moment(begin)))
    return "The event must end after it starts.";
  return null;
};

const fieldLabelSx = {
  fontFamily: fonts.mono,
  fontSize: 11,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: colors.textMuted,
} as const;

/** Design-style field: mono caps label above a borderless-label input. */
function Field({
  id,
  label,
  children,
  full,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        minWidth: 0,
        gridColumn: full ? "1 / -1" : undefined,
      }}
    >
      <Box component="label" htmlFor={id} sx={fieldLabelSx}>
        {label}
      </Box>
      {children}
    </Box>
  );
}

const inputSx = {
  "& .MuiOutlinedInput-root": { backgroundColor: "rgba(6,7,11,0.6)" },
  "& input": { colorScheme: "dark", fontSize: 16 },
  "& textarea": { fontSize: 15, lineHeight: 1.55 },
} as const;

export default function EventsAdminDialog(props: EventsAminDialogProps) {
  const { open, onClose, event, variant = "dialog", onDelete } = props;
  const inline = variant === "inline";
  const createMode = !event;
  const uid = React.useId();
  const ids = {
    title: `${uid}-title`,
    description: `${uid}-description`,
    begin: `${uid}-begin`,
    end: `${uid}-end`,
    error: `${uid}-error`,
    timeError: `${uid}-time-error`,
  };

  const { signOut } = useContext(UserDispatchContext);
  const userDetails = useContext(UserContext);
  const token = userDetails?.token;

  const initial = () => (createMode ? newEventDefaults() : event);
  const [formValues, setFormValues] = useState<EventData>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Reset the form whenever it is (re)opened or given a different event.
  // (Not on every refetch of the same event, so "Saved" stays visible.)
  const resetKey = `${open}|${event?.id ?? "new"}`;
  const [prevKey, setPrevKey] = useState(resetKey);
  if (prevKey !== resetKey) {
    setPrevKey(resetKey);
    setFormValues(initial());
    setError(null);
    setSaved(false);
  }

  const update = (patch: Partial<EventData>) => {
    setFormValues((v) => ({ ...v, ...patch }));
    setSaved(false);
    setError(null);
  };

  const cancel = () => {
    onClose();
  };

  const close = (value: EventData) => {
    onClose(value);
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    update({ [name]: value } as Partial<EventData>);
  };

  const handleTimeChange =
    (key: "timeBegin" | "timeEnd") => (e: ChangeEvent<HTMLInputElement>) => {
      const value = fromLocalInput(e.target.value);
      // Keep invalid/partial input as an invalid moment so validation shows.
      update({ [key]: value ?? moment.invalid() } as Partial<EventData>);
    };

  const postNewEvent = () => {
    setSubmitting(true);
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
          throw new Error(
            "Invalid event data. Check the fields and try again.",
          );
        } else if (response.status === 401) {
          signOut();
        } else {
          response.text().then((data) => console.log(data));
          throw new Error(
            `Something has gone wrong, please contact the administrator. More details: ${response.status}`,
          );
        }
      })
      .then((data) => {
        if (data) close(data);
      })
      .catch((err: Error) => {
        console.error(err);
        setError(err.message || "Unable to create the event.");
      })
      .finally(() => setSubmitting(false));
  };

  const putEvent = () => {
    setSubmitting(true);
    fetch(`/api/events/${event?.id}?as_admin=true`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify(formValues),
    })
      .then((response) => {
        if (response.status === 204) {
          setSaved(true);
          close(formValues);
        } else if (response.status === 400) {
          throw new Error(
            "Invalid event data. Check the fields and try again.",
          );
        } else if (response.status === 401) {
          signOut();
        } else {
          throw new Error(
            "Something has gone wrong, please contact the administrator.",
          );
        }
      })
      .catch((err: Error) => {
        console.error(err);
        setError(err.message || "Unable to save the event.");
      })
      .finally(() => setSubmitting(false));
  };

  const getBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        // Remove the data URL prefix.
        const base64 = reader.result?.toString().split(",")[1];
        resolve(base64 as string);
      };
      reader.onerror = () => reject(reader.error);
    });
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.currentTarget.files;
    if (!files || files.length === 0) {
      update({ image: undefined });
      return;
    }
    getBase64(files[0])
      .then((result) => update({ image: result }))
      .catch((err) => {
        console.error(err);
        update({ image: undefined });
        setError("Couldn't read that image file.");
      });
  };

  const timeError = timeRangeError(formValues.timeBegin, formValues.timeEnd);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (timeError) {
      setError(timeError);
      return;
    }
    if (createMode) postNewEvent();
    else putEvent();
  };

  const imageSrc = eventImageSrc(formValues.image);

  const fields = (
    <>
      <Field id={ids.title} label="Title" full>
        <TextField
          id={ids.title}
          name="title"
          type="text"
          autoFocus={createMode || !inline}
          required
          fullWidth
          placeholder="e.g. Spring LAN 2027"
          value={formValues.title}
          onChange={handleInputChange}
          sx={inputSx}
        />
      </Field>
      <Box
        sx={{
          gridColumn: "1 / -1",
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(min(100%, 200px), 1fr))",
          gap: "14px",
        }}
      >
        <Field id={ids.begin} label="Starts">
          <TextField
            id={ids.begin}
            name="timeBegin"
            type="datetime-local"
            required
            fullWidth
            value={toLocalInput(formValues.timeBegin)}
            onChange={handleTimeChange("timeBegin")}
            error={
              Boolean(timeError) && !moment(formValues.timeBegin).isValid()
            }
            slotProps={{ htmlInput: { step: 3600 } }}
            sx={inputSx}
          />
        </Field>
        <Field id={ids.end} label="Ends">
          <TextField
            id={ids.end}
            name="timeEnd"
            type="datetime-local"
            required
            fullWidth
            value={toLocalInput(formValues.timeEnd)}
            onChange={handleTimeChange("timeEnd")}
            error={Boolean(timeError)}
            slotProps={{
              htmlInput: {
                step: 3600,
                "aria-describedby": timeError ? ids.timeError : undefined,
              },
            }}
            sx={inputSx}
          />
        </Field>
        {timeError && (
          <Typography
            id={ids.timeError}
            sx={{ gridColumn: "1 / -1", color: colors.pinkText, fontSize: 13 }}
          >
            {timeError}
          </Typography>
        )}
      </Box>
      <Field id={ids.description} label="Description" full>
        <TextField
          id={ids.description}
          name="description"
          type="text"
          required
          fullWidth
          multiline
          minRows={inline && !createMode ? 5 : 3}
          placeholder="What should people bring? What's the vibe?"
          value={formValues.description}
          onChange={handleInputChange}
          sx={inputSx}
        />
      </Field>
    </>
  );

  const errorBox = (
    <Box
      id={ids.error}
      role="alert"
      sx={{
        gridColumn: "1 / -1",
        color: colors.pinkText,
        fontSize: 14,
        "&:empty": { display: "none" },
      }}
    >
      {error}
    </Box>
  );

  const coverImage = (
    <Box sx={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <Box component="span" sx={fieldLabelSx}>
        Cover image
      </Box>
      <Box
        component="img"
        src={imageSrc}
        alt={
          formValues.image
            ? "Current cover image"
            : "Default cover image (LAN party)"
        }
        sx={{
          display: "block",
          width: "100%",
          aspectRatio: "16 / 9",
          objectFit: "cover",
          border: `1px solid ${tint("cyan", 0.2)}`,
          backgroundColor: colors.surface2,
        }}
      />
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        hidden
        aria-label="Cover image file"
        onChange={handleImageChange}
      />
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
        <Button
          variant="outlined"
          size="small"
          startIcon={<UploadSharp />}
          onClick={() => fileInput.current?.click()}
          sx={{ flex: "1 1 auto", borderStyle: "dashed" }}
        >
          {formValues.image ? "Replace image" : "Upload image"}
        </Button>
        {formValues.image && (
          <Button
            variant="text"
            color="inherit"
            size="small"
            onClick={() => {
              update({ image: undefined });
              if (fileInput.current) fileInput.current.value = "";
            }}
          >
            Remove
          </Button>
        )}
      </Box>
    </Box>
  );

  const submitLabel = createMode
    ? inline
      ? "Create event"
      : "Create"
    : submitting
      ? "Saving…"
      : saved
        ? "Saved"
        : "Save changes";

  if (inline && createMode) {
    if (!open) return null;
    return (
      <Box
        component="form"
        onSubmit={handleSubmit}
        aria-label="New event"
        noValidate={false}
        sx={{
          border: `1px solid ${tint("amber", 0.4)}`,
          backgroundColor: "rgba(12,15,24,0.9)",
          p: "20px",
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(min(100%, 220px), 1fr))",
          gap: "14px",
        }}
      >
        {fields}
        {errorBox}
        <Box
          sx={{
            gridColumn: "1 / -1",
            display: "flex",
            justifyContent: "flex-end",
            gap: 1.25,
          }}
        >
          <Button type="submit" variant="contained" disabled={submitting}>
            {submitting ? "Creating…" : submitLabel}
          </Button>
        </Box>
      </Box>
    );
  }

  if (inline) {
    return (
      <Box
        component="form"
        onSubmit={handleSubmit}
        aria-label="Event details"
        sx={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(min(100%, 340px), 1fr))",
          gap: "clamp(16px,2vw,24px)",
          alignItems: "start",
        }}
      >
        <Box
          sx={{
            border: `1px solid ${hairline.panel}`,
            backgroundColor: colors.surface,
            p: "20px",
            display: "grid",
            gap: "14px",
            minWidth: 0,
            "@media (min-width: 1400px)": { gridColumn: "span 1" },
          }}
        >
          {fields}
          {errorBox}
          <Box
            sx={{
              display: "flex",
              gap: 1.25,
              flexWrap: "wrap",
              justifyContent: "space-between",
              // Phones: Delete and Save share the row equally (stacked
              // full-width when even that is too tight).
              "@media (max-width: 599.95px)": {
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(136px, 1fr))",
              },
            }}
          >
            {onDelete ? (
              <Button variant="outlined" color="error" onClick={onDelete}>
                Delete event
              </Button>
            ) : (
              <Box
                component="span"
                sx={{ "@media (max-width: 599.95px)": { display: "none" } }}
              />
            )}
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                minWidth: 0,
                "@media (max-width: 599.95px)": {
                  gridColumn: onDelete ? undefined : "1 / -1",
                },
              }}
              aria-live="polite"
            >
              <Button
                type="submit"
                variant="contained"
                disabled={submitting}
                sx={{
                  minWidth: 180,
                  "@media (max-width: 599.95px)": { minWidth: 0, flex: 1 },
                }}
              >
                {submitLabel}
              </Button>
            </Box>
          </Box>
        </Box>
        <Box
          sx={{
            border: `1px solid ${hairline.panel}`,
            backgroundColor: colors.surface,
            p: "20px",
            minWidth: 0,
          }}
        >
          {coverImage}
        </Box>
      </Box>
    );
  }

  return (
    <Dialog open={open} onClose={cancel} maxWidth="sm" fullWidth>
      <Box component="form" onSubmit={handleSubmit}>
        <DialogTitle>{createMode ? "Create event" : "Edit event"}</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            {createMode
              ? "Set the name, dates and description for the new LAN."
              : "Update the event's details."}
          </DialogContentText>
          <Box sx={{ display: "grid", gap: "14px" }}>
            {fields}
            {!createMode && coverImage}
            {errorBox}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={cancel} color="inherit">
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={submitting}>
            {submitLabel}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
