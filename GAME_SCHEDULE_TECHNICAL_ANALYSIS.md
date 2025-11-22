# Game Schedule Feature - Technical Analysis

## 1. Calendar Library Evaluation

### Current Tech Stack Context

- **React**: 19.1.0 (latest)
- **TypeScript**: 5.8.3
- **MUI**: 7.1.0 with custom dark theme (futuristic gamer aesthetic)
- **Date Handling**: moment.js 2.30.1 + moment-timezone 0.6.0
- **MUI X Date Pickers**: 8.4.0 (already integrated with AdapterMoment)
- **Build Tool**: Vite 6.3.5
- **Styling**: Emotion (@emotion/react 11.14.0)

### Calendar Library Options Analysis

#### Option 1: react-big-calendar ⭐ **RECOMMENDED**

- **Repository**: https://github.com/jquense/react-big-calendar
- **Version**: 1.15.0 (actively maintained)
- **Bundle Size**: ~60KB (minified + gzipped)
- **TypeScript Support**: ✅ Official @types/react-big-calendar available
- **Moment.js Support**: ✅ Native support via moment localizer
- **React 19 Compatibility**: ✅ Works with React 18/19

**Pros:**

- Looks like Google Calendar (week/day/month views)
- Built-in drag-and-drop support (`react-dnd` integration)
- Event resizing support
- Custom event styling via CSS or inline styles
- Compatible with moment.js (already in project)
- Easy to style with custom CSS/Emotion
- Proven track record (8k+ GitHub stars)
- Can customize time slots, min/max times
- Supports event overlap detection

**Cons:**

- Not a native MUI component (requires custom styling)
- Requires additional CSS imports
- Drag-and-drop requires `react-dnd` peer dependency (~40KB)

**Integration Effort**: Medium

```tsx
import { Calendar, momentLocalizer } from 'react-big-calendar'
import moment from 'moment'
import 'react-big-calendar/lib/css/react-big-calendar.css'

const localizer = momentLocalizer(moment)

// For multi-day events (1-3 days), use 'agenda' or custom multi-day view
<Calendar
  localizer={localizer}
  events={scheduledGames}
  defaultView="agenda" // Or 'week' for 2-3 day events
  views={['agenda', 'day']} // Allow switching
  min={eventData.timeBegin.toDate()} // Event start
  max={eventData.timeEnd.toDate()}   // Event end
  step={30} // 30-minute intervals
  timeslots={2} // Show :00 and :30
  style={{ height: 'calc(100vh - 200px)' }} // Full viewport height
/>
```

**Styling Strategy**:

- Override CSS classes with Emotion styled components
- Apply theme colors (violet, cyan, dark backgrounds)
- Custom event components for pinned vs suggested styling
- **View Mode**: Multi-day agenda view (continuous scroll from event start to end)
  - 1-day events: Single column, full day view
  - 2-3 day events: Multi-column or continuous scrollable timeline
  - Mobile: Stack days vertically, single column
- **Time range**: Dynamically set to event's timeBegin → timeEnd
- **Time granularity**: 30-minute intervals (can schedule at :00 or :30)

---

#### Option 2: @mui/x-date-pickers Pro (Scheduler)

- **Repository**: https://mui.com/x/react-date-pickers/
- **Version**: Would need @mui/x-scheduler (part of MUI X Pro)
- **License**: ⚠️ **COMMERCIAL** - Requires paid license ($15/month or $300/year per developer)

**Pros:**

- Native MUI integration (theme compatibility)
- TypeScript out of the box
- Consistent with existing MUI components
- Professional support

**Cons:**

- ❌ **NOT FREE** - Requires commercial license
- Overkill for this use case
- Heavier bundle size
- Limited documentation for scheduler (newer component)

**Verdict**: ❌ Not recommended due to licensing costs

---

#### Option 3: FullCalendar

