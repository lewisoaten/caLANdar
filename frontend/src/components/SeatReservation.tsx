import * as React from "react";
import {
  useEffect,
  useState,
  useContext,
  Dispatch,
  SetStateAction,
} from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  SelectChangeEvent,
  Stack,
  Typography,
} from "@mui/material";
import { useSnackbar } from "notistack";
import { UserContext, UserDispatchContext } from "../UserProvider";
import { dateParser } from "../utils";
import {
  SeatReservation as SeatReservationType,
  SeatReservationSubmit,
  defaultSeatReservation,
} from "../types/invitations";
import { EventData, Seat } from "../types/events";
import AttendanceSelector from "./AttendanceSelector";
import DeleteIcon from "@mui/icons-material/Delete";
import SaveIcon from "@mui/icons-material/Save";

interface SeatReservationProps {
  event: EventData;
  seats: Seat[];
  allowUnspecifiedSeat: boolean;
  unspecifiedSeatLabel: string;
  disabled: boolean;
}

export default function SeatReservation(props: SeatReservationProps) {
  const { signOut } = useContext(UserDispatchContext);
  const userDetails = useContext(UserContext);
  const token = userDetails?.token;

  const { enqueueSnackbar } = useSnackbar();

  const [reservation, setReservation] = useState<SeatReservationType | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedSeatId, setSelectedSeatId] = useState<number | null>(null);
  const [attendanceBuckets, setAttendanceBuckets] = useState<number[]>([]);

  // Fetch existing reservation
  useEffect(() => {
    if (!token) return;

    fetch(`/api/events/${props.event.id}/seat-reservations/me`, {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: "Bearer " + token,
      },
    })
      .then((response) => {
        if (response.status === 401) {
          signOut();
        } else if (response.status === 404) {
          // No reservation exists yet
          setReservation(null);
          setLoading(false);
          return null;
        } else if (response.ok) {
          return response
            .text()
            .then(
              (data) => JSON.parse(data, dateParser) as SeatReservationType,
            );
        }
        throw new Error("Failed to fetch reservation");
      })
      .then((data) => {
        if (data) {
          setReservation(data);
          setSelectedSeatId(data.seatId);
          setAttendanceBuckets(data.attendanceBuckets);
        }
        setLoading(false);
      })
      .catch((error) => {
        console.error("Error fetching reservation:", error);
        setLoading(false);
      });
  }, [props.event.id, token]);

  const handleSeatChange = (event: SelectChangeEvent<number | string>) => {
    const value = event.target.value;
    if (value === "unspecified") {
      setSelectedSeatId(null);
    } else {
      setSelectedSeatId(Number(value));
    }
  };

  const handleSave = () => {
    if (!token) return;

    setSaving(true);

    const submitData: SeatReservationSubmit = {
      seatId: selectedSeatId,
      attendanceBuckets: attendanceBuckets,
    };

    const method = reservation ? "PUT" : "POST";
    const url = `/api/events/${props.event.id}/seat-reservations/me`;

    fetch(url, {
      method: method,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify(submitData),
    })
      .then((response) => {
        if (response.status === 401) {
          signOut();
        } else if (response.ok) {
          return response
            .text()
            .then(
              (data) => JSON.parse(data, dateParser) as SeatReservationType,
            );
        } else {
          return response.text().then((text) => {
            throw new Error(text || "Failed to save reservation");
          });
        }
      })
      .then((data) => {
        if (data) {
          setReservation(data);
          enqueueSnackbar(
            reservation
              ? "Seat reservation updated"
              : "Seat reservation created",
            { variant: "success" },
          );
        }
        setSaving(false);
      })
      .catch((error) => {
        console.error("Error saving reservation:", error);
        enqueueSnackbar(`Failed to save reservation: ${error.message}`, {
          variant: "error",
        });
        setSaving(false);
      });
  };

  const handleDelete = () => {
    if (!token || !reservation) return;

    setSaving(true);

    fetch(`/api/events/${props.event.id}/seat-reservations/me`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: "Bearer " + token,
      },
    })
      .then((response) => {
        if (response.status === 401) {
          signOut();
        } else if (response.ok || response.status === 204) {
          setReservation(null);
          setSelectedSeatId(null);
          setAttendanceBuckets([]);
          enqueueSnackbar("Seat reservation deleted", { variant: "success" });
        } else {
          throw new Error("Failed to delete reservation");
        }
        setSaving(false);
      })
      .catch((error) => {
        console.error("Error deleting reservation:", error);
        enqueueSnackbar("Failed to delete reservation", { variant: "error" });
        setSaving(false);
      });
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" p={3}>
        <CircularProgress />
      </Box>
    );
  }

  const hasChanges =
    !reservation ||
    reservation.seatId !== selectedSeatId ||
    JSON.stringify(reservation.attendanceBuckets) !==
      JSON.stringify(attendanceBuckets);

  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Seat Reservation
        </Typography>

        {props.disabled && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Please RSVP to the event first to reserve a seat.
          </Alert>
        )}

        <Stack spacing={2}>
          <FormControl fullWidth disabled={props.disabled || saving}>
            <InputLabel id="seat-select-label">Select Seat</InputLabel>
            <Select
              labelId="seat-select-label"
              id="seat-select"
              value={
                selectedSeatId === null ? "unspecified" : selectedSeatId || ""
              }
              label="Select Seat"
              onChange={handleSeatChange}
            >
              {props.allowUnspecifiedSeat && (
                <MenuItem value="unspecified">
                  {props.unspecifiedSeatLabel}
                </MenuItem>
              )}
              {props.seats.map((seat) => (
                <MenuItem key={seat.id} value={seat.id}>
                  {seat.label}
                  {seat.description && ` - ${seat.description}`}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Attendance Time Periods
            </Typography>
            <AttendanceSelector
              event={props.event}
              attendance={attendanceBuckets}
              setAttendance={setAttendanceBuckets}
              disabled={props.disabled || saving}
            />
          </Box>

          <Stack direction="row" spacing={2} justifyContent="flex-end">
            {reservation && (
              <Button
                variant="outlined"
                color="error"
                startIcon={<DeleteIcon />}
                onClick={handleDelete}
                disabled={props.disabled || saving}
              >
                Delete Reservation
              </Button>
            )}
            <Button
              variant="contained"
              startIcon={<SaveIcon />}
              onClick={handleSave}
              disabled={props.disabled || saving || !hasChanges}
            >
              {saving ? (
                <CircularProgress size={24} />
              ) : reservation ? (
                "Update Reservation"
              ) : (
                "Create Reservation"
              )}
            </Button>
          </Stack>

          {reservation && (
            <Alert severity="success">
              Current reservation:{" "}
              {reservation.seatId === null
                ? props.unspecifiedSeatLabel
                : props.seats.find((s) => s.id === reservation.seatId)?.label ||
                  `Seat ${reservation.seatId}`}
            </Alert>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
