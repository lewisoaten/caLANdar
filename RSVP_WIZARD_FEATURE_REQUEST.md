# Feature Request: RSVP Wizard Flow

## Overview

This document outlines a proposed redesign of the RSVP flow to use a multi-step wizard approach, improving user experience and clarity around the RSVP completion process.

## Current State

The current RSVP flow is inline on the Event page with the following characteristics:

- **Inline form**: Users see RSVP, handle input, and attendance selector in an expanding form
- **Immediate save**: Each field saves automatically after a delay
- **Separate sections**: Seat selection appears as a separate section below
- **No clear completion state**: Users can submit partial information without realizing it

### Issues with Current Approach

1. **Unclear completion**: Users may think they've completed their RSVP even when a mandatory seat hasn't been selected
2. **Confusing flow**: The relationship between RSVP, attendance, and seat selection isn't immediately clear
3. **No validation checkpoint**: Users can save partial data without seeing all required fields
4. **Scattered information**: RSVP details are spread across multiple sections of the page

## Proposed Solution

Implement a **wizard-based RSVP flow** with the following characteristics:

### User Experience

1. **Single entry point**: A "RSVP to Event" button on the Event page
2. **Modal/Dialog wizard**: Opens a modal with multi-step navigation
3. **Step-by-step guidance**: Clear progression through required fields
4. **Validation gates**: Can't proceed without completing mandatory fields
5. **Summary display**: After completing wizard, show a compact summary on Event page
6. **Edit via wizard**: Clicking "Edit RSVP" re-opens wizard with current values

### Wizard Steps

#### Step 1: RSVP Response
- Radio buttons: Yes / Maybe / No
- If "No", skip to confirmation
- If "Yes" or "Maybe", proceed to Step 2

#### Step 2: Handle
- Text input for gamer handle
- Validation: Required, must be unique for this event
- Continue button (disabled until valid)

#### Step 3: Attendance Times
- Time period selector (same as current AttendanceSelector)
- Default: All periods selected
- Can select specific time blocks
- Validation: At least one period required for Yes/Maybe

#### Step 4: Seat Selection (Conditional)
- Only shown if event has seating enabled
- If mandatory (no unspecified option): Must select a seat
- If optional: Can select seat or continue without
- Visual seat map and list (same as current SeatSelector)
- Availability checking in real-time

#### Step 5: Review & Confirm
- Summary of all selections:
  - RSVP: Yes/Maybe/No
  - Handle: [handle]
  - Attendance: [time periods]
  - Seat: [seat label/room] or "Unspecified" or "None selected"
- "Confirm" button saves all data atomically
- "Back" buttons allow editing any step

### Summary Display Component

After wizard completion, replace the inline form with a compact summary card:

```
┌─────────────────────────────────────┐
│ Your RSVP                           │
├─────────────────────────────────────┤
│ Status: ✓ Attending                │
│ Handle: Player123                   │
│ Times: Sat 6pm-12am, Sun 6am-12pm  │
│ Seat: Main Hall - A5               │
│                                     │
│ [Edit RSVP]                        │
└─────────────────────────────────────┘
```

## Technical Implementation

### New Components Required

1. **`RSVPWizard.tsx`**
   - Main wizard component
   - Manages step state and navigation
   - Handles final submission
   - Uses Material-UI Dialog/Stepper

2. **`RSVPSummary.tsx`**
   - Displays completed RSVP information
   - "Edit" button to re-open wizard
   - Compact, read-only view

3. **Wizard Step Components** (can reuse existing logic):
   - `RSVPStep.tsx` - Response selection
   - `HandleStep.tsx` - Handle input
   - `AttendanceStep.tsx` - Reuse AttendanceSelector
   - `SeatSelectionStep.tsx` - Reuse SeatSelector
   - `ReviewStep.tsx` - Summary before submission

### State Management

```typescript
interface WizardState {
  currentStep: number;
  response: RSVP | null;
  handle: string;
  attendance: number[] | null;
  seatId: number | null;
  isComplete: boolean;
}
```

### API Integration

