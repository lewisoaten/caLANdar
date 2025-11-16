# RSVP Wizard Flow Documentation

This document describes the new RSVP wizard flow implemented in this PR.

## Overview

The RSVP wizard replaces the previous inline auto-saving form with a guided multi-step modal dialog. Users are guided through the RSVP process with clear validation and a final review step before confirmation.

## User Interface

### Summary Card (Closed State)

When the wizard is closed, users see a compact summary card showing their current RSVP status:

```
┌─────────────────────────────────────────┐
│ Your RSVP                     [Edit]    │
├─────────────────────────────────────────┤
│ ● Yes                                   │
│                                         │
│ Handle                                  │
│ ProGamer123                             │
│                                         │
│ Attendance                              │
│ 4 time slots                            │
└─────────────────────────────────────────┘
```

### Wizard Flow (Open State)

The wizard is displayed as a modal dialog with a stepper at the top showing progress through the steps.

## Step-by-Step Flow

### For "No" Response (2 steps)

```
Step 1: Response Selection
┌─────────────────────────────────────────┐
│ RSVP to Summer LAN Party 2025          │
├─────────────────────────────────────────┤
│ ●────○────────○                        │
│ Response  Review                        │
│                                         │
│ Will you be attending?                  │
│                                         │
│  [Yes]  [Maybe]  [●No]                 │
│                                         │
│              [Cancel]  [Next]          │
└─────────────────────────────────────────┘

Step 2: Review
┌─────────────────────────────────────────┐
│ RSVP to Summer LAN Party 2025          │
├─────────────────────────────────────────┤
│ ●────────●                              │
│ Response  Review                        │
│                                         │
│ Review your RSVP                        │
│                                         │
│ ┌───────────────────────────────────┐  │
│ │ ✗ Response: No                    │  │
│ └───────────────────────────────────┘  │
│                                         │
│     [Cancel]  [Back]  [Confirm RSVP]  │
└─────────────────────────────────────────┘
```

### For "Yes/Maybe" Response (4-5 steps)

```
Step 1: Response Selection
┌─────────────────────────────────────────┐
│ RSVP to Summer LAN Party 2025          │
├─────────────────────────────────────────┤
│ ●────○────○────○────○                  │
│ Response  Handle  Attendance  Review    │
│                                         │
│ Will you be attending?                  │
│                                         │
│  [●Yes]  [Maybe]  [No]                 │
│                                         │
│              [Cancel]  [Next]          │
└─────────────────────────────────────────┘

Step 2: Gamer Handle
┌─────────────────────────────────────────┐
│ RSVP to Summer LAN Party 2025          │
├─────────────────────────────────────────┤
│ ●────●────○────○────○                  │
│ Response  Handle  Attendance  Review    │
│                                         │
│ Enter your gamer handle                 │
│ This is how you'll be identified to     │
│ other attendees.                        │
│                                         │
│ ┌─────────────────────────────────────┐│
│ │ ProGamer123                         ││
│ └─────────────────────────────────────┘│
│                                         │
│ ✓ Handle is valid!                     │
│                                         │
│     [Cancel]  [Back]  [Next]           │
└─────────────────────────────────────────┘

Step 3: Attendance Selection
┌─────────────────────────────────────────┐
│ RSVP to Summer LAN Party 2025          │
├─────────────────────────────────────────┤
│ ●────●────●────○────○                  │
│ Response  Handle  Attendance  Review    │
│                                         │
│ When will you be attending?             │
│ Select the times you plan to attend.    │
│                                         │
│ [Timeline visualization with toggles]   │
│                                         │
│     [Cancel]  [Back]  [Next]           │
└─────────────────────────────────────────┘

Step 4: Seat Selection (Optional - if seating enabled)
┌─────────────────────────────────────────┐
│ RSVP to Summer LAN Party 2025          │
├─────────────────────────────────────────┤
│ ●────●────●────●────○                  │
│ Response  Handle  Attendance  Seat  Review│
│                                         │
│ Choose your seat (Optional)             │
│ You can select a seat now or skip      │
│ this step and choose one later.         │
│                                         │
│ ℹ Seat selection will be available     │
│   after you complete your RSVP.         │
│                                         │
│ [Skip for now]                          │
│                                         │
│     [Cancel]  [Back]  [Next]           │
└─────────────────────────────────────────┘

Step 5: Review & Confirm
┌─────────────────────────────────────────┐
│ RSVP to Summer LAN Party 2025          │
├─────────────────────────────────────────┤
│ ●────●────●────●────●                  │
│ Response  Handle  Attendance  Review    │
│                                         │
│ Review your RSVP                        │
│                                         │
│ ┌───────────────────────────────────┐  │
│ │ ✓ Response: Yes                   │  │
│ │ 👤 Handle: ProGamer123            │  │
│ │ 📅 Attendance: 4 time slots       │  │
│ └───────────────────────────────────┘  │
│                                         │
│ After confirming, you'll be able to     │
│ view attendees, suggest games, and      │
│ select a seat (if available).           │
│                                         │
│     [Cancel]  [Back]  [Confirm RSVP]   │
└─────────────────────────────────────────┘
```

