# Seat Selection Developer Guide

This guide provides technical details for developers working with the seat selection feature in CaLANdar.

## Architecture Overview

The seat selection feature consists of:

- **Frontend Component**: `SeatSelector.tsx` - React component for UI
- **Backend API**: Seat reservation endpoints (already implemented)
- **Integration**: Event page integration for gamer-facing seat selection

## Frontend Implementation

### Component: SeatSelector

**Location**: `frontend/src/components/SeatSelector.tsx`

**Purpose**: Provides a user interface for gamers to select seats for an event.

**Key Features**:

- Visual seat map overlay on floorplan images
- List view for keyboard/screen reader accessibility
- Real-time availability checking
- Conflict detection and error handling
- Mobile-responsive with touch-friendly targets
- Full keyboard navigation support

**Props**:

```typescript
interface SeatSelectorProps {
  eventId: number; // Event ID
  attendanceBuckets: number[] | null; // User's attendance time buckets
  disabled: boolean; // Disable all interactions
  onReservationChange?: () => void; // Callback when reservation changes
}
```

**Component State**:

- `rooms`: Array of Room objects for the event
- `seats`: Array of Seat objects across all rooms
- `seatingConfig`: Event seating configuration
- `currentReservation`: User's current seat reservation (if any)
- `availableSeats`: Array of seat IDs available for current attendance
- `loading`: Loading state for API operations
- `dataLoaded`: Initial data fetch completed

**Data Flow**:

1. Component mounts and fetches seating config
2. If seating is enabled, fetches rooms and seats
3. Fetches user's current reservation (if exists)
4. Checks seat availability for attendance buckets
5. User selects a seat → API call → Update state → Callback

### Type Definitions

**Location**: `frontend/src/types/seat_reservations.tsx`

**Types**:

```typescript
// Main reservation object
export type SeatReservation = {
  id: number;
  eventId: number;
  seatId: number | null; // null = unspecified seat
  invitationEmail: string;
  attendanceBuckets: number[];
  createdAt: moment.Moment;
  lastModified: moment.Moment;
};

// For creating/updating reservations
export type SeatReservationSubmit = {
  seatId: number | null;
  attendanceBuckets: number[];
};

// For checking availability
export type SeatAvailabilityRequest = {
  attendanceBuckets: number[];
};

export type SeatAvailabilityResponse = {
  availableSeatIds: number[];
};
```

### Integration with Event Page

**Location**: `frontend/src/components/Event.tsx`

**Changes Made**:

1. Import SeatSelector component and types
2. Add state for invitation data (for attendance buckets)
3. Fetch invitation data on mount and when responded changes
4. Conditionally render SeatSelector when:
   - Event is loaded
   - User has responded (not null)
   - User RSVP is not "No"

**Layout**:
The SeatSelector appears as a full-width panel below the Attendees and Game Suggestions panels.

## API Integration

The SeatSelector integrates with these backend endpoints:

### GET /api/events/{eventId}/seating-config?as_admin=true

Fetches event seating configuration.

**Usage in Component**:

```typescript
fetch(`/api/events/${eventId}/seating-config?as_admin=true`, {
  headers: {
    Authorization: "Bearer " + token,
  },
});
```

**Response**: EventSeatingConfig object

### GET /api/events/{eventId}/rooms?as_admin=true

Fetches all rooms for an event.

**Note**: Uses admin parameter but accessible to all authenticated users for read-only.

### GET /api/events/{eventId}/seats?as_admin=true

Fetches all seats for an event.

**Note**: Same admin access pattern as rooms.

### GET /api/events/{eventId}/seat-reservations/me

Fetches current user's seat reservation.

**Returns**:

