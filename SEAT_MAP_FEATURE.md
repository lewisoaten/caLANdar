# Event Seat Map Feature

## Overview

The Event Seat Map is a read-only view that allows gamers to see the visual room layout and live seat occupancy for any LAN event they are attending. This feature helps attendees see which seats are available and who is sitting where.

## Accessing the Seat Map

1. **Navigate to an Event**: Click on an event from your Events list
2. **Open the Event Menu**: In the left sidebar, you'll see an expanded Event submenu when viewing an event
3. **Click "Seat Map"**: The Seat Map option appears below "Games" in the Event submenu

## What You'll See

### Summary Statistics

At the top of the page, you'll see key statistics:

- **Total Seats**: Total number of seats configured for the event
- **Occupied Seats**: How many seats are currently reserved
- **Available Seats**: How many seats are still available
- **Unspecified Seats**: Number of attendees who have reserved but not chosen a specific seat (if enabled)

### Room Floorplans

For each room with configured seats:

#### Visual Floorplan (if available)

- Room layout image with seat markers overlaid
- **Green seats** (with chair icon): Available seats
- **Blue seats** (with avatar): Occupied seats showing the gamer's avatar
- Hover over any seat to see:
  - Seat label (e.g., "A1")
  - Occupant name (for occupied seats)
  - Seat description (if configured)

#### List View

Below each floorplan (or instead of it if no image):

- Card-based list of all seats in the room
- Each card shows:
  - Seat label
  - Occupant avatar and handle (if occupied)
  - "Available" status (if not occupied)
- Color-coded borders:
  - Green border = Available
  - Blue border = Occupied

### Unspecified Seat Attendees

If the event allows unspecified seats, a separate section shows:

- List of attendees who haven't selected a specific seat
- Their avatar and gamer handle
- Labeled as "Unspecified Seat"

## Features

### Read-Only View

- This is a **view-only** feature - you cannot select or reserve seats from this page
- To select a seat, use the RSVP wizard when RSVPing to the event
- Admins can manage seat assignments through the Event Management page

### Live Data

- The seat map shows real-time occupancy
- Refresh the page to see the latest seat assignments

### Mobile-Friendly

- Responsive design adapts to phone, tablet, and desktop screens
- Touch-friendly card interface on mobile devices
- Floorplan images scale appropriately

### Accessibility

- All seat markers have descriptive labels for screen readers
- Keyboard navigable structure
- High-contrast color coding
- Tooltips provide additional context

## Understanding Seat Status

| Visual   | Status      | Description                                         |
| -------- | ----------- | --------------------------------------------------- |
| 🪑 Green | Available   | No one has reserved this seat                       |
| 👤 Blue  | Occupied    | Someone has reserved this seat (shows their avatar) |
| 🪑 Gray  | Unspecified | Attendee reserved but didn't choose a specific seat |

## Frequently Asked Questions

### Can I select a seat from the Seat Map?

No, the Seat Map is read-only. To select a seat:

1. Navigate to the Event page
2. Click "Edit RSVP" or RSVP if you haven't yet
3. Use the RSVP wizard to select your seat

### Why don't I see who is sitting in each seat?

The Seat Map shows the gamer handle and avatar for each occupied seat. If you're not seeing this information:

- The attendee may not have set their gamer handle
- The event may be using email addresses instead of handles
- Try refreshing the page

### The seat I wanted is occupied - what can I do?

- Check if other suitable seats are available
- Consider an unspecified seat if the event allows it
- Contact the event organizer if you have special requirements
- Select a seat early when RSVPing to events

### Can I see this for events I'm not attending?

No, you need to be invited and logged in to view an event's seat map.

### Does this work if seating isn't enabled?

If the event organizer hasn't enabled seating or configured rooms/seats, you'll see a message indicating that seating is not enabled for the event.

## For Event Organizers

As an event organizer, you can:

- Configure seating in the Event Management page
- Set up rooms and seats with visual floorplans
- View detailed seat occupancy through the Admin > Seat Occupancy panel
- Manage attendee seat assignments

See the Event Management documentation for more details on configuring seating.