## Exit Warning

If the user tries to close the wizard without saving, they see:

```
┌─────────────────────────────────────────┐
│ Unsaved Changes                         │
├─────────────────────────────────────────┤
│ ⚠ Your RSVP has not been saved yet.    │
│                                         │
│ Current status: Not responded           │
│                                         │
│ Are you sure you want to exit without   │
│ saving your changes?                    │
│                                         │
│  [Continue Editing]  [Exit Without Saving]│
└─────────────────────────────────────────┘
```

## Key Features

### ✅ Validation Gates

- **Response step**: Must select Yes/Maybe/No to proceed
- **Handle step**: Must enter valid handle (2-50 characters)
- **Attendance step**: Must select at least one time slot
- **Seat step**: Optional, can skip
- **Review step**: Always valid

### ✅ Atomic Save

- No auto-saving during the wizard
- Only saves when user clicks "Confirm RSVP"
- All changes are atomic (succeed or fail together)

### ✅ Edit Mode

- Wizard pre-fills with existing RSVP data
- Can modify any field
- Shows what the previous response was in exit warning

### ✅ Accessibility

- Keyboard navigation support
- ARIA labels on all interactive elements
- Clear focus indicators
- Screen reader friendly

### ✅ Responsive Design

- Works on mobile and desktop
- Material-UI Dialog with proper breakpoints
- Touch-friendly buttons (minimum 44px tap targets)

## Code Changes

### Components Created

- `RSVPWizard.tsx` - Main wizard orchestrator (334 lines)
- `RSVPResponseStep.tsx` - Step 1: Response selection
- `GamerHandleStep.tsx` - Step 2: Handle input with validation
- `AttendanceStep.tsx` - Step 3: Attendance selection
- `SeatSelectionStep.tsx` - Step 4: Seat selection (placeholder)
- `ReviewStep.tsx` - Final step: Review before confirmation
- `RSVPSummary.tsx` - Compact summary card with edit button

### Component Modified

- `Event.tsx` - Replaced InvitationResponse with RSVPSummary and wizard

### API Integration

- Reuses existing PATCH `/api/events/{id}/invitations/{email}` endpoint
- Only makes API call on final "Confirm RSVP" click
- Handles 204 success, 401 unauthorized, and error cases

## Testing

### Unit Tests (9 tests in RSVPWizard.test.tsx)

1. ✅ Renders wizard dialog with title
2. ✅ Shows response step initially
3. ✅ Shows Yes, Maybe, No buttons
4. ✅ Disables Next button until response is selected
5. ✅ Enables Next button after selecting response
6. ✅ Advances to handle step after selecting Yes
7. ✅ Shows exit warning when closing with unsaved changes
8. ✅ Completes full wizard flow for No response
9. ✅ Validates handle before allowing to proceed

### Storybook Stories

- **RSVPWizard**: New RSVP, Edit Yes, Edit Maybe, Edit No
- **RSVPSummary**: Not Responded, Yes, Maybe, No, Disabled

## Benefits

### For Users

✅ Clearer step-by-step flow
✅ Visual progress indication with stepper
✅ Validation prevents incomplete submissions
✅ Review step allows verification before submitting
✅ Exit warning prevents accidental data loss
✅ Easier to understand what's required

### For Developers

✅ Centralized validation logic
✅ Single atomic API call (no partial states)
✅ Easier to add future steps
✅ Easier to test (isolated step components)
✅ Better maintainability
✅ Comprehensive test coverage

## Future Enhancements

Potential improvements for future PRs:

- Real seat selection in the wizard
- Unique handle validation (check against existing handles)
- Smooth animations/transitions between steps
- Mobile-specific optimizations
- Analytics tracking for wizard completion/abandonment
- Reminder emails for incomplete RSVPs
- Draft auto-save in localStorage (optional)
