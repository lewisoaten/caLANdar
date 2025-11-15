# Multi-Room Floorplans & Seat Definition

This document describes the multi-room floorplans and seat definition feature for CaLANdar events.

## Overview

This feature allows event administrators to:

- Define multiple rooms for an event, each with its own floorplan image
- Place and manage seats on each room's floorplan
- Provide both visual (floorplan editor) and accessible (table view) interfaces for seat management

## Database Schema

### Room Table

Stores information about event rooms:

```sql
CREATE TABLE room (
    id SERIAL PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES event(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    image TEXT,  -- Base64-encoded image data or URL to floorplan image
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_modified TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Fields:**

- `id`: Unique room identifier
- `event_id`: Reference to the parent event
- `name`: Room name (e.g., "Main Hall", "Meeting Room A")
- `description`: Optional room description
- `image`: Base64-encoded image data uploaded by admin
- `sort_order`: Display order (lower numbers first)
- `created_at`: Timestamp when room was created
- `last_modified`: Timestamp of last modification

### Seat Table

Stores information about seats within rooms:

```sql
CREATE TABLE seat (
    id SERIAL PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES event(id) ON DELETE CASCADE,
    room_id INTEGER NOT NULL REFERENCES room(id) ON DELETE CASCADE,
    label VARCHAR(255) NOT NULL,
    description TEXT,
    x DOUBLE PRECISION NOT NULL,  -- 0.0 to 1.0 (left to right)
    y DOUBLE PRECISION NOT NULL,  -- 0.0 to 1.0 (top to bottom)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_modified TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Fields:**

- `id`: Unique seat identifier
- `event_id`: Reference to the parent event
- `room_id`: Reference to the parent room
- `label`: Seat label (e.g., "A1", "Table 5")
- `description`: Optional seat description
- `x`: Horizontal position (0.0 = left edge, 1.0 = right edge)
- `y`: Vertical position (0.0 = top edge, 1.0 = bottom edge)
- `created_at`: Timestamp when seat was created
- `last_modified`: Timestamp of last modification

## API Endpoints

All endpoints require admin authentication (`as_admin=true` query parameter).

### Room Endpoints

#### GET `/api/events/{eventId}/rooms`

Get all rooms for an event.

**Response:**

```json
[
  {
    "id": 1,
    "eventId": 1,
    "name": "Main Hall",
    "description": "The main gaming hall",
    "image": "https://example.com/floorplan.jpg",
    "sortOrder": 0,
    "createdAt": "2025-11-15T22:00:00Z",
    "lastModified": "2025-11-15T22:00:00Z"
  }
]
```

#### GET `/api/events/{eventId}/rooms/{roomId}`

Get a specific room.

#### POST `/api/events/{eventId}/rooms`

Create a new room.

**Request Body:**

```json
{
  "name": "Main Hall",
  "description": "The main gaming hall",
  "image": "https://example.com/floorplan.jpg",
  "sortOrder": 0
}
```

#### PUT `/api/events/{eventId}/rooms/{roomId}`

Update an existing room.

#### DELETE `/api/events/{eventId}/rooms/{roomId}`

Delete a room (and all its seats).

### Seat Endpoints

#### GET `/api/events/{eventId}/seats`

Get all seats for an event (across all rooms).

**Response:**

```json
[
  {
    "id": 1,
    "eventId": 1,
    "roomId": 1,
    "label": "A1",
    "description": "Front row, left corner",
    "x": 0.25,
    "y": 0.5,
    "createdAt": "2025-11-15T22:00:00Z",
    "lastModified": "2025-11-15T22:00:00Z"
  }
]
```

#### GET `/api/events/{eventId}/seats/{seatId}`

Get a specific seat.

#### POST `/api/events/{eventId}/seats`

Create a new seat.

**Request Body:**

```json
{
  "roomId": 1,
  "label": "A1",
  "description": "Front row, left corner",
  "x": 0.25,
  "y": 0.5
}
```

#### PUT `/api/events/{eventId}/seats/{seatId}`

Update an existing seat.

#### DELETE `/api/events/{eventId}/seats/{seatId}`

Delete a seat.

## Frontend Components

### RoomManager

**Location:** `frontend/src/components/RoomManager.tsx`

Displays a gallery of rooms with their floorplan images. Allows admins to:

- Add new rooms
- Edit room details (name, description, uploaded image, sort order)
- Delete rooms
- Select a room for seat editing

**Accessibility:**

- Keyboard navigable
- ARIA labels for all interactive elements
- Works on mobile devices

### FloorplanEditor

**Location:** `frontend/src/components/FloorplanEditor.tsx`

Visual editor for placing seats on a floorplan:

- Displays the room's floorplan image (if available)
- Click on the floorplan to add a new seat at that position
- Seats are displayed as circular markers with their labels
- Hover over seats to see edit/delete buttons
- Coordinates are stored as percentages (0.0 to 1.0) for responsive positioning

**Accessibility:**

- Floorplan area has proper ARIA labels
- Keyboard accessible through SeatList component
- Touch-friendly on mobile devices

### SeatList

**Location:** `frontend/src/components/SeatList.tsx`

Accessible table view of all seats in a room:

- Displays all seats in a data table
- Shows label, description, and coordinates
- Edit and delete buttons for each seat
- Add new seat button
- Fully keyboard navigable
- Screen reader compatible

**Accessibility:**

- Semantic HTML table structure
- ARIA labels for all controls
- Keyboard navigation support
- Works without JavaScript (fallback)

### EventManagement Integration

**Location:** `frontend/src/components/EventManagement.tsx`

The main event management page now includes:

1. Event details and actions
2. Seating configuration toggle
3. Room manager (room gallery)
4. Floorplan editor (left) and Seat list (right) - side by side for efficient editing
5. Invitations table

## Usage Workflow

1. **Enable Seating:** Toggle seating on in the Event Seating Configuration
2. **Add Rooms:** Use the Room Manager to add one or more rooms
3. **Upload Floorplan Image:** Click "Upload Image" to select a floorplan image from your computer
4. **Add Seats:**
   - **Visual method:** Select a room, then click on the floorplan to place seats
   - **Keyboard method:** Use the Seat List to add seats with specific coordinates
5. **Edit Seats:** Hover over seats in the floorplan or use the table view
6. **Delete Seats/Rooms:** Use the delete buttons (confirms before deletion)

## Accessibility Features

All components follow WCAG 2.1 AA accessibility standards:

- **Keyboard Navigation:** All functionality is accessible via keyboard
- **Screen Readers:** Proper ARIA labels and semantic HTML
- **Focus Management:** Clear focus indicators and logical tab order
- **Alternative Views:** Both visual (floorplan) and table views available
- **Mobile Support:** Touch-friendly with responsive layouts
- **High Contrast:** Uses theme colors for visibility

## Mobile Responsiveness

- Room cards display in a responsive grid (1 column on mobile, 2-3 on larger screens)
- Floorplan editor and seat list stack vertically on mobile
- Touch-friendly tap targets (minimum 44x44 pixels)
- Forms adapt to smaller screens

## Future Enhancements

Potential improvements for future iterations:

- Bulk seat import from CSV
- Seat reservation status visualization
- Room capacity management
- Seat categories/types (e.g., VIP, standard)
- Automatic seat labeling (e.g., generate A1-A10, B1-B10)