- **Repository**: https://fullcalendar.io/
- **Version**: 6.1.x
- **Bundle Size**: ~100KB+ (larger than react-big-calendar)
- **React Integration**: Requires @fullcalendar/react adapter

**Pros:**

- Feature-rich (resource views, timeline)
- Good drag-and-drop
- Professional appearance
- Extensive documentation

**Cons:**

- ⚠️ Premium features require license
- Heavier bundle size
- More complex API
- Requires multiple package imports
- Harder to integrate with MUI theme
- Uses its own date library (not moment.js by default)

**Verdict**: ⚠️ Overkill for requirements, licensing concerns

---

#### Option 4: Custom MUI Grid-based Calendar

- **Build from scratch using MUI components**

**Pros:**

- Full control over styling
- Perfect theme integration
- No external dependencies

**Cons:**

- ❌ High development time (2-3 weeks)
- Need to implement drag-and-drop from scratch
- Need to implement overlap detection
- Need to handle time zone logic
- Need to handle event rendering edge cases
- Maintenance burden

**Verdict**: ❌ Not recommended - too much implementation time

---

### **Final Recommendation: react-big-calendar**

**Rationale:**

1. ✅ Free and open source (no licensing issues)
2. ✅ Works seamlessly with existing moment.js setup
3. ✅ Built-in drag-and-drop and resizing
4. ✅ Google Calendar-like appearance (matches requirement)
5. ✅ TypeScript support
6. ✅ React 19 compatible
7. ✅ Moderate bundle size impact
8. ✅ Can be styled to match MUI theme with Emotion
9. ✅ Active maintenance and community

**Installation:**

```bash
npm install react-big-calendar react-dnd react-dnd-html5-backend @types/react-big-calendar
```

**Dependencies Added:**

- `react-big-calendar`: ^1.15.0 (~60KB)
- `react-dnd`: ^16.0.1 (~40KB, peer dependency for drag-and-drop)
- `react-dnd-html5-backend`: ^16.0.1 (~10KB)
- `@types/react-big-calendar`: ^1.8.9 (dev dependency)

**Total Bundle Impact**: ~110KB (minified + gzipped) - acceptable for feature scope

---

## 2. Automatic Scheduling Algorithm

### Algorithm Overview: **Time-Slot Greedy Scheduling with Attendance-Weighted Voting**

The algorithm optimizes game scheduling by:

1. Prioritizing highly-voted games
2. Scheduling games when most voters are available (using attendance data)
3. Respecting pinned games as immovable constraints
4. Filling available time slots efficiently

### Input Parameters

```typescript
interface SchedulingInput {
  eventStart: moment.Moment; // Event time_begin
  eventEnd: moment.Moment; // Event time_end
  gameSuggestions: GameSuggestion[]; // All suggested games with votes
  invitations: InvitationData[]; // Attendees with attendance data
  pinnedGames: ScheduledGame[]; // Manually scheduled/pinned games
  defaultDuration: number; // Default 120 minutes
}
```

### Attendance Data Structure

The `attendance` field in invitations is a byte array where **each bit represents a 6-hour block**:

- **Bit 0**: Morning (typically 6am-12pm)
- **Bit 1**: Afternoon (typically 12pm-6pm)
- **Bit 2**: Evening (typically 6pm-12am)
- **Bit 3**: Overnight (typically 12am-6am)

For a multi-day event, the pattern repeats for each day.

**Example**: 3-day event = 12 time blocks = 2 bytes

- Byte 0, bits 0-3: Day 1 (morning, afternoon, evening, overnight)
- Byte 0, bits 4-7: Day 2 (morning, afternoon, evening, overnight)
- Byte 1, bits 0-3: Day 3 (morning, afternoon, evening, overnight)

