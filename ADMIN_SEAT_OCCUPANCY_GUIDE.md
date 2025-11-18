# Admin Seat Occupancy Management Guide

This guide explains how to use the Admin Seat Occupancy Overview feature to manage seat assignments for your CaLANdar events.

## Overview

The Admin Seat Occupancy feature provides event organizers with a comprehensive view of seat reservations and the ability to manually adjust seat assignments for attendees. This is useful for:

- Resolving seating conflicts
- Accommodating last-minute changes
- Grouping attendees together
- Assigning seats to attendees who haven't selected one
- Managing special seating requirements

## Accessing the Seat Occupancy View

1. Log in to CaLANdar as an admin
2. Navigate to **Event Management** for your event
3. Scroll down to the **Seat Occupancy Overview** section

The Seat Occupancy Overview appears after the room/seat management sections and before the invitations table.

## Understanding the Seat Occupancy View

### Summary Statistics

At the top of the view, you'll see four summary cards:

- **Total Seats**: The total number of physical seats configured for all rooms
- **Occupied Seats**: How many seats currently have at least one reservation
- **Unspecified Seats**: Number of attendees who have reserved "unspecified" seats
- **Total Reservations**: Total number of seat reservations (may exceed occupied seats if people have different attendance times)

### Occupancy Map

The occupancy map shows a visual overview of seat usage by room:

- Each room is displayed in a separate card
- Seats are shown as colored chips:
  - **Blue (filled)**: Seat is occupied by one or more attendees
  - **Gray (outlined)**: Seat is available
- The chip label shows the seat identifier (e.g., "A1", "B3")
- Hover over a seat chip to see how many reservations it has
- The room card header shows occupancy ratio (e.g., "5/10 occupied")

### Seat Assignments Table

The main table shows all current seat reservations with the following columns:

- **Attendee**: User's avatar, handle, and email address
- **Room**: The room name where the seat is located
- **Seat**: The specific seat label (shown as a blue chip)
- **Attendance**: Visual representation of time buckets the attendee will be present
  - Green squares = Attending during that time period
  - Gray squares = Not attending during that time period
- **Actions**: Buttons to move or clear the assignment

### Unspecified Seat Attendees

If your event allows unspecified seat reservations, a separate section shows:

- Attendees who have reserved a spot but haven't chosen a specific seat
- Their attendance time buckets
- Actions to assign them to a specific seat or clear their reservation

## Managing Seat Assignments

### Moving an Attendee to a Different Seat

1. In the Seat Assignments table, click the **swap icon** (⇄) for the attendee you want to move
2. In the dialog that opens:
   - Review the attendee's current seat
   - Select a new seat from the dropdown menu (organized by room)
   - Optionally select "Unspecified Seat" if allowed
3. Click **Confirm Move**

**Important**: The system will check for conflicts:
- If another attendee already has the seat during overlapping time periods, you'll see an error
- The move will only succeed if the seat is available for all of the attendee's time buckets
- Conflict errors show a user-friendly message explaining the issue

### Assigning an Unspecified Seat to a Specific Seat

1. In the Unspecified Seat Attendees table, click the **edit icon** (✏️)
2. Select a specific seat from the dropdown
3. Click **Confirm Move**

The attendee will now have a specific seat assigned and will appear in the main Seat Assignments table.

### Clearing a Seat Assignment

1. In either table, click the **delete icon** (🗑️) for the attendee
2. Confirm the action in the confirmation dialog
3. The seat assignment will be removed

**Note**: This removes the entire seat reservation. If the event allows unspecified seats, you may want to move them to an unspecified seat instead of deleting entirely.

## Keyboard Navigation

The Seat Occupancy view is fully keyboard-accessible:

### Navigating the Tables

- **Tab**: Move between interactive elements (buttons, dropdowns, etc.)
- **Shift+Tab**: Move backwards
- **Enter/Space**: Activate buttons
- **Arrow Keys**: Navigate within dropdown menus

### Screen Reader Support

- All tables have proper ARIA labels and roles
- Seat status is announced (e.g., "Seat A1, occupied" or "Seat B2, available")
- Actions have descriptive labels (e.g., "Move user@example.com to different seat")
- Summary statistics are announced clearly
- Dialog titles and content are properly structured

## Mobile and Tablet Usage

The Seat Occupancy view is responsive and works on mobile devices:

- Summary cards stack vertically on small screens
- Tables scroll horizontally if needed
- Touch-friendly button sizes (minimum 44x44 pixels)
- Dialogs adapt to screen size
- All features are accessible on mobile

## Understanding Attendance Buckets

Attendance buckets represent time periods during the event:

- Each event is divided into 6-hour periods starting at 6 AM
- Buckets are displayed as small colored squares
- Green = Attendee will be present
- Gray = Attendee will not be present

