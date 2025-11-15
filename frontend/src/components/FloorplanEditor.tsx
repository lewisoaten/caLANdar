import * as React from "react";
import { useState, useEffect, useContext, useCallback, useRef } from "react";
import {
  Paper,
  Typography,
  Box,
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
import { UserContext, UserDispatchContext } from "../UserProvider";
import { dateParser } from "../utils";
import { Room, Seat, SeatSubmit } from "../types/events";

interface FloorplanEditorProps {
  eventId: number;
  room: Room | null;
  refreshKey: number;
  onSeatsChanged: () => void;
}

const FloorplanEditor: React.FC<FloorplanEditorProps> = ({
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
  const [draggingSeat, setDraggingSeat] = useState<Seat | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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

  const handleFloorplanClick = (
    event: React.MouseEvent<HTMLDivElement, MouseEvent>,
  ) => {
    if (!room || !containerRef.current || isDragging) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;

    // Open dialog to create new seat at this position
    setEditingSeat(null);
    setFormData({
      roomId: room.id,
      label: "",
      description: null,
      x,
      y,
    });
    setEditDialogOpen(true);
  };

  const handleSeatMouseDown = (
    seat: Seat,
    event: React.MouseEvent<HTMLDivElement, MouseEvent>,
  ) => {
    // Don't start drag if clicking on edit/delete buttons
    if ((event.target as HTMLElement).closest("button")) {
      return;
    }
    event.stopPropagation();
    setDraggingSeat(seat);
    setIsDragging(true);
  };

  const handleSeatDrag = (
    event: React.MouseEvent<HTMLDivElement, MouseEvent>,
  ) => {
    if (!draggingSeat || !containerRef.current || !room) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(
      0,
      Math.min(1, (event.clientX - rect.left) / rect.width),
    );
    const y = Math.max(
      0,
      Math.min(1, (event.clientY - rect.top) / rect.height),
    );

    // Update seat position optimistically in local state
    setSeats((prevSeats) =>
      prevSeats.map((s) => (s.id === draggingSeat.id ? { ...s, x, y } : s)),
    );
  };

  const handleSeatDragEnd = (
    event: React.MouseEvent<HTMLDivElement, MouseEvent>,
  ) => {
    if (!draggingSeat || !containerRef.current || !room) {
      setDraggingSeat(null);
      setIsDragging(false);
      return;
    }

    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(
      0,
      Math.min(1, (event.clientX - rect.left) / rect.width),
    );
    const y = Math.max(
      0,
      Math.min(1, (event.clientY - rect.top) / rect.height),
    );

    // Save the new position to the server
    fetch(`/api/events/${eventId}/seats/${draggingSeat.id}?as_admin=true`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({
        roomId: draggingSeat.roomId,
        label: draggingSeat.label,
        description: draggingSeat.description,
        x,
        y,
      }),
    })
      .then((response) => {
        if (response.status === 401) signOut();
        else if (response.ok) {
          return response
            .text()
            .then((data) => JSON.parse(data, dateParser) as Seat);
        } else {
          throw new Error("Failed to update seat position");
        }
      })
      .then((data) => {
        if (data) {
          fetchSeats();
          onSeatsChanged();
        }
      })
      .catch((error) => {
        console.error("Error updating seat position:", error);
        // Revert to original position on error
        fetchSeats();
      })
      .finally(() => {
        setDraggingSeat(null);
        setIsDragging(false);
      });
  };

  const handleEditSeat = (
    seat: Seat,
    event: React.MouseEvent<HTMLButtonElement, MouseEvent>,
  ) => {
    event.stopPropagation();
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

  const handleDeleteSeat = (
    seatId: number,
    event: React.MouseEvent<HTMLButtonElement, MouseEvent>,
  ) => {
    event.stopPropagation();
    if (!confirm("Are you sure you want to delete this seat?")) return;

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
          minHeight: 400,
        }}
      >
        <Typography variant="body1" color="text.secondary">
          Select a room to edit its seats
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
      <Typography component="h2" variant="h6" color="primary" gutterBottom>
        Floorplan Editor: {room.name}
      </Typography>

      <Box
        ref={containerRef}
        onClick={handleFloorplanClick}
        onMouseMove={isDragging ? handleSeatDrag : undefined}
        onMouseUp={isDragging ? handleSeatDragEnd : undefined}
        onMouseLeave={isDragging ? handleSeatDragEnd : undefined}
        sx={{
          position: "relative",
          width: "100%",
          minHeight: 400,
          border: "2px dashed",
          borderColor: "divider",
          borderRadius: 1,
          overflow: "hidden",
          cursor: isDragging ? "grabbing" : "crosshair",
          backgroundColor: room.image ? "transparent" : "grey.100",
        }}
        aria-label="Floorplan editor - click to add seats, drag to move them"
        role="button"
        tabIndex={0}
      >
        {room.image ? (
          <img
            ref={imageRef}
            src={room.image}
            alt={`Floorplan for ${room.name}`}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              pointerEvents: "none",
            }}
          />
        ) : (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: 400,
            }}
          >
            <Typography variant="body2" color="text.secondary">
              No floorplan image - click to place seats
            </Typography>
          </Box>
        )}

        {seats.map((seat) => (
          <Box
            key={seat.id}
            onMouseDown={(e) => handleSeatMouseDown(seat, e)}
            sx={{
              position: "absolute",
              left: `${seat.x * 100}%`,
              top: `${seat.y * 100}%`,
              transform: "translate(-50%, -50%)",
              backgroundColor: "primary.main",
              color: "primary.contrastText",
              borderRadius: "50%",
              width: 40,
              height: 40,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "0.75rem",
              fontWeight: "bold",
              cursor: draggingSeat?.id === seat.id ? "grabbing" : "grab",
              userSelect: "none",
              "&:hover": {
                backgroundColor: "primary.dark",
              },
              ...(draggingSeat?.id === seat.id && {
                opacity: 0.8,
                zIndex: 1000,
              }),
            }}
            title={seat.description || seat.label}
            aria-label={`Seat ${seat.label}${seat.description ? `: ${seat.description}` : ""} - drag to move`}
          >
            <span>{seat.label}</span>
            <Box
              sx={{
                position: "absolute",
                top: -5,
                right: -5,
                display: "none",
                gap: 0.5,
                ".MuiBox-root:hover &": {
                  display: "flex",
                },
              }}
            >
              <IconButton
                size="small"
                onClick={(e) => handleEditSeat(seat, e)}
                aria-label={`Edit seat ${seat.label}`}
                sx={{
                  backgroundColor: "background.paper",
                  width: 20,
                  height: 20,
                  "&:hover": {
                    backgroundColor: "action.hover",
                  },
                }}
              >
                <EditIcon sx={{ fontSize: 12 }} />
              </IconButton>
              <IconButton
                size="small"
                onClick={(e) => handleDeleteSeat(seat.id, e)}
                aria-label={`Delete seat ${seat.label}`}
                sx={{
                  backgroundColor: "background.paper",
                  width: 20,
                  height: 20,
                  color: "error.main",
                  "&:hover": {
                    backgroundColor: "action.hover",
                  },
                }}
              >
                <DeleteIcon sx={{ fontSize: 12 }} />
              </IconButton>
            </Box>
          </Box>
        ))}
      </Box>

      <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
        Click on the floorplan to add a new seat. Drag seats to move them, or
        hover over them to edit or delete.
      </Typography>

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
                helperText="0.0 to 1.0"
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
                helperText="0.0 to 1.0"
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

export default FloorplanEditor;