```typescript
// Decode attendance byte array into available 6-hour blocks
function decodeAttendance(
  attendance: number[] | null,
  eventStart: moment.Moment,
  eventEnd: moment.Moment,
): TimeBlock[] {
  if (!attendance || attendance.length === 0) {
    return []; // No attendance data
  }

  const blocks: TimeBlock[] = [];
  const sixHourBlocks = ["morning", "afternoon", "evening", "overnight"];
  const blockStartHours = [6, 12, 18, 0]; // Start hours for each block

  let currentTime = eventStart.clone().startOf("day").add(6, "hours"); // Start at 6am
  let bitIndex = 0;

  while (currentTime.isBefore(eventEnd)) {
    const byteIndex = Math.floor(bitIndex / 8);
    const bitPosition = bitIndex % 8;

    if (byteIndex < attendance.length) {
      const byte = attendance[byteIndex];
      const isAvailable = (byte & (1 << bitPosition)) !== 0;

      if (isAvailable) {
        blocks.push({
          start: currentTime.clone(),
          end: currentTime.clone().add(6, "hours"),
          type: sixHourBlocks[bitPosition % 4],
        });
      }
    }

    currentTime.add(6, "hours");
    bitIndex++;
  }

  return blocks;
}

// Check if user is available for a game duration
// If user is available for ANY 6-hour block that overlaps with the game, count them as available
function isAvailableForGame(
  availableBlocks: TimeBlock[],
  gameStart: moment.Moment,
  gameDuration: number, // minutes
): boolean {
  const gameEnd = gameStart.clone().add(gameDuration, "minutes");

  return availableBlocks.some((block) => {
    // Check if game time overlaps with any available block
    return gameStart.isBefore(block.end) && gameEnd.isAfter(block.start);
  });
}
```

### Scheduling Algorithm Steps

#### Step 1: Build Available Time Slots

```typescript
function buildAvailableTimeSlots(
  eventStart: moment.Moment,
  eventEnd: moment.Moment,
  pinnedGames: ScheduledGame[],
  slotDuration: number = 120, // minutes
): TimeSlot[] {
  const slots: TimeSlot[] = [];

  // Create slots at 30-minute intervals
  let currentSlot = eventStart.clone();

  while (
    currentSlot.clone().add(slotDuration, "minutes").isSameOrBefore(eventEnd)
  ) {
    const slotEnd = currentSlot.clone().add(slotDuration, "minutes");

    // Check if this slot overlaps with any pinned game
    const hasOverlap = pinnedGames.some((pinned) => {
      const pinnedStart = moment(pinned.startTime);
      const pinnedEnd = pinnedStart
        .clone()
        .add(pinned.durationMinutes, "minutes");

      // Overlap if: slot starts before pinned ends AND slot ends after pinned starts
      return currentSlot.isBefore(pinnedEnd) && slotEnd.isAfter(pinnedStart);
    });

    if (!hasOverlap) {
      slots.push({
        start: currentSlot.clone(),
        end: slotEnd,
        duration: slotDuration,
      });
    }

    // Move to next 30-minute interval
    currentSlot.add(30, "minutes");
  }

  return slots;
}
```

**Example:**

- Event: Friday 6pm → Sunday 6pm (48 hours)
- Pinned games: Saturday 2pm-4pm, Saturday 8pm-11pm
- Slot granularity: Every 30 minutes
- Available slots: All 2-hour slots (starting :00 or :30) EXCEPT those overlapping pinned times
- Possible slots per hour: 2 (at :00 and :30)

#### Step 2: Calculate Voter Availability Score