**Example**: For a Friday 6 PM - Sunday 6 PM event:
- Friday: 6 PM-12 AM (1 bucket)
- Saturday: 6 AM-6 PM (4 buckets)
- Sunday: 6 AM-12 PM, 12 PM-6 PM (2 buckets)
- Total: 7 buckets

Seat conflicts occur when two attendees have overlapping green buckets for the same seat.

## Conflict Resolution

### Understanding Conflicts

A conflict occurs when:
1. Two or more attendees want the same seat
2. Their attendance times overlap (at least one matching green bucket)

### Resolving Conflicts Manually

1. Identify the conflict (you'll see an error when trying to assign a seat)
2. Review both attendees' attendance patterns in the table
3. Options:
   - Move one attendee to a different seat
   - Move one attendee to an unspecified seat (if allowed)
   - Adjust the attendees' attendance times (in the invitations management)
   - Clear one of the reservations

### Best Practices

- Check the occupancy map before moving attendees
- Consider grouping friends/teams in nearby seats
- Leave some buffer seats available for last-minute changes
- Communicate with attendees before making changes to their seats
- Document any special seating arrangements

## Special Cases

### Pseudo-Seats (Unspecified Seats)

- Unspecified seats are virtual - multiple attendees can reserve them
- They don't correspond to a physical seat location
- Useful for events where some attendees don't need assigned seating
- Shown separately in their own section
- Can be converted to specific seats at any time

### Part-Time Attendance

- Attendees can attend for only part of the event
- The same physical seat can be used by different people at different times
- The attendance bucket visualization helps you see these patterns
- The system automatically prevents conflicts by checking bucket overlap

### Empty Seats

- Seats with no reservations appear as gray outlined chips in the occupancy map
- They don't appear in the seat assignments table
- Available for assignment at any time

## Troubleshooting

### "This seat is already reserved for one or more of the selected time periods"

**Cause**: Another attendee has the seat during an overlapping time.

**Solution**:
1. Check the seat's current reservations in the occupancy map
2. Choose a different seat, or
3. Review the conflicting attendee's attendance pattern
4. Adjust one of the attendees' time buckets if appropriate

### Attendee doesn't appear in the tables

**Possible causes**:
- They haven't RSVP'd "Yes" to the event
- They haven't completed the RSVP wizard
- They don't have a seat reservation (check unspecified seats)
- They haven't been invited to the event

**Solution**: Check the Invitations table below the Seat Occupancy section.

### Changes aren't showing up

**Solution**: The view refreshes automatically after each action. If it doesn't:
1. Check your network connection
2. Refresh the entire Event Management page
3. Check the browser console for errors

### Dialog or buttons aren't working on mobile

**Solution**:
1. Ensure you're using a modern browser (Chrome, Safari, Firefox, Edge)
2. Try rotating your device if in landscape mode
3. Zoom out if the view is too large
4. Close other dialogs or popups that might be interfering

## Tips and Best Practices

### For Large Events

- Use the room organization to group similar attendees
- Reserve some "flex" seats for last-minute adjustments
- Consider creating specific rooms for VIP, staff, or special groups
- Use descriptive seat labels (e.g., "VIP-1", "Team-A-1")

### For Multi-Day Events

- Pay attention to attendance buckets when assigning seats
- Consider having different seating arrangements for different days
- Allow partial attendees to use unspecified seats

### Accessibility Considerations

- Place attendees with mobility issues near entrances/exits
- Group attendees who need assistive technology together
- Document special seating needs in the seat description field
- Consider wheelchair-accessible seat locations

### Communication

- Notify attendees before changing their seat assignments
- Provide a seating chart or map to attendees
- Include seat information in confirmation emails
- Have a help desk or contact point for seating questions

## Related Documentation

- **SEAT_SELECTION_USER_GUIDE.md**: How attendees select their own seats
- **SEAT_SELECTION_DEVELOPER_GUIDE.md**: Technical implementation details
- **ROOMS_AND_SEATS.md**: Setting up rooms and seats
- **RSVP_WIZARD_DOCUMENTATION.md**: How the RSVP process works

## Getting Help

If you encounter issues or have questions:

1. Check this guide and related documentation
2. Review the event's seating configuration
3. Check the browser console for error messages
4. Contact the development team with:
   - Event ID
   - Attendee email (if relevant)
   - Screenshot of the issue
   - Steps to reproduce

## Summary

The Admin Seat Occupancy Overview provides powerful tools for managing event seating:

- ✅ Visual occupancy map for quick assessment
- ✅ Detailed table view with attendee information
- ✅ Move/assign functionality with conflict prevention
- ✅ Support for unspecified seats
- ✅ Keyboard and screen reader accessible
- ✅ Mobile-responsive design
- ✅ Real-time updates and feedback

Use this feature to ensure your attendees have the best seating experience possible!
