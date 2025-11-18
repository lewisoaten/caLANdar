# Admin Seat Occupancy Interface - Visual Documentation

This document provides a visual description of the Admin Seat Occupancy Overview interface.

## Interface Layout

```
┌─────────────────────────────────────────────────────────────────┐
│                    Seat Occupancy Overview                      │
│              Manage seat assignments for all attendees          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│  │ Total    │  │ Occupied │  │Unspecified│  │  Total   │      │
│  │ Seats    │  │  Seats   │  │  Seats    │  │Reservation│     │
│  │    42    │  │    35    │  │     3     │  │    38    │      │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘      │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                        Occupancy Map                            │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ Main Hall                            35/40 occupied      │  │
│  │ Primary gaming room                                      │  │
│  │                                                           │  │
│  │ [A1] [A2] [A3] [A4] [A5] [A6] [A7] [A8] [A9] [A10]      │  │
│  │ [B1] [B2] [B3] [B4] [B5] [B6] [B7] [B8] [B9] [B10]      │  │
│  │ [C1] [C2] [C3] [C4] [C5] [C6] [C7] [C8] [C9] [C10]      │  │
│  │ [D1] [D2] [D3] [D4] [D5] [D6] [D7] [D8] [D9] [D10]      │  │
│  │                                                           │  │
│  │ Legend: [■] = Occupied  [□] = Available                  │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ VIP Lounge                           3/5 occupied        │  │
│  │ Premium seating area                                     │  │
│  │                                                           │  │
│  │ [VIP-1] [VIP-2] [VIP-3] [VIP-4] [VIP-5]                 │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                      Seat Assignments                           │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐│
│ │Attendee        │Room      │Seat │Attendance    │Actions    ││
│ ├────────────────┼──────────┼─────┼──────────────┼───────────┤│
│ │[👤] John Doe   │Main Hall │ A1  │[■][■][□][□] │ [⇄] [🗑️] ││
│ │john@email.com  │          │     │              │           ││
│ ├────────────────┼──────────┼─────┼──────────────┼───────────┤│
│ │[👤] Jane Smith │Main Hall │ B5  │[■][■][■][■] │ [⇄] [🗑️] ││
│ │jane@email.com  │          │     │              │           ││
│ ├────────────────┼──────────┼─────┼──────────────┼───────────┤│
│ │[👤] Bob Wilson │VIP Lounge│VIP-1│[■][□][■][□] │ [⇄] [🗑️] ││
│ │bob@email.com   │          │     │              │           ││
│ └────────────────┴──────────┴─────┴──────────────┴───────────┘│
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                   Unspecified Seat Attendees                    │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐│
│ │Attendee               │Attendance         │Actions          ││
│ ├───────────────────────┼───────────────────┼─────────────────┤│
│ │[👤] Alice Brown       │[■][■][□][■]      │ [✏️] [🗑️]      ││
│ │alice@email.com        │                   │                 ││
│ ├───────────────────────┼───────────────────┼─────────────────┤│
│ │[👤] Charlie Davis     │[□][■][■][■]      │ [✏️] [🗑️]      ││
│ │charlie@email.com      │                   │                 ││
│ └───────────────────────┴───────────────────┴─────────────────┘│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Component Descriptions

### 1. Summary Statistics Cards

Four cards displaying key metrics:

- **Total Seats**: Number of physical seats configured
- **Occupied Seats**: Seats with at least one reservation
- **Unspecified Seats**: Count of attendees without specific seats
- **Total Reservations**: Total number of seat reservations

**Visual Design**:

- White cards with subtle shadow
- Large numbers (h4 typography)
- Gray descriptive text
- Responsive grid (4 columns on desktop, stacks on mobile)

### 2. Occupancy Map

Room-based visualization showing all seats:

**Features**:

- One card per room
- Room name and description in header
- Occupancy ratio in chip (e.g., "35/40 occupied")
- Seats displayed as chips in grid layout
- Color coding:
  - Blue filled = Occupied
  - Gray outlined = Available
- Hover tooltip shows seat details
- Responsive: wraps on smaller screens

**Example Seat Chip**:

```
[A1]  or  [A1]
Blue      Gray
```

### 3. Seat Assignments Table

Comprehensive table of all assigned seats:

**Columns**:

1. **Attendee**: Avatar + handle/email
2. **Room**: Room name
3. **Seat**: Seat label as blue chip
4. **Attendance**: Visual bucket indicators
5. **Actions**: Move and delete buttons

**Attendance Bucket Visualization**:

```
[■][■][□][□]
Green squares = attending
Gray squares = not attending
```

**Action Icons**:

- ⇄ (Swap icon): Move to different seat
- 🗑️ (Delete icon): Clear seat assignment

**Accessibility**:

- Semantic table structure
- Column headers properly labeled
- Row hover effect
- Clear aria-labels on buttons

### 4. Unspecified Seat Attendees Table

Separate table for attendees without specific seats:

**Columns**:

1. **Attendee**: Avatar + handle/email
2. **Attendance**: Visual bucket indicators
3. **Actions**: Assign and delete buttons

**Action Icons**:

- ✏️ (Edit icon): Assign to specific seat
- 🗑️ (Delete icon): Clear reservation

**Conditional Display**: Only shown if event allows unspecified seats

### 5. Move/Assign Dialog

Modal dialog for changing seat assignments:

```
┌─────────────────────────────────────────┐
│  Move to Different Seat            [×]  │
├─────────────────────────────────────────┤
│                                         │
│  Attendee                               │
│  John Doe                               │
│                                         │
│  Current Seat                           │
│  A1 (Main Hall)                         │
│                                         │
│  New Seat ▼                             │
│  ┌─────────────────────────────────┐   │
│  │ Unspecified Seat                │   │
│  │ ──────────────────────────────  │   │
│  │ Main Hall                       │   │
│  │   A2                            │   │
│  │   A3                            │   │
│  │   B1                            │   │
│  │ ──────────────────────────────  │   │
│  │ VIP Lounge                      │   │
│  │   VIP-2                         │   │
│  │   VIP-3                         │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ⚠️ This will check for conflicts      │
│  with existing reservations             │
│                                         │
│          [Cancel]  [Confirm Move]       │
└─────────────────────────────────────────┘
```

**Features**:

- Shows current assignment
- Dropdown organized by room
- Unspecified seat option (if enabled)
- Warning about conflict checking
- Loading state during operation

## Color Scheme

### Seat Status Colors

- **Occupied**: Blue (#1976d2 - MUI primary)
- **Available**: Gray (#0003 - MUI action.disabled)
- **Success**: Green (#2e7d32 - MUI success)
- **Error**: Red (#d32f2f - MUI error)

### Attendance Buckets

- **Attending**: Green (#2e7d32)
- **Not Attending**: Light gray (#0001)
- **Border**: Divider color

### UI Elements

- **Cards**: White background with elevation shadow
- **Tables**: Alternating row hover (rgba(0,0,0,0.04))
- **Chips**: Material-UI default colors
- **Buttons**: Material-UI icon buttons

## Responsive Breakpoints

### Desktop (≥900px)

- Summary cards: 4 columns
- Tables: Full width with all columns visible
- Occupancy chips: Multiple columns

### Tablet (600-900px)

- Summary cards: 2 columns
- Tables: Horizontal scroll if needed
- Occupancy chips: Wrap to multiple rows

### Mobile (<600px)

- Summary cards: 1 column (stacked)
- Tables: Horizontal scroll
- Dialogs: Full width
- Touch-friendly buttons (≥44px)

## Keyboard Navigation

### Tab Order

1. Summary statistics (not interactive)
2. Occupancy map chips (not interactive, but focusable for tooltips)
3. Seat assignments table:
   - Move button (⇄)
   - Delete button (🗑️)
   - Repeat for each row
4. Unspecified seats table:
   - Assign button (✏️)
   - Delete button (🗑️)
   - Repeat for each row

### Keyboard Actions

- **Tab**: Navigate to next element
- **Shift+Tab**: Navigate to previous element
- **Enter/Space**: Activate button
- **Escape**: Close dialog
- **Arrow Keys**: Navigate dropdown in dialog

## Screen Reader Experience

### Table Announcements

"Seat assignments table"
"Table with 3 columns and 35 rows"
"Column 1: Attendee"
"Column 2: Room"
"Column 3: Seat"
"Column 4: Attendance"
"Column 5: Actions"

### Row Announcements

"Row 1: John Doe, john@email.com, Main Hall, Seat A1, Attendance 4 buckets, Actions: Move, Delete"

### Button Announcements

"Move john@email.com to different seat"
"Clear seat assignment for john@email.com"
"Assign alice@email.com to specific seat"

### Status Announcements

"Seat assignment updated successfully"
"This seat is already reserved for the selected times"
"Seat assignment cleared successfully"

## Mobile Experience

### Portrait Mode

- Summary cards stack vertically
- Tables scroll horizontally
- Seat chips wrap to multiple rows
- Dialog takes full width

### Landscape Mode

- Similar to tablet layout
- More horizontal space for tables
- Dialogs slightly wider

### Touch Interactions

- All buttons ≥44px tap target
- No hover effects (replaced with :active states)
- Smooth scrolling for tables
- Pull-to-refresh disabled

## Error States

### Conflict Error

```
┌─────────────────────────────────────┐
│  ⚠️ Seat Conflict                   │
│                                     │
│  This seat is already reserved for  │
│  one or more of the selected time   │
│  periods. Please choose a different │
│  seat.                              │
│                                     │
│              [OK]                   │
└─────────────────────────────────────┘
```

### Network Error

```
Snackbar notification (bottom-left):
┌─────────────────────────────────┐
│ ❌ Failed to update seat        │
│    assignment                   │
└─────────────────────────────────┘
```

### No Seating Enabled

```
┌─────────────────────────────────┐
│  Seating is not enabled for     │
│  this event.                    │
└─────────────────────────────────┘
```

## Loading States

### Initial Load

```
┌─────────────────────────────────┐
│          [Spinner]              │
│  Loading seat occupancy data... │
└─────────────────────────────────┘
```

### Moving Seat

```
Dialog shows:
[Cancel]  [Moving... ⏳]
Button is disabled during operation
```

## Empty States

### No Reservations

```
┌─────────────────────────────────┐
│  ℹ️ No seat reservations found. │
└─────────────────────────────────┘
```

### No Unspecified Seats

```
┌─────────────────────────────────┐
│  ℹ️ No unspecified seat         │
│     reservations.               │
└─────────────────────────────────┘
```

### No Rooms Configured

```
┌─────────────────────────────────┐
│  ℹ️ No rooms configured for     │
│     this event.                 │
└─────────────────────────────────┘
```

## Animation and Transitions

- **Card elevation**: Smooth shadow transition on hover
- **Dialog**: Fade in/out (150ms)
- **Snackbar**: Slide in from bottom-left
- **Button states**: Instant color change on click
- **Table rows**: Subtle background change on hover

## Summary

The Admin Seat Occupancy interface provides:

✅ **Visual clarity**: Color-coded seats, clear status indicators
✅ **Information density**: Summary stats, detailed tables, occupancy maps
✅ **Ease of use**: Intuitive actions, clear labels, helpful tooltips
✅ **Accessibility**: Full keyboard support, screen reader friendly
✅ **Responsiveness**: Works on all device sizes
✅ **Error handling**: Clear feedback for all operations

This interface enables admins to efficiently manage seat assignments for their events with confidence and ease.