```typescript
function calculateAvailabilityScore(
  game: GameSuggestion,
  timeSlot: TimeSlot,
  invitations: InvitationData[],
): number {
  // 1. Get all users who voted YES for this game
  const voters = getVotersForGame(game);

  // 2. For each voter, check if they're available during timeSlot
  let availableVoters = 0;
  for (const voter of voters) {
    const invitation = invitations.find((i) => i.email === voter.email);
    if (!invitation?.attendance) {
      // If no attendance data, use main RSVP response
      // YES = fully available (1.0), MAYBE = partially available (0.5), NO = unavailable (0.0)
      if (invitation.response === "yes") {
        availableVoters += 1.0;
      } else if (invitation.response === "maybe") {
        availableVoters += 0.5;
      }
      // If response is 'no' or null, skip (0.0)
      continue;
    }

    const availableBlocks = decodeAttendance(
      invitation.attendance,
      eventStart,
      eventEnd,
    );

    // Check if voter is available during game time (overlaps with any 6-hour block)
    if (
      isAvailableForGame(availableBlocks, timeSlot.start, game.duration || 120)
    ) {
      availableVoters += 1;
    }
  }

  // Return score: (available voters / total voters) * total votes
  return (availableVoters / voters.length) * game.votes;
}
```

**Scoring Logic:**

- Game with 10 votes, 8 voters available at slot → Score: 8.0
- Game with 8 votes, 8 voters available at slot → Score: 8.0
- Game with 10 votes, 5 voters available at slot → Score: 5.0
- **Prioritizes**: Both vote count AND voter availability

#### Step 3: Greedy Slot Assignment

```typescript
function scheduleGames(
  gameSuggestions: GameSuggestion[],
  availableSlots: TimeSlot[],
  invitations: InvitationData[],
): SuggestedSchedule[] {
  const scheduledGames: SuggestedSchedule[] = [];
  const scheduledGameIds = new Set<number>(); // Track scheduled games

  // Sort games by vote count (descending)
  const sortedGames = [...gameSuggestions].sort((a, b) => b.votes - a.votes);

  for (const game of sortedGames) {
    // Skip if already scheduled
    if (scheduledGameIds.has(game.appid)) continue;

    // Find best time slot for this game
    let bestSlot: TimeSlot | null = null;
    let bestScore = -1;

    for (const slot of availableSlots) {
      const score = calculateAvailabilityScore(game, slot, invitations);
      if (score > bestScore) {
        bestScore = score;
        bestSlot = slot;
      }
    }

    if (bestSlot && bestScore > 0) {
      // Schedule game at best slot
      scheduledGames.push({
        game,
        startTime: bestSlot.start,
        duration: game.defaultDuration || 120,
        isPinned: false,
        isSuggested: true,
        availabilityScore: bestScore,
      });

      // Mark game as scheduled
      scheduledGameIds.add(game.appid);

      // Remove this slot from available slots (prevent overlaps)
      availableSlots = removeOverlappingSlots(availableSlots, bestSlot);
    }
  }

  return scheduledGames;
}
```

### Algorithm Rules Summary

1. ✅ **Vote Priority**: Games sorted by vote count first
2. ✅ **Attendance Optimization**: Each game scheduled when most voters available
3. ✅ **Pinned Constraints**: Pinned games create blocked time ranges
4. ✅ **No Overlaps**: Suggested games don't overlap with each other or pinned games
5. ✅ **Single Instance**: Each game scheduled exactly once
6. ✅ **Default Duration**: 2 hours unless manually changed
7. ✅ **Time Bounds**: Only schedule within event start/end times

### Re-calculation Triggers

Algorithm re-runs when:

- ✅ New game suggested
- ✅ Vote added/removed/changed
- ✅ Invitation response changes (yes/no/maybe)
- ✅ Attendance data updated (RSVP wizard)
- ✅ Game pinned/unpinned
- ✅ Pinned game moved/resized/deleted

### Edge Cases Handled

1. **No attendance data**: Use main RSVP (yes=100%, maybe=50%, no=0%)
2. **6-hour block granularity**: Game overlaps ANY available block → voter counts as available
3. **Overlapping pinned games**: Not allowed by UI validation
4. **Insufficient slots**: Some games may not be scheduled
5. **Games with 0 votes**: Can still be scheduled in remaining slots
6. **Tied scores**: Use stable sort (first by votes, then by appid)
7. **Same game multiple times**: Admins can manually add same game at different slots
8. **30-minute granularity**: Games can start at :00 or :30 intervals