- 200: SeatReservation object
- 404: No reservation found (user hasn't selected a seat yet)

### POST /api/events/{eventId}/seat-reservations/me

Creates a new seat reservation for current user.

**Request Body**: SeatReservationSubmit
**Responses**:

- 200: Created successfully
- 400: Invalid request (validation error)
- 409: Conflict (seat already reserved for those times)

### PUT /api/events/{eventId}/seat-reservations/me

Updates current user's existing seat reservation.

**Request Body**: SeatReservationSubmit
**Responses**: Same as POST

### DELETE /api/events/{eventId}/seat-reservations/me

Removes current user's seat reservation.

**Response**: 204 No Content on success

### POST /api/events/{eventId}/seat-reservations/check-availability

Checks which seats are available for given attendance buckets.

**Request Body**: SeatAvailabilityRequest
**Response**: SeatAvailabilityResponse

**Purpose**: Called when attendance buckets change to update seat availability in real-time.

## Error Handling

The component handles these error scenarios:

### 401 Unauthorized

- Calls signOut() from UserDispatchContext
- Redirects user to sign-in

### 404 Not Found (Reservation)

- Normal case when user hasn't selected a seat yet
- Sets currentReservation to null

### 409 Conflict

- Seat already reserved by another user
- Shows user-friendly error: "This seat is already reserved for the selected times. Please choose another seat."

### 400 Bad Request

- Validation error (e.g., wrong bucket count, seat doesn't exist)
- Shows error message from server

### General Errors

- Catches network errors
- Logs to console
- Shows generic error notification

## Accessibility Implementation

### Keyboard Navigation

**Seat Buttons in List View**:

- Tab order: Top to bottom, left to right
- Enter/Space: Select seat
- Disabled seats: tabindex="-1" (not focusable)

**Seat Markers on Floorplan**:

- Each seat has tabindex="0" (focusable)
- Role: "button"
- onKeyDown: Handles Enter and Space keys
- Focus ring: Clear outline on focus

### ARIA Labels

**Seat Buttons/Markers**:

```typescript
aria-label={`Seat ${seat.label}${
  seat.isOwnSeat ? " (your seat)" :
  seat.isOccupied ? " (occupied)" :
  " (available)"
}`}
```

**Seat Status Chips**:

- Clearly labeled: "Available", "Your Seat", "Occupied"
- Icons with text for clarity

**Interactive Elements**:

- All buttons have descriptive labels
- Loading states announced to screen readers

### Screen Reader Support

**Visual Hierarchy**:

- Semantic HTML (h2, h3, etc.)
- Proper heading levels
- Lists for seat collections

**Status Updates**:

- Success/error messages use Snackbar (notistack)
- Screen readers announce notifications

## Mobile Responsiveness

### Touch Targets

**Minimum Size**: 44x44 pixels (WCAG AA requirement)

**Implementation**:

```typescript
sx={{
  minWidth: 44,
  minHeight: 44,
  // ... other styles
}}
```

**Applied to**:

- Seat buttons in list view
- Seat markers on floorplan
- Action buttons (Select, Remove, etc.)

### Layout Adaptation

**Grid Breakpoints**:

```typescript
<Grid size={{ xs: 6, sm: 4, md: 3 }}>
  {/* Seat button */}
</Grid>
```

- xs (0-600px): 2 columns
- sm (600-900px): 3 columns
- md (900px+): 4 columns

**Room Cards**:

- Full width on all screen sizes
- Floorplan scales to container width
- List view grid adapts as above

### Interaction Patterns

**Floorplan Markers**:

- onClick: Primary interaction
- Hover effects: Disabled on touch devices (via CSS)
- No double-tap required (single tap selects)

**Buttons**:

- No hover-dependent functionality
- Clear focus/active states
- Large enough for thumb interaction

## Performance Considerations

### API Calls

**On Mount**:

- 3-4 parallel requests (config, rooms, seats, reservation)
- Uses Promise.then chains, not blocking

**On Attendance Change**:

- 1 request: check-availability
- Debounced via useEffect dependency

**On Seat Selection**:

- 1 request: POST or PUT reservation
- Loading state prevents multiple submissions

### Rendering

**Large Seat Lists**:

- React's efficient reconciliation
- Keys on seat IDs for stable identity

**Floorplan Overlay**:

- Absolute positioning (no layout thrashing)
- Percentage-based coordinates (no recalculation)

### Data Updates

**State Management**:

- Local component state (no global state needed)
- Callback for parent refresh (onReservationChange)

**Refetching**:

- On successful reservation change
- On attendance bucket change
- Not on every render

## Testing

### Test File Location

`frontend/src/__tests__/SeatSelector.test.tsx`

### Test Coverage

**Unit Tests** (provided, but may need MSW debugging):

- Renders correctly
- Shows/hides sections based on state
- Handles API responses
- Error handling
- Keyboard navigation
- Disabled state

**Integration Testing Approach**:

1. Use MSW to mock API endpoints
2. MemoryRouter for routing context
3. UserProvider for authentication context
4. SnackbarProvider for notifications

### Manual Testing Checklist

- [ ] Select a seat from list view
- [ ] Select a seat from floorplan view
- [ ] Change seat selection
- [ ] Remove reservation
- [ ] Select unspecified seat (if enabled)
- [ ] Try selecting occupied seat (should fail)
- [ ] Change attendance times (reservation should be removed)
- [ ] Keyboard navigation (Tab, Enter, Space)
- [ ] Screen reader compatibility
- [ ] Mobile touch interaction
- [ ] Network error handling
- [ ] Loading states

## Styling

### Theme Integration

Uses Material-UI theme:

- `theme.palette.primary.main`: Selected seat, buttons
- `theme.palette.success.main`: Available seats
- `theme.palette.action.disabledBackground`: Occupied seats
- `theme.palette.secondary.main`: Your seat border

### Frosted Glass Effect

Inherits from Event page's frostedGlassSx:

```typescript
sx={{
  backdropFilter: "blur(12px)",
  backgroundColor: alpha(theme.palette.background.paper, 0.4),
  // ... other styles
}}
```

### Responsive Utilities

Uses MUI Grid v2 system:

```typescript
import { Grid } from "@mui/material";

<Grid size={{ xs: 12, md: 6 }} />
```

## Future Enhancements

Potential improvements:

1. **Real-time Updates**: WebSocket for live seat availability
2. **Seat Categories**: VIP, standard, accessible, etc.
3. **Group Reservations**: Select multiple adjacent seats
4. **Seat Preferences**: Save preferred locations
5. **Waitlist**: Queue for full seats
6. **Seat Swapping**: Exchange seats with other users
7. **Seat Details**: More metadata (power outlets, view, etc.)
8. **Analytics**: Track popular seats, usage patterns

## Debugging

### Common Issues

**Component doesn't render**:

- Check: seatingConfig.hasSeating is true
- Check: API endpoints return 200 status
- Check: User has valid token in localStorage

**Seats don't appear**:

- Check: rooms and seats arrays populated
- Check: seats have correct roomId
- Check: API responses use camelCase (not snake_case)

**Availability check fails**:

- Check: attendanceBuckets is not null
- Check: attendanceBuckets is array of 1s and 0s
- Check: Bucket count matches event duration

**Keyboard navigation not working**:

- Check: tabindex is 0 or -1 (not undefined)
- Check: onKeyDown handler attached
- Check: Event propagation not stopped elsewhere

### Dev Tools

**React DevTools**:

- Inspect component state (rooms, seats, currentReservation)
- Check prop values (attendanceBuckets)
- Monitor re-renders

**Network Tab**:

- Check API endpoint URLs
- Inspect request/response bodies
- Verify status codes

**Console**:

- Error logs from catch blocks
- Network errors
- Component mount/unmount logs

## Code Style

Follows project conventions:

- **Linting**: ESLint with React plugin
- **Formatting**: Prettier
- **TypeScript**: Strict mode enabled
- **Naming**: camelCase for variables, PascalCase for components
- **Imports**: React imports first, then libraries, then local

### ESLint Rules Applied

- No unused variables
- Proper TypeScript types
- React hooks dependencies
- Accessibility (jsx-a11y)

### Pre-commit Hooks

Before committing changes:

```bash
just pre-commit
```

This runs:

- Prettier formatting
- ESLint linting
- TypeScript type checking

All must pass with exit code 0.

## Contributing

When modifying the SeatSelector:

1. **Maintain backward compatibility**: Don't break existing Event page integration
2. **Update types**: Keep TypeScript types in sync with API
3. **Test accessibility**: Verify keyboard nav and screen readers
4. **Test mobile**: Check on actual devices or browser DevTools
5. **Update documentation**: Keep this guide and user guide current
6. **Follow conventions**: Match existing code style
7. **Error handling**: Handle all error cases gracefully

## Questions?

For technical questions:

- Check the API documentation (SEAT_RESERVATIONS.md)
- Review the backend implementation (api/src/routes/seat_reservations.rs)
- Consult the rooms/seats documentation (ROOMS_AND_SEATS.md)
- Open an issue on GitHub with [Seat Selection] tag
