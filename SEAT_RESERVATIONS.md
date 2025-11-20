# Seat Reservations

This document describes the seat reservation feature for CaLANdar events.

## Overview

The seat reservation system allows event attendees to reserve specific seats (or an "unspecified" seat) for specific time periods during an event. The system enforces conflict detection to prevent double-booking and provides both user and admin APIs.

## Database Schema

### seat_reservation Table

Stores seat reservations for events, tied to attendance buckets (time periods).

```sql
CREATE TABLE seat_reservation (
    id SERIAL PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES event(id) ON DELETE CASCADE,
    seat_id INTEGER REFERENCES seat(id) ON DELETE CASCADE,  -- NULL for unspecified seat
    invitation_email VARCHAR(255) NOT NULL,
    attendance_buckets BYTEA NOT NULL,  -- Array of bytes (1=attending, 0=not attending)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_modified TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_invitation FOREIGN KEY (event_id, invitation_email)
        REFERENCES invitation(event_id, email) ON DELETE CASCADE
);
```

**Fields:**

- `id`: Unique reservation identifier
- `event_id`: Reference to the parent event
- `seat_id`: Reference to the reserved seat (NULL for unspecified seat)
- `invitation_email`: Email of the invited user who made the reservation
- `attendance_buckets`: Array of bytes representing time buckets (1=attending that period, 0=not attending)
- `created_at`: Timestamp when reservation was created
- `last_modified`: Timestamp of last modification

**Constraints and Indexes:**

- One reservation per user per event (unique index on `event_id, invitation_email`)
- Indexes for efficient querying by event, seat, and email
- Foreign key to ensure invitation exists
- Cascading deletion when event, seat, or invitation is deleted

## Key Concepts

### Attendance Buckets

Attendance buckets divide the event duration into 6-hour time periods starting from 6 AM:

- 6 AM - 12 PM (noon)
- 12 PM - 6 PM
- 6 PM - 12 AM (midnight)
- 12 AM - 6 AM

Each bucket is represented by a single byte in the `attendance_buckets` array:

- `1` = user will attend during this period
- `0` = user will not attend during this period

**Example:** For a Friday 6 AM to Sunday 6 PM event:

- Friday: 4 buckets (6 AM-12 PM, 12 PM-6 PM, 6 PM-12 AM, 12 AM-6 AM)
- Saturday: 4 buckets
- Sunday: 3 buckets (6 AM-12 PM, 12 PM-6 PM, 6 PM-12 AM)
- Total: 11 buckets
- Array: `[1,1,0,0, 1,1,1,1, 1,1,1]` means attending Fri 6 AM-6 PM, all of Sat, Sun 6 AM-6 PM

### Unspecified Seat

An "unspecified seat" reservation allows users to reserve a spot at the event without choosing a specific physical seat. This is useful for:

- Events where exact seating isn't important
- Users who are undecided about their exact location
- Events with flexible seating arrangements

**Technical Details:**

- Represented by `seat_id = NULL` in the database
- Multiple users can have unspecified seat reservations simultaneously
- Must be enabled in the event's seating configuration (`allow_unspecified_seat = true`)
- No conflict detection for unspecified seats

### Conflict Detection

The system prevents double-booking by checking for overlapping attendance buckets on the same seat:

**Logic:**

1. For a specific seat (not unspecified), get all existing reservations
2. For each existing reservation, check if any attendance bucket overlaps with the new reservation
3. If any bucket has `1` (attending) in both the existing and new reservation, it's a conflict
4. Reject the reservation with a 409 Conflict error

**Example Conflict:**