---

## 3. Incremental Feature Slices

### **Slice 1: Read-Only Schedule View** 📅

**Goal**: Display manually created schedules (no algorithm)

**Backend:**

- ✅ Database migration: `event_game_schedule` table
- ✅ Repository layer: CRUD operations
- ✅ API endpoint: `GET /events/{id}/game_schedule`
- ✅ Manual seed data endpoint for testing

**Frontend:**

- ✅ Install `react-big-calendar`
- ✅ TypeScript types for schedule
- ✅ Basic calendar component (read-only)
- ✅ Display pinned games only
- ✅ Event time range (event start → end)
- ✅ Multi-day view (agenda or day-switcher)
- ✅ 30-minute time intervals
- ✅ Mobile-responsive (vertical stack)
- ✅ Integrate into Event view as new section

**Testing:**

- ✅ Can view empty schedule
- ✅ Can view pre-seeded pinned games
- ✅ Calendar renders with event time bounds

**Deliverable**: All users can view manually-created game schedules

**Estimated Time**: 2-3 days

---

### **Slice 2: Admin Manual Scheduling** ✏️

**Goal**: Admins can manually add/edit/delete games

**Backend:**

- ✅ API endpoint: `POST /events/{id}/game_schedule` (create)
- ✅ API endpoint: `PATCH /events/{id}/game_schedule/{schedule_id}` (update)
- ✅ API endpoint: `DELETE /events/{id}/game_schedule/{schedule_id}` (delete)
- ✅ Validation: No overlapping pinned games
- ✅ Audit logging for all operations

**Frontend:**

- ✅ Drag-and-drop to move games (admin only)
- ✅ Resize games to adjust duration (admin only)
- ✅ "Add game" button → select from suggestions
- ✅ Delete game button
- ✅ Overlap validation with error messages
- ✅ Permission checks (admin vs attendee view)

**Testing:**

- ✅ Admin can add games from suggestion list
- ✅ Admin can drag games to new times
- ✅ Admin can resize game duration
- ✅ Admin can delete games
- ✅ Overlap validation prevents conflicts
- ✅ Non-admins see read-only view

**Deliverable**: Admins can manually create complete schedules

**Estimated Time**: 3-4 days

---

### **Slice 3: Suggested Games Algorithm** 🤖

**Goal**: Auto-suggest games in empty time slots

**Backend:**

- ✅ Implement scheduling algorithm in controller
- ✅ API endpoint: `GET /events/{id}/game_schedule` (returns pinned + suggested)
- ✅ Decode attendance byte arrays
- ✅ Calculate availability scores
- ✅ Greedy slot assignment
- ✅ Unit tests for algorithm

**Frontend:**

- ✅ Display suggested games with lower opacity
- ✅ Visual differentiation (pinned vs suggested)
- ✅ Tooltip showing "Suggested - click to pin"
- ✅ Auto-refresh when data changes

**Testing:**

- ✅ Algorithm schedules top-voted games first
- ✅ Algorithm respects pinned game slots
- ✅ Algorithm uses attendance data for scoring
- ✅ Each game scheduled max once
- ✅ Suggested games don't overlap

**Deliverable**: System suggests optimal game schedule automatically

**Estimated Time**: 4-5 days

---

### **Slice 4: Pin/Unpin Functionality** 📌

**Goal**: Convert between suggested ↔ pinned states

**Backend:**

- ✅ API endpoint: `POST /events/{id}/game_schedule` (pin suggested game)
- ✅ API endpoint: `DELETE /events/{id}/game_schedule/{schedule_id}` (unpin)
- ✅ Re-calculate suggestions after pin/unpin
- ✅ Audit logging

**Frontend:**

