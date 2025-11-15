import * as React from "react";
import { useState, useEffect, useContext, useCallback } from "react";
import {
  Paper,
  Typography,
  FormControlLabel,
  Switch,
  TextField,
  Button,
  Stack,
  Box,
} from "@mui/material";
import { UserContext, UserDispatchContext } from "../UserProvider";
import { dateParser } from "../utils";
import {
  EventSeatingConfig as EventSeatingConfigType,
  defaultEventSeatingConfig,
} from "../types/events";

interface EventSeatingConfigProps {
  eventId: number;
}

const EventSeatingConfig: React.FC<EventSeatingConfigProps> = ({ eventId }) => {
  const { signOut } = useContext(UserDispatchContext);
  const userDetails = useContext(UserContext);
  const token = userDetails?.token;

  const [config, setConfig] = useState<EventSeatingConfigType>(
    defaultEventSeatingConfig,
  );
  const [loading, setLoading] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const fetchConfig = useCallback(() => {
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
      })
      .then((data) => {
        if (data) {
          setConfig(data);
          setHasChanges(false);
        }
      })
      .catch((error) => {
        console.error("Error fetching seating config:", error);
      });
  }, [eventId, token, signOut]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const handleSave = () => {
    setLoading(true);

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
        }
      })
      .catch((error) => {
        console.error("Error saving seating config:", error);
        alert("Failed to save seating configuration");
      })
      .finally(() => {
        setLoading(false);
      });
  };

  const handleHasSeatingChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setConfig({ ...config, hasSeating: event.target.checked });
    setHasChanges(true);
  };

  const handleAllowUnspecifiedSeatChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setConfig({ ...config, allowUnspecifiedSeat: event.target.checked });
    setHasChanges(true);
  };

  const handleUnspecifiedSeatLabelChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setConfig({ ...config, unspecifiedSeatLabel: event.target.value });
    setHasChanges(true);
  };

  return (
    <Paper
      sx={{
        p: 2,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Typography component="h2" variant="h6" color="primary" gutterBottom>
        Seating Configuration
      </Typography>
      <Box sx={{ mt: 2 }}>
        <Stack spacing={2}>
          <FormControlLabel
            control={
              <Switch
                checked={config.hasSeating}
                onChange={handleHasSeatingChange}
                inputProps={{
                  "aria-label": "Enable seating for this event",
                }}
              />
            }
            label="Enable seating for this event"
          />
          <FormControlLabel
            control={
              <Switch
                checked={config.allowUnspecifiedSeat}
                onChange={handleAllowUnspecifiedSeatChange}
                disabled={!config.hasSeating}
                inputProps={{
                  "aria-label": "Allow unspecified seat option",
                }}
              />
            }
            label="Allow 'unspecified seat' option"
          />
          <TextField
            label="Unspecified seat label"
            value={config.unspecifiedSeatLabel}
            onChange={handleUnspecifiedSeatLabelChange}
            disabled={!config.hasSeating || !config.allowUnspecifiedSeat}
            required={config.allowUnspecifiedSeat}
            fullWidth
            inputProps={{
              "aria-label": "Label for unspecified seat option",
            }}
            helperText="Label to display for the unspecified seat option"
          />
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={loading || !hasChanges}
            aria-label="Save seating configuration"
          >
            {loading ? "Saving..." : "Save Configuration"}
          </Button>
        </Stack>
      </Box>
    </Paper>
  );
};

export default EventSeatingConfig;