- Existing reservation: seat_id=5, buckets=`[1,1,0,0]` (Fri 6 AM-6 PM)
- New reservation: seat_id=5, buckets=`[0,1,1,0]` (Fri 12 PM-12 AM)
- Result: Conflict! Both users want the seat from 12 PM-6 PM (bucket #2)

**No Conflict:**

- Existing reservation: seat_id=5, buckets=`[1,1,0,0]` (Fri 6 AM-6 PM)
- New reservation: seat_id=5, buckets=`[0,0,1,1]` (Fri 6 PM-6 AM Sat)
- Result: No conflict. Different time periods.

## API Endpoints

All endpoints are under `/api/events/{eventId}/seat-reservations`.

### User Endpoints

Users can only manage their own reservations.

#### GET /me

Get the current user's seat reservation for this event.

**Response:**

```json
{
  "id": 1,
  "eventId": 1,
  "seatId": 5,
  "invitationEmail": "user@example.com",
  "attendanceBuckets": [1, 1, 0, 1],
  "createdAt": "2025-11-15T22:00:00Z",
  "lastModified": "2025-11-15T22:00:00Z"
}
```

**Status Codes:**

- 200 OK: Reservation found
- 404 Not Found: No reservation for this event

#### POST /me

Create a new seat reservation for the current user.

**Request Body:**

```json
{
  "seatId": 5,
  "attendanceBuckets": [1, 1, 0, 1]
}
```

For an unspecified seat:

```json
{
  "seatId": null,
  "attendanceBuckets": [1, 1, 0, 1]
}
```

**Status Codes:**

- 200 OK: Reservation created successfully
- 400 Bad Request: Invalid input (e.g., seat doesn't exist, wrong bucket count)
- 409 Conflict: Seat is already reserved for those time periods, or user already has a reservation

#### PUT /me

Update the current user's existing seat reservation.

**Request Body:** Same as POST

**Status Codes:**

- 200 OK: Reservation updated
- 400 Bad Request: Invalid input
- 404 Not Found: User has no existing reservation
- 409 Conflict: New seat/time conflicts with another reservation

#### DELETE /me

Delete the current user's seat reservation.

**Status Codes:**

- 204 No Content: Reservation deleted
- 401 Unauthorized: Not logged in or event is inactive

#### POST /check-availability

Check which seats are available for given attendance buckets. This is useful before updating attendance or creating a reservation.

**Request Body:**

```json
{
  "attendanceBuckets": [1, 1, 0, 1]
}
```

**Response:**

```json
{
  "availableSeatIds": [1, 2, 3, 5, 7, 10]
}
```

**Status Codes:**

- 200 OK: Returns list of available seat IDs
- 400 Bad Request: Invalid input
- 500 Internal Server Error: Unable to check availability

**Use Case:**
This endpoint allows users to preview which seats are available before:

- Creating a new seat reservation
- Updating their attendance time buckets (which deletes their current reservation)

### Admin Endpoints

Admins can manage all reservations. Add `?as_admin=true` to the request.

#### GET /?as_admin=true

Get all seat reservations for the event.

**Response:**

```json
[
  {
    "id": 1,
    "eventId": 1,
    "seatId": 5,
    "invitationEmail": "user1@example.com",
    "attendanceBuckets": [1, 1, 0, 1],
    "createdAt": "2025-11-15T22:00:00Z",
    "lastModified": "2025-11-15T22:00:00Z"
  },
  {
    "id": 2,
    "eventId": 1,
    "seatId": null,
    "invitationEmail": "user2@example.com",
    "attendanceBuckets": [1, 1, 1, 1],
    "createdAt": "2025-11-15T23:00:00Z",
    "lastModified": "2025-11-15T23:00:00Z"
  }
]
```

#### PUT /{email}?as_admin=true

Update a specific user's seat reservation.

**Request Body:** Same as user POST

**Status Codes:**

- 200 OK: Reservation updated
- 400 Bad Request: Invalid input
- 404 Not Found: No reservation for this email
- 409 Conflict: New seat/time conflicts with another reservation

#### DELETE /{email}?as_admin=true

Delete a specific user's seat reservation.

**Status Codes:**

- 204 No Content: Reservation deleted

## Business Rules & Invariants

### Invariants

1. **One Reservation Per User**: Each user can have at most one seat reservation per event
2. **No Double-Booking**: A specific seat cannot be reserved by multiple users for overlapping time periods
3. **Unspecified Seats Have No Conflicts**: Multiple users can have unspecified seat reservations simultaneously
4. **Invitation Required**: Users can only reserve seats for events they're invited to
5. **Bucket Count Must Match**: Attendance buckets must match the event's duration (calculated from start/end times)
6. **Attendance Sync**: When a user updates their invitation attendance buckets via `/events/{eventId}/invitations`, any existing seat reservation is automatically deleted to maintain consistency

### Important: Attendance Updates and Seat Reservations

**When a user updates their event attendance via the invitation endpoint:**

1. Their seat reservation is automatically deleted
2. They must create a new seat reservation after updating attendance
3. Use the `/check-availability` endpoint before updating attendance to see which seats will be available with the new time buckets

**Recommended UI Flow:**

1. User wants to change attendance times
2. Call `/check-availability` with new attendance buckets to show available seats
3. User confirms attendance change (knowing their current reservation will be deleted)
4. Update invitation attendance via `/events/{eventId}/invitations`
5. User creates new seat reservation with desired seat

This design ensures seat reservations always match the user's actual attendance times and prevents seats from being blocked during times when users won't be attending.

### Validation Rules

1. **Seat Exists**: If `seatId` is provided, the seat must exist and belong to the event
2. **Seating Enabled**: Event must have seating configured (`has_seating = true`)
3. **Unspecified Allowed**: If `seatId` is `null`, event must allow unspecified seats (`allow_unspecified_seat = true`)
4. **Active Event**: Non-admins can only manage reservations for active (non-past) events
5. **Correct Email**: Users can only manage their own reservations (admins can manage any)

### Error Conditions

| Error                   | HTTP Status      | Description                                               |
| ----------------------- | ---------------- | --------------------------------------------------------- |
| No invitation           | 400 Bad Request  | User is not invited to the event                          |
| Seat doesn't exist      | 400 Bad Request  | Invalid `seatId`                                          |
| Seat wrong event        | 400 Bad Request  | Seat belongs to a different event                         |
| Wrong bucket count      | 400 Bad Request  | `attendanceBuckets` length doesn't match event duration   |
| Unspecified not allowed | 400 Bad Request  | Event doesn't allow unspecified seats                     |
| No seating config       | 400 Bad Request  | Event has no seating configuration                        |
| Already has reservation | 409 Conflict     | User already has a reservation (use PUT to update)        |
| Seat conflict           | 409 Conflict     | Another user has reserved this seat for overlapping times |
| Event inactive          | 401 Unauthorized | Event has already ended (non-admin)                       |
| Not found               | 404 Not Found    | No reservation exists for this user                       |

## Implementation Details

### Conflict Detection Algorithm

```rust
fn has_bucket_overlap(buckets1: &[u8], buckets2: &[u8]) -> bool {
    if buckets1.len() != buckets2.len() {
        return false;
    }

    for (b1, b2) in buckets1.iter().zip(buckets2.iter()) {
        if *b1 == 1 && *b2 == 1 {
            return true;  // Both users want this time slot
        }
    }

    false
}
```

This algorithm:

1. Ensures both reservations have the same number of buckets
2. Checks each bucket pair
3. Returns `true` if any bucket has `1` in both arrays (overlap)

### Repository Layer

**Location:** `api/src/repositories/seat_reservation.rs`

Key functions:

- `get_all_by_event(pool, event_id)` - Get all reservations for an event
- `get_by_email(pool, event_id, email)` - Get a user's reservation
- `get_by_seat(pool, seat_id)` - Get all reservations for a seat (for conflict checks)
- `create(pool, event_id, seat_id, email, buckets)` - Create a reservation
- `update(pool, reservation_id, seat_id, buckets)` - Update a reservation
- `delete_by_email(pool, event_id, email)` - Delete a reservation

### Controller Layer

**Location:** `api/src/controllers/seat_reservation.rs`

Responsibilities:

- Validate inputs (seat exists, bucket count correct, etc.)
- Check permissions (event active, user authorized)
- Perform conflict detection
- Call repository functions
- Return appropriate errors

### Routes Layer

**Location:** `api/src/routes/seat_reservations.rs`

Responsibilities:

- Define HTTP endpoints and methods
- Parse request bodies
- Authenticate users (via `User` or `AdminUser` guards)
- Call controller functions
- Format responses and error codes

## Testing

### Unit Tests

Location: `api/src/controllers/seat_reservation.rs`

Tests for bucket overlap detection:

- `test_has_bucket_overlap_no_overlap` - Different time slots, no conflict
- `test_has_bucket_overlap_with_overlap` - Same time slots, conflict
- `test_has_bucket_overlap_all_overlap` - Complete overlap
- `test_has_bucket_overlap_no_attendance` - No one attending
- `test_has_bucket_overlap_different_lengths` - Mismatched arrays
- `test_has_bucket_overlap_single_overlap` - Single bucket overlap

### Integration Test Scenarios (To Be Implemented)

1. **Happy Path:**

   - Create reservation for an available seat
   - Update reservation to different time
   - Delete reservation

2. **Conflict Detection:**

   - Try to reserve a seat that's already taken for the same time
   - Verify conflict error
   - Reserve for a different time, succeeds

3. **Unspecified Seat:**

   - Multiple users reserve unspecified seats
   - All succeed (no conflicts)

4. **Validation:**

   - Try to reserve non-existent seat
   - Try with wrong bucket count
   - Try for event you're not invited to

5. **Permissions:**
   - User tries to manage another user's reservation
   - Admin manages any user's reservation

## Future Enhancements

Potential improvements for future iterations:

- **Visual seat map** showing availability by time bucket
- **Seat categories** (e.g., VIP, standard, standing)
- **Bulk reservation** for groups
- **Seat swapping** between users
- **Waitlist** for fully booked seats
- **Reservation time limits** (e.g., release after 24 hours)
- **Email notifications** for reservation confirmations
- **Seat capacity** management and warnings