- ✅ Click suggested game → pin it (admin only)
- ✅ Click pinned game → show unpin option (admin only)
- ✅ Real-time recalculation after pin/unpin
- ✅ Smooth UI transitions

**Testing:**

- ✅ Clicking suggested game pins it
- ✅ Unpinning game makes it eligible for re-suggestion
- ✅ Suggestions recalculate when pinned games change
- ✅ Same game can be pinned multiple times at different slots

**Deliverable**: Admins can "lock in" suggested games or free them back up

**Estimated Time**: 2-3 days

---

### **Slice 5: Real-time Updates & Polish** ✨

**Goal**: Dynamic updates and UX improvements

**Backend:**

- ✅ Optimize algorithm performance
- ✅ Cache suggestion calculations
- ✅ Batch audit log writes

**Frontend:**

- ✅ Auto-refresh on RSVP changes
- ✅ Auto-refresh on vote changes
- ✅ Loading states during recalculation
- ✅ Empty state messages
- ✅ Storybook stories for all states
- ✅ Responsive design (mobile calendar view)

**Testing:**

- ✅ Pact contract tests for all endpoints
- ✅ Frontend unit tests
- ✅ E2E manual testing

**Deliverable**: Polished, production-ready feature

**Estimated Time**: 2-3 days

---

### **Slice 6: Documentation & Release** 📚

**Goal**: Document feature and deploy

**Tasks:**

- ✅ Create `GAME_SCHEDULE_FEATURE.md`
- ✅ Update README with new feature
- ✅ API documentation (OpenAPI)
- ✅ User guide for admins
- ✅ Pre-commit checks pass
- ✅ CI/CD pipeline green

**Deliverable**: Feature documented and released

**Estimated Time**: 1 day

---

## Total Implementation Timeline

| Slice | Description       | Estimated Time | Cumulative |
| ----- | ----------------- | -------------- | ---------- |
| 1     | Read-only view    | 2-3 days       | 3 days     |
| 2     | Manual scheduling | 3-4 days       | 7 days     |
| 3     | Algorithm         | 4-5 days       | 12 days    |
| 4     | Pin/unpin         | 2-3 days       | 15 days    |
| 5     | Polish            | 2-3 days       | 18 days    |
| 6     | Documentation     | 1 day          | 19 days    |

**Total**: ~3-4 weeks (19 working days)

Each slice is:

- ✅ Independently testable
- ✅ Deployable to production
- ✅ Provides user value
- ✅ Builds on previous slices

---

## Recommendations

### Start Implementation Order

1. **Slice 1** - Validates database schema, API structure, UI integration
2. **Slice 2** - Provides immediate admin value (manual scheduling)
3. **Slice 3** - Adds intelligent suggestions
4. **Slices 4-6** - Polish and refinement

### Dependencies to Install First

```bash
# In frontend directory
npm install react-big-calendar react-dnd react-dnd-html5-backend
npm install --save-dev @types/react-big-calendar
```

### Pre-commit Compliance

- All code will pass `just pre-commit`
- Clippy: No `.unwrap()`, proper error handling
- ESLint: Flat config compatible
- Prettier: Auto-formatted

### ✅ Clarifications Confirmed

1. **Attendance byte array format**: Each bit = 6-hour block (morning, afternoon, evening, overnight). Multi-day events use multiple bits/bytes.
2. **No attendance data**: Use main RSVP response (yes=100% available, maybe=50%, no=0%)
3. **Multiple game instances**: ✅ Yes - admins can add same game multiple times at different slots
4. **Mobile view**: ✅ Yes - mobile-friendly. Use continuous scrollable view OR day-switcher from event start to end (events are 1-3 days)
5. **Schedule granularity**: 30-minute intervals (games can start at :00 or :30)
6. **Event duration**: Typically 1-3 days, so calendar shows full event duration in one view or day-by-day

Let me know if you'd like me to proceed with implementation or need any clarifications!