- **Read**: Fetch current invitation data to pre-populate wizard
- **Write**: Single atomic save when user confirms in Step 5
  - Reduces API calls compared to current auto-save approach
  - Ensures data consistency
  - Better error handling (can rollback entire wizard)

### Modified Components

1. **`Event.tsx`**
   - Remove inline InvitationResponse component
   - Add RSVPWizard (initially hidden)
   - Add RSVPSummary (shown after completion)
   - Button to open wizard

2. **`InvitationResponse.tsx`**
   - Potentially deprecated, or refactored into wizard steps
   - Logic can be reused in wizard steps

## Benefits

### For Users
- ✅ Clear understanding of what's required
- ✅ Single flow to complete RSVP
- ✅ Confidence that all information is submitted
- ✅ Easy to see and edit RSVP at a glance
- ✅ Better mobile experience (modal is mobile-friendly)

### For Developers
- ✅ Centralized validation logic
- ✅ Atomic data updates
- ✅ Easier to add new steps in future
- ✅ Better error handling
- ✅ More testable (each step is isolated)

## Accessibility Considerations

- ✅ Stepper component with proper ARIA labels
- ✅ Keyboard navigation between steps (Tab, Enter, Arrow keys)
- ✅ Screen reader announcements for step changes
- ✅ Focus management when wizard opens/closes
- ✅ Clear progress indicators
- ✅ All existing accessibility features maintained in reused components

## Mobile Responsiveness

- ✅ Full-screen modal on mobile devices
- ✅ Large touch targets for all buttons
- ✅ Scrollable content within each step
- ✅ Responsive stepper (horizontal on desktop, vertical on mobile)
- ✅ Swipe gestures for step navigation (optional enhancement)

## Migration Strategy

### Phase 1: Build New Components (No Breaking Changes)
1. Create wizard components
2. Create summary component
3. Add feature flag to toggle between old/new flow
4. Test thoroughly with both flows available

### Phase 2: Soft Launch
1. Enable wizard for new events
2. Keep old flow for existing events
3. Gather user feedback
4. Iterate on wizard UX

### Phase 3: Full Migration
1. Migrate all events to wizard flow
2. Deprecate old inline form components
3. Clean up unused code

## Estimated Effort

- **Design & Planning**: 2-4 hours
- **Component Development**: 8-12 hours
- **Integration & Testing**: 4-6 hours
- **Documentation**: 2-3 hours
- **Code Review & Refinement**: 2-4 hours

**Total: 18-29 hours** (2.5-4 days for one developer)

## Dependencies

- Material-UI Dialog component
- Material-UI Stepper component
- Existing RSVP/Attendance/Seat selection logic (can be reused)
- No new backend changes required (uses existing APIs)

## Success Metrics

- Reduced incomplete RSVPs (users completing all mandatory fields)
- Improved user satisfaction scores
- Reduced support requests about RSVP process
- Increased seat selection completion rate
- Lower bounce rate on Event page

## Open Questions

1. Should we allow users to exit the wizard without saving?
   - Option A: Show confirmation dialog
   - Option B: Auto-save draft state
   - Option C: Discard all changes

2. How to handle users who already have partial data?
   - Pre-populate wizard with existing values
   - Allow continuation from where they left off

3. Should admins see a different wizard or the same flow?
   - Same flow maintains consistency
   - Could add admin-only options within steps

## Future Enhancements

- **Email confirmation**: Send summary email after RSVP completion
- **Calendar integration**: Add to calendar button in confirmation
- **Social sharing**: Share attendance status with friends
- **Group RSVPs**: RSVP for multiple people in one wizard flow
- **Waitlist**: If event is full, option to join waitlist

## References

- Current implementation: `frontend/src/components/InvitationResponse.tsx`
- Current seat selection: `frontend/src/components/SeatSelector.tsx`
- Material-UI Stepper: https://mui.com/material-ui/react-stepper/
- Material-UI Dialog: https://mui.com/material-ui/react-dialog/

---

**Status**: Proposed  
**Priority**: Medium-High  
**Target Release**: TBD  
**Owner**: TBD
