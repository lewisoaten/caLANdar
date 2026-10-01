import * as React from "react";
import { useState, useEffect, useContext, useCallback } from "react";
import {
  Box,
  Button,
  FormControlLabel,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { UserContext, UserDispatchContext } from "../UserProvider";
import { dateParser } from "../utils";
import {
  EventSeatingConfig as EventSeatingConfigType,
  defaultEventSeatingConfig,
} from "../types/events";
import { colors, fonts, hairline, srOnly } from "./hl";

interface EventSeatingConfigProps {
  eventId: number;
  /** Called with the saved configuration. */
  onSaved?: (config: EventSeatingConfigType) => void;
}

function ToggleRow({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <FormControlLabel
      labelPlacement="start"
      disabled={disabled}
      control={<Switch checked={checked} onChange={onChange} />}
      label={
        <Box
          component="span"
          sx={{ display: "flex", flexDirection: "column", gap: "3px" }}
        >
          <Box
            component="span"
            sx={{ fontSize: 16, fontWeight: 600, color: colors.text }}
          >
            {label}
          </Box>
          <Box component="span" sx={{ fontSize: 13, color: colors.textMuted }}>
            {description}
          </Box>
        </Box>
      }
      sx={{
        m: 0,
        width: "100%",
        minHeight: 64,
        py: "10px",
        gap: 2,
        justifyContent: "space-between",
        borderBottom: `1px solid ${hairline.faint}`,
        "& .MuiFormControlLabel-label": { flex: 1 },
        "&.Mui-disabled .MuiFormControlLabel-label span": { opacity: 0.6 },
      }}
    />
  );
}

const EventSeatingConfig: React.FC<EventSeatingConfigProps> = ({
  eventId,
  onSaved,
}) => {
  const { signOut } = useContext(UserDispatchContext);
  const userDetails = useContext(UserContext);
  const token = userDetails?.token;
  const headingId = React.useId();
  const labelId = React.useId();

  const [config, setConfig] = useState<EventSeatingConfigType>(
    defaultEventSeatingConfig,
  );
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const fetchConfig = useCallback(() => {
    setLoadError(false);
    fetch(`/api/events/${eventId}/seating-config?as_admin=true`, {
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
            .then(
              (data) => JSON.parse(data, dateParser) as EventSeatingConfigType,
            );
        else throw new Error(`HTTP ${response.status}`);
      })
      .then((data) => {
        if (data) {
          setConfig(data);
          setHasChanges(false);
        }
        setLoaded(true);
      })
      .catch((error) => {
        console.error("Error fetching seating config:", error);
        setLoadError(true);
        setLoaded(true);
      });
  }, [eventId, token, signOut]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const handleSave = () => {
    setLoading(true);
    setSaveError(null);

    fetch(`/api/events/${eventId}/seating-config?as_admin=true`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({
        hasSeating: config.hasSeating,
        allowUnspecifiedSeat: config.allowUnspecifiedSeat,
        unspecifiedSeatLabel: config.unspecifiedSeatLabel,
      }),
    })
      .then((response) => {
        if (response.status === 401) signOut();
        else if (response.ok) {
          return response
            .text()
            .then(
              (data) => JSON.parse(data, dateParser) as EventSeatingConfigType,
            );
        } else {
          throw new Error("Failed to save seating configuration");
        }
      })
      .then((data) => {
        if (data) {
          setConfig(data);
          setHasChanges(false);
          setSaved(true);
          onSaved?.(data);
        }
      })
      .catch((error) => {
        console.error("Error saving seating config:", error);
        setSaveError("Failed to save seating configuration. Try again.");
      })
      .finally(() => {
        setLoading(false);
      });
  };

  const change = (patch: Partial<EventSeatingConfigType>) => {
    setConfig({ ...config, ...patch });
    setHasChanges(true);
    setSaved(false);
    setSaveError(null);
  };

  const labelRequired = config.hasSeating && config.allowUnspecifiedSeat;
  const labelMissing = labelRequired && !config.unspecifiedSeatLabel.trim();

  return (
    <Box
      component="section"
      aria-labelledby={headingId}
      aria-busy={!loaded}
      sx={{
        border: `1px solid ${hairline.panel}`,
        backgroundColor: colors.surface,
        px: "20px",
        py: "8px",
        minWidth: 0,
      }}
    >
      <Typography component="h2" id={headingId} sx={srOnly}>
        Seating options
      </Typography>
      {loadError && (
        <Box
          role="alert"
          sx={{
            py: 1.5,
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            flexWrap: "wrap",
            color: colors.pinkText,
            fontSize: 14,
          }}
        >
          Couldn&apos;t load the seating settings.
          <Button size="small" variant="outlined" onClick={fetchConfig}>
            Retry
          </Button>
        </Box>
      )}
      <ToggleRow
        label="Seat map enabled"
        description="Attendees pick desks from the floor plan."
        checked={config.hasSeating}
        disabled={!loaded}
        onChange={(e) => change({ hasSeating: e.target.checked })}
      />
      <ToggleRow
        label='Allow "no seat" option'
        description="For people bringing their own desk or dropping in."
        checked={config.allowUnspecifiedSeat}
        disabled={!loaded || !config.hasSeating}
        onChange={(e) => change({ allowUnspecifiedSeat: e.target.checked })}
      />
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: "6px",
          py: "14px",
        }}
      >
        <Box
          component="label"
          htmlFor={labelId}
          sx={{
            fontFamily: fonts.mono,
            fontSize: 11,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: colors.textMuted,
          }}
        >
          No-seat option label
        </Box>
        <TextField
          id={labelId}
          value={config.unspecifiedSeatLabel}
          onChange={(e) => change({ unspecifiedSeatLabel: e.target.value })}
          disabled={
            !loaded || !config.hasSeating || !config.allowUnspecifiedSeat
          }
          required={labelRequired}
          error={labelMissing}
          fullWidth
          helperText={
            labelMissing
              ? "Enter a label for the no-seat option."
              : "Shown to attendees instead of a desk, e.g. Bring my own desk."
          }
          sx={{ "& .MuiOutlinedInput-root": { minHeight: 44 } }}
        />
      </Box>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          flexWrap: "wrap",
          gap: 1.5,
          pb: "12px",
        }}
      >
        <Box
          aria-live="polite"
          sx={{
            fontSize: 14,
            color: saveError ? colors.pinkText : colors.lime,
          }}
        >
          {saveError ?? (saved ? "Seating settings saved." : "")}
        </Box>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={loading || !hasChanges || labelMissing}
        >
          {loading ? "Saving…" : "Save seating"}
        </Button>
      </Box>
    </Box>
  );
};

export default EventSeatingConfig;
