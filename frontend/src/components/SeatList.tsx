import * as React from "react";
import { useState, useEffect, useContext, useCallback } from "react";
import {
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Stack,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import AddIcon from "@mui/icons-material/Add";
import { UserContext, UserDispatchContext } from "../UserProvider";
import { dateParser } from "../utils";
import { Room, Seat, SeatSubmit } from "../types/events";

interface SeatListProps {
  eventId: number;
  room: Room | null;
  refreshKey: number;
  onSeatsChanged: () => void;
}

const SeatList: React.FC<SeatListProps> = ({
  eventId,
  room,
  refreshKey,
  onSeatsChanged,
}) => {
  const { signOut } = useContext(UserDispatchContext);
  const userDetails = useContext(UserContext);
  const token = userDetails?.token;

  const [seats, setSeats] = useState<Seat[]>([]);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingSeat, setEditingSeat] = useState<Seat | null>(null);
  const [formData, setFormData] = useState<SeatSubmit>({
    roomId: 0,
    label: "",
    description: null,
    x: 0.5,
    y: 0.5,
  });

  const fetchSeats = useCallback(() => {
    if (!room) return;

    fetch(`/api/events/${eventId}/seats?as_admin=true`, {
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
            .then((data) => JSON.parse(data, dateParser) as Seat[]);
      })
      .then((data) => {
        if (data) {
          // Filter seats for this room
          setSeats(data.filter((seat) => seat.roomId === room.id));
        }
      })
      .catch((error) => {
        console.error("Error fetching seats:", error);
      });
  }, [eventId, room, token, signOut]);

  useEffect(() => {
    fetchSeats();
  }, [fetchSeats, refreshKey]);

  const handleAddSeat = () => {
    if (!room) return;

    setEditingSeat(null);
    setFormData({
      roomId: room.id,
      label: "",
      description: null,
      x: 0.5,
      y: 0.5,
    });
    setEditDialogOpen(true);
  };

  const handleEditSeat = (seat: Seat) => {
    setEditingSeat(seat);
    setFormData({
      roomId: seat.roomId,
      label: seat.label,
      description: seat.description,
      x: seat.x,
      y: seat.y,
    });
    setEditDialogOpen(true);
  };

  const handleDeleteSeat = (seatId: number, seatLabel: string) => {
    if (!confirm(`Are you sure you want to delete seat ${seatLabel}?`)) return;

    fetch(`/api/events/${eventId}/seats/${seatId}?as_admin=true`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: "Bearer " + token,
      },
    })
      .then((response) => {
        if (response.status === 401) signOut();
        else if (response.status === 204) {
          fetchSeats();
          onSeatsChanged();
        } else {
          alert("Failed to delete seat");
        }
      })
      .catch((error) => {
        console.error("Error deleting seat:", error);
        alert("Failed to delete seat");
      });
  };

  const handleSaveSeat = () => {
    const method = editingSeat ? "PUT" : "POST";
    const url = editingSeat
      ? `/api/events/${eventId}/seats/${editingSeat.id}?as_admin=true`
      : `/api/events/${eventId}/seats?as_admin=true`;

    fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify(formData),
    })
      .then((response) => {
        if (response.status === 401) signOut();
        else if (response.ok) {
          return response
            .text()
            .then((data) => JSON.parse(data, dateParser) as Seat);
        } else {
          throw new Error("Failed to save seat");
        }
      })
      .then((data) => {
        if (data) {
          fetchSeats();
          onSeatsChanged();
          setEditDialogOpen(false);
        }
      })
      .catch((error) => {
        console.error("Error saving seat:", error);
        alert("Failed to save seat");
      });
  };

  if (!room) {
    return (
      <Paper
        sx={{
          p: 2,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 200,
        }}
      >
        <Typography variant="body1" color="text.secondary">
          Select a room to view its seats
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper
      sx={{
        p: 2,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ mb: 2 }}
      >
        <Typography component="h2" variant="h6" color="primary">
          Seats for {room.name}
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleAddSeat}
          aria-label="Add new seat"
        >
          Add Seat
        </Button>
      </Stack>

      {seats.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No seats defined yet. Click &quot;Add Seat&quot; to create one.
        </Typography>
      ) : (
        <TableContainer>
          <Table aria-label="Seats table">
            <TableHead>
              <TableRow>
                <TableCell>Label</TableCell>
                <TableCell>Description</TableCell>
                <TableCell align="right">X Position</TableCell>
                <TableCell align="right">Y Position</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {seats.map((seat) => (
                <TableRow
                  key={seat.id}
                  sx={{ "&:last-child td, &:last-child th": { border: 0 } }}
                >
                  <TableCell component="th" scope="row">
                    {seat.label}
                  </TableCell>
                  <TableCell>{seat.description || "-"}</TableCell>
                  <TableCell align="right">
                    {(seat.x * 100).toFixed(1)}%
                  </TableCell>
                  <TableCell align="right">
                    {(seat.y * 100).toFixed(1)}%
                  </TableCell>
                  <TableCell align="right">
                    <IconButton
                      size="small"
                      onClick={() => handleEditSeat(seat)}
                      aria-label={`Edit seat ${seat.label}`}
                    >
                      <EditIcon />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => handleDeleteSeat(seat.id, seat.label)}
                      aria-label={`Delete seat ${seat.label}`}
                      color="error"
                    >
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>{editingSeat ? "Edit Seat" : "Add New Seat"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Seat Label"
              value={formData.label}
              onChange={(e) =>
                setFormData({ ...formData, label: e.target.value })
              }
              required
              fullWidth
              autoFocus
              inputProps={{ "aria-label": "Seat label" }}
              helperText="e.g., A1, B2, Table 5"
            />
            <TextField
              label="Description"
              value={formData.description || ""}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  description: e.target.value || null,
                })
              }
              multiline
              rows={2}
              fullWidth
              inputProps={{ "aria-label": "Seat description" }}
            />
            <Stack direction="row" spacing={2}>
              <TextField
                label="X Position"
                type="number"
                value={formData.x}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    x: parseFloat(e.target.value) || 0,
                  })
                }
                inputProps={{
                  step: 0.01,
                  min: 0,
                  max: 1,
                  "aria-label": "X position",
                }}
                fullWidth
                helperText="0.0 (left) to 1.0 (right)"
              />
              <TextField
                label="Y Position"
                type="number"
                value={formData.y}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    y: parseFloat(e.target.value) || 0,
                  })
                }
                inputProps={{
                  step: 0.01,
                  min: 0,
                  max: 1,
                  "aria-label": "Y position",
                }}
                fullWidth
                helperText="0.0 (top) to 1.0 (bottom)"
              />
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleSaveSeat}
            variant="contained"
            disabled={!formData.label.trim()}
          >
            {editingSeat ? "Save" : "Create"}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
};

export default SeatList;
