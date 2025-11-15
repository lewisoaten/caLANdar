import * as React from "react";
import { useState, useEffect, useContext, useCallback } from "react";
import {
  Paper,
  Typography,
  Button,
  Stack,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Box,
  Card,
  CardMedia,
  CardContent,
  CardActions,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import AddIcon from "@mui/icons-material/Add";
import { UserContext, UserDispatchContext } from "../UserProvider";
import { dateParser } from "../utils";
import { Room, RoomSubmit } from "../types/events";

interface RoomManagerProps {
  eventId: number;
  onRoomSelect?: (room: Room | null) => void;
}

const RoomManager: React.FC<RoomManagerProps> = ({ eventId, onRoomSelect }) => {
  const { signOut } = useContext(UserDispatchContext);
  const userDetails = useContext(UserContext);
  const token = userDetails?.token;

  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [formData, setFormData] = useState<RoomSubmit>({
    name: "",
    description: null,
    image: null,
    sortOrder: 0,
  });

  const fetchRooms = useCallback(() => {
    fetch(`/api/events/${eventId}/rooms?as_admin=true`, {
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
            .then((data) => JSON.parse(data, dateParser) as Room[]);
      })
      .then((data) => {
        if (data) {
          setRooms(data);
        }
      })
      .catch((error) => {
        console.error("Error fetching rooms:", error);
      });
  }, [eventId, token, signOut]);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  const handleAddRoom = () => {
    setEditingRoom(null);
    setFormData({
      name: "",
      description: null,
      image: null,
      sortOrder: rooms.length,
    });
    setEditDialogOpen(true);
  };

  const handleEditRoom = (room: Room) => {
    setEditingRoom(room);
    setFormData({
      name: room.name,
      description: room.description,
      image: room.image,
      sortOrder: room.sortOrder,
    });
    setEditDialogOpen(true);
  };

  const handleDeleteRoom = (roomId: number) => {
    if (!confirm("Are you sure you want to delete this room?")) return;

    fetch(`/api/events/${eventId}/rooms/${roomId}?as_admin=true`, {
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
          fetchRooms();
          if (selectedRoom?.id === roomId) {
            setSelectedRoom(null);
            onRoomSelect?.(null);
          }
        } else {
          alert("Failed to delete room");
        }
      })
      .catch((error) => {
        console.error("Error deleting room:", error);
        alert("Failed to delete room");
      });
  };

  const handleSaveRoom = () => {
    const method = editingRoom ? "PUT" : "POST";
    const url = editingRoom
      ? `/api/events/${eventId}/rooms/${editingRoom.id}?as_admin=true`
      : `/api/events/${eventId}/rooms?as_admin=true`;

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
            .then((data) => JSON.parse(data, dateParser) as Room);
        } else {
          throw new Error("Failed to save room");
        }
      })
      .then((data) => {
        if (data) {
          fetchRooms();
          setEditDialogOpen(false);
        }
      })
      .catch((error) => {
        console.error("Error saving room:", error);
        alert("Failed to save room");
      });
  };

  const handleRoomSelect = (room: Room) => {
    setSelectedRoom(room);
    onRoomSelect?.(room);
  };

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
          Rooms & Floorplans
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleAddRoom}
          aria-label="Add new room"
        >
          Add Room
        </Button>
      </Stack>

      {rooms.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No rooms defined yet. Click &quot;Add Room&quot; to create one.
        </Typography>
      ) : (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              sm: "repeat(2, 1fr)",
              md: "repeat(3, 1fr)",
            },
            gap: 2,
          }}
        >
          {rooms.map((room) => (
            <Card
              key={room.id}
              sx={{
                border:
                  selectedRoom?.id === room.id ? "2px solid primary.main" : "",
              }}
            >
              {room.image && (
                <CardMedia
                  component="img"
                  height="140"
                  image={room.image}
                  alt={`Floorplan for ${room.name}`}
                  sx={{ cursor: "pointer" }}
                  onClick={() => handleRoomSelect(room)}
                />
              )}
              <CardContent>
                <Typography variant="h6" component="div">
                  {room.name}
                </Typography>
                {room.description && (
                  <Typography variant="body2" color="text.secondary">
                    {room.description}
                  </Typography>
                )}
              </CardContent>
              <CardActions>
                <Button
                  size="small"
                  onClick={() => handleRoomSelect(room)}
                  aria-label={`Select ${room.name}`}
                >
                  Select
                </Button>
                <IconButton
                  size="small"
                  onClick={() => handleEditRoom(room)}
                  aria-label={`Edit ${room.name}`}
                >
                  <EditIcon />
                </IconButton>
                <IconButton
                  size="small"
                  onClick={() => handleDeleteRoom(room.id)}
                  aria-label={`Delete ${room.name}`}
                  color="error"
                >
                  <DeleteIcon />
                </IconButton>
              </CardActions>
            </Card>
          ))}
        </Box>
      )}

      <Dialog
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>{editingRoom ? "Edit Room" : "Add New Room"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Room Name"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              required
              fullWidth
              autoFocus
              inputProps={{ "aria-label": "Room name" }}
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
              rows={3}
              fullWidth
              inputProps={{ "aria-label": "Room description" }}
            />
            <TextField
              label="Floorplan Image URL"
              value={formData.image || ""}
              onChange={(e) =>
                setFormData({ ...formData, image: e.target.value || null })
              }
              fullWidth
              inputProps={{ "aria-label": "Floorplan image URL" }}
              helperText="URL to an image of the room's floorplan"
            />
            <TextField
              label="Sort Order"
              type="number"
              value={formData.sortOrder}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  sortOrder: parseInt(e.target.value) || 0,
                })
              }
              fullWidth
              inputProps={{ "aria-label": "Sort order" }}
              helperText="Lower numbers appear first"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleSaveRoom}
            variant="contained"
            disabled={!formData.name.trim()}
          >
            {editingRoom ? "Save" : "Create"}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
};

export default RoomManager;
