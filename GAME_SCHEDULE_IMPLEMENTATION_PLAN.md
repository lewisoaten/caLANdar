# Game Schedule Feature - Implementation Plan

**Feature Branch:** `game-schedule`
**Last Updated:** 23 November 2025

## Overview

The Game Schedule feature allows event organizers to create a timetable of games for LAN party events. It consists of three implementation slices, progressing from manual scheduling to intelligent automated suggestions.

## Overall Objectives

1. **Enable manual game scheduling** - Admins can create a visual timeline of which games will be played when
2. **Provide scheduling flexibility** - Games can be moved, resized, and deleted with visual feedback
3. **Suggest optimal game times** - Algorithm analyzes voter availability and game popularity to suggest schedules
4. **Maximize participant engagement** - Schedule games when the most people are available
5. **Prevent scheduling conflicts** - Validate that games don't overlap and fit within event timeframe

## Architecture

### Backend (Rust/Rocket/PostgreSQL)

- **Repository Layer** (`api/src/repositories/game_schedule.rs`)
  - CRUD operations for `game_schedule_entry` table
  - Overlap detection queries

- **Controller Layer** (`api/src/controllers/game_schedule.rs`)
  - Business logic and validation
  - Scheduling algorithm (Slice 3)
  - Audit logging

- **Routes Layer** (`api/src/routes/game_schedule.rs`)
  - REST API endpoints
  - Admin authentication
  - Error handling

### Frontend (React/TypeScript/MUI)

- **Components** (`frontend/src/components/EventGameSchedule.tsx`)
  - Calendar view (react-big-calendar)
  - Drag-and-drop interface
  - Game suggestion drawer
  - Visual differentiation for suggested games

### Database Schema

```sql
game_schedule_entry (
  id SERIAL PRIMARY KEY,
  event_id INTEGER REFERENCES event(id),
  game_id BIGINT REFERENCES steam_game(appid),
  start_time TIMESTAMPTZ,
  duration_minutes INTEGER,
  is_pinned BOOLEAN,  -- true = manually scheduled, false = suggested
  created_at TIMESTAMPTZ,
  last_modified TIMESTAMPTZ
)
```

## Implementation Status

### ✅ Slice 1: Backend CRUD (COMPLETE)

**Objective:** Build the foundational data layer and API for game scheduling.

**Implemented:**

- [x] Database migration for `game_schedule_entry` table
- [x] Repository layer with CRUD operations
- [x] Overlap validation (`has_overlap` function)
- [x] Controller layer with business logic
- [x] REST API endpoints:
  - `GET /events/{id}/game_schedule` - List all scheduled games
  - `POST /events/{id}/game_schedule` - Create new schedule entry
  - `PATCH /events/{id}/game_schedule/{id}` - Update schedule entry
  - `DELETE /events/{id}/game_schedule/{id}` - Delete schedule entry
- [x] Admin-only permissions for mutations
- [x] Audit logging for all operations
- [x] Error handling and validation

**Key Features:**

- Prevents overlapping game schedules
- Captures metadata for audit trail (game name, times, etc.)
- Validates admin permissions via `AdminUser` guard
- Returns proper error codes (400 for validation, 401 for auth, 500 for server errors)

### ✅ Slice 2: Frontend Manual Scheduling (COMPLETE)

**Objective:** Provide a visual calendar interface for admins to manually schedule games.

**Implemented:**

- [x] Calendar component with react-big-calendar
- [x] Day and Agenda views with navigation
- [x] Click-to-add functionality via dialog
  - MUI DatePicker/TimePicker with British locale (DD/MM/YYYY, HH:mm)
  - Game selection from suggestions
  - Duration input (default 120 minutes)
- [x] Drag-to-move existing games
- [x] Resize games to adjust duration
- [x] Delete with hover button + confirmation dialog
- [x] Event boundary validation (client-side)
  - Prevents scheduling before event start
  - Prevents scheduling beyond event end
- [x] Overlap validation (server-side)
  - Clear error messages via snackbar
- [x] British locale throughout (en-gb)
- [x] Full viewport layout with auto-scroll
  - Scrolls to current time or event start (whichever is later)
- [x] Visual polish
  - MUI themed components
  - Responsive 600px height calendar
  - No unwanted scrollbars

**Key Features:**

- Admin-only editing (read-only for non-admins)
- Real-time validation feedback
- Intuitive drag-and-drop UX
- Mobile-friendly click-based adding (abandoned drag-from-drawer approach)

### ✅ Slice 3: Suggested Games Algorithm (BACKEND COMPLETE)

**Objective:** Automatically suggest optimal game times based on voter preferences and availability.

**Status:** Backend implementation complete, frontend pending, SQLx cache needs update

#### Completed Backend Work:

**Algorithm Implementation:**

- [x] `build_available_time_slots()` - Generates 30-minute time slots
  - Spans entire event period (multi-day support)
  - Excludes time ranges occupied by pinned games
  - Returns list of available slots

- [x] `calculate_availability_score()` - Scores time slots
  - Decodes attendance byte arrays from `invitation.attendance`
  - Counts voters available for ALL 30-min buckets in the slot
  - Each bucket: 1 = attending, 0 = not attending
  - Returns integer count of available voters

- [x] `is_time_range_available()` - Overlap helper
  - Checks if a time range conflicts with pinned games
  - Used during slot selection

- [x] `schedule_suggested_games()` - Main greedy algorithm
  - Fetches game suggestions sorted by votes (descending)
  - For each game:
    1. Try each available slot as potential start time
    2. Ensure 2-hour game fits within event
    3. Check no conflict with pinned or already-suggested games
    4. Calculate availability score for the slot
    5. Select slot with highest score
  - Default game duration: 120 minutes
  - Returns `Vec<GameScheduleEntry>` with `is_suggested = true`, `is_pinned = false`

- [x] Updated `get_all()` controller
  - Fetches pinned games from database
  - Runs scheduling algorithm for suggested games
  - Combines and returns both types
  - Gracefully handles algorithm failures (logs warning, returns empty suggestions)

**SQL Queries:**

- Fixed `invitation.response` to use enum type ('yes' instead of boolean)
- Fixed vote count aggregation with proper alias
- Queries ready but need SQLx cache update

#### Remaining Work:

**Backend:**

- [ ] Update SQLx query cache
  - Requires running database container
  - Command: `just update-sqlx`
  - Will cache 3 new queries (invitations, event, game_suggestions)

- [ ] Add "pin suggestion" endpoint
  - `POST /events/{id}/game_schedule/pin`
  - Request body: `{ game_id, start_time, duration_minutes }`
  - Creates new pinned entry from suggestion
  - Validates no overlap with existing pinned games
  - Audit logs the pinning action

**Frontend:**

- [ ] Visual differentiation for suggested games
  - Add CSS class `.suggested` to StyledCalendarWrapper
  - Styling:
    ```css
    .suggested {
      opacity: 0.7;
      border: 2px dashed #ccc;
      background-color: rgba(0, 0, 0, 0.05);
    }
    ```
  - Apply class via `eventPropGetter` return value

- [ ] Click-to-pin functionality
  - Add click handler on suggested game events
  - Show confirmation dialog: "Pin this game to the schedule?"
  - POST to `/api/events/{id}/game_schedule/pin`
  - On success: refresh schedule, show success snackbar
  - On error: show error snackbar
  - Disable pinning for non-admins

- [ ] Show/hide suggestions toggle
  - Add MUI Switch in Paper header
  - State: `const [showSuggestions, setShowSuggestions] = useState(true)`
  - Filter events before passing to calendar:
    ```typescript
    const visibleEvents = showSuggestions
      ? events
      : events.filter((e) => !e.resource.isSuggested);
    ```
  - Label: "Show suggested games"

**Testing:**

- [ ] Create test event with time range
- [ ] Add RSVPs with attendance byte arrays
- [ ] Suggest multiple games with varying vote counts
- [ ] Verify algorithm:
  - Schedules highest-voted games first
  - Chooses slots with most available voters
  - Respects pinned game conflicts
  - Handles multi-day events correctly
  - Default 2-hour durations
- [ ] Test pin functionality
- [ ] Test show/hide toggle

## Data Flow

### Scheduling Algorithm Flow

```
1. User requests schedule
   ↓
2. GET /events/{id}/game_schedule
   ↓
3. Controller: get_all()
   ├─→ Fetch pinned games from DB
   └─→ Run schedule_suggested_games()
       ├─→ Get event time period
       ├─→ Fetch game suggestions (sorted by votes DESC)
       ├─→ build_available_time_slots()
       │   └─→ Generate 30-min slots, exclude pinned games
       ├─→ For each game (by votes):
       │   ├─→ For each slot:
       │   │   ├─→ Check fits in event
       │   │   ├─→ Check no pinned conflict
       │   │   ├─→ Check no suggested conflict
       │   │   └─→ calculate_availability_score()
       │   │       └─→ Count voters available for slot
       │   └─→ Assign to best-scoring slot
       └─→ Return suggested games
   ↓
4. Combine pinned + suggested
   ↓
5. Return JSON to frontend
```

### Pin Suggestion Flow

```
1. User clicks suggested game
   ↓
2. Confirmation dialog
   ↓
3. POST /events/{id}/game_schedule/pin
   ↓
4. Validate no overlap with pinned games
   ↓
5. Create new game_schedule_entry (is_pinned=true)
   ↓
6. Audit log the action
   ↓
7. Return success
   ↓
8. Frontend refreshes schedule
   ↓
9. Game now appears as pinned (solid, draggable)
```

## Key Algorithms

### Availability Score Calculation

Given a time slot from `start_time` to `start_time + duration`:

1. Calculate which 30-minute buckets the slot spans
   - `start_bucket = (slot_start - event_start) / 30 minutes`
   - `end_bucket = (slot_start + duration - event_start) / 30 minutes`

2. For each RSVP with `attendance` byte array:
   - Check if ALL buckets in range have value 1
   - If yes: increment available_count
   - If any bucket is 0: person not available

3. Return `available_count`

**Example:**

- Event: Friday 6pm - Sunday 6pm (72 hours = 144 buckets)
- Slot: Saturday 2pm - 4pm (buckets 40-44)
- Attendance: `[1,1,1,...,1,1,0,0,1,1,...]`
  ↑ buckets 42-43 = 0
- Result: Person NOT available (has 0s in range)

### Greedy Scheduling Algorithm

**Goal:** Maximize voter availability while respecting votes

**Approach:**

1. Sort games by popularity (vote count descending)
2. Greedily assign each game to its best slot
3. Mark slot as occupied to prevent conflicts

**Rationale:**

- Most popular games get priority for best times
- Simple and fast (O(games × slots))
- Guarantees no overlaps
- Maximizes overall availability

**Limitations:**

- Not globally optimal (greedy choice)
- First game might take the single best slot, forcing others to suboptimal times
- No backtracking or rescheduling

**Future Improvements:**

- Constraint satisfaction solver for global optimization
- Consider game duration preferences
- Allow partial overlaps with different rooms/setups
- Machine learning based on historical attendance

## Configuration

### Environment Variables

- `DATABASE_URL` - PostgreSQL connection (set by Shuttle)
- `PASETO_SECRET_KEY` - For admin authentication
- Development API key: `"put_something_here"`

### Constants

- **Slot Duration:** 30 minutes
- **Default Game Duration:** 120 minutes (2 hours)
- **Calendar Min Time:** 00:00 (midnight)
- **Calendar Max Time:** 23:59

### Localization

- **Date Format:** DD/MM/YYYY (British)
- **Time Format:** HH:mm (24-hour clock)
- **Locale:** en-gb throughout

## Testing Strategy

### Unit Tests (Backend)

- [ ] `build_available_time_slots()`
  - Empty event period
  - Single day event
  - Multi-day event
  - Event fully occupied by pinned games
  - Partial occupation

- [ ] `calculate_availability_score()`
  - No RSVPs
  - All available
  - None available
  - Partial availability
  - Edge cases (slot at event boundaries)

- [ ] `schedule_suggested_games()`
  - No games suggested
  - More games than slots
  - All games fit
  - Varying vote counts
  - Different availability patterns

### Integration Tests (Backend)

- [ ] GET endpoint returns pinned + suggested
- [ ] Suggested games don't overlap with pinned
- [ ] Algorithm runs even if some data missing
- [ ] Pin endpoint creates correct entry

### UI Tests (Frontend)

- [ ] Suggested games render with different styling
- [ ] Click on suggested game shows pin dialog
- [ ] Pin action converts to draggable game
- [ ] Toggle hides/shows suggestions
- [ ] Non-admins can't pin or edit

### End-to-End Scenarios

1. **Happy Path:**
   - Create event (Friday 6pm - Sunday 6pm)
   - Add 3 RSVPs with different availability
   - Suggest 5 games with 10, 8, 5, 3, 2 votes
   - Verify algorithm schedules top games at best times
   - Pin one suggestion
   - Verify it becomes draggable/editable

2. **Edge Cases:**
   - Event with no RSVPs (algorithm should still run)
   - Event with no games suggested (returns empty array)
   - Event fully booked with pinned games (no suggestions)
   - Very short event (< 2 hours)
   - Single time slot available

## Performance Considerations

### Backend

- **Query Optimization:**
  - Index on `game_schedule_entry(event_id, is_pinned)`
  - Index on `invitation(event_id, response)`
  - Fetch invitations once, reuse for all score calculations

- **Algorithm Complexity:**
  - O(G × S) where G = games, S = slots
  - Typical: 10 games × 144 slots (3-day event) = 1,440 iterations
  - Each iteration: O(R) for R RSVPs
  - Total: ~1,440 × 20 RSVPs = 28,800 operations (fast)

- **Caching Potential:**
  - Cache suggested schedules per event
  - Invalidate on: new RSVP, new game suggestion, new pinned game
  - TTL: 5 minutes

### Frontend

- **Calendar Rendering:**
  - 600px fixed height prevents layout shift
  - Auto-scroll optimized with useMemo
  - Event filtering (show/hide) done client-side

- **API Calls:**
  - Refresh schedule after pin action
  - Debounce if implementing auto-refresh
  - Loading states prevent duplicate requests

## Security Considerations

- **Admin-Only Mutations:**
  - All POST/PATCH/DELETE require `AdminUser` guard
  - GET is read-only for all invited users
  - Pin endpoint will also require admin

- **Input Validation:**
  - Event ID must exist
  - Game ID must be valid Steam appid
  - Times must be within event boundaries
  - Duration must be positive

- **SQL Injection Prevention:**
  - All queries use SQLx parameterization
  - No raw string concatenation

## Deployment Notes

### Pre-Deploy Checklist

- [ ] Run `just update-sqlx` to update query cache
- [ ] Run `just pre-commit` - must exit 0
- [ ] All tests passing
- [ ] Frontend build succeeds
- [ ] API compiles without warnings (clippy strict mode)

### Database Migrations

- No new migrations needed (Slice 1 created table)
- Existing data compatible with Slice 3

### Rollout Plan

1. Deploy backend with algorithm (returns suggestions)
2. Frontend continues showing only pinned games (backward compatible)
3. Deploy frontend with suggestion UI
4. Monitor for performance issues
5. Collect feedback on suggested schedules

## Future Enhancements

### Slice 4+ Ideas

- **Multi-room Support:**
  - Schedule games in parallel across different rooms/setups
  - Each room has separate conflict detection

- **Game Duration Preferences:**
  - Allow admins to set custom durations per game
  - Store in `event_game` table

- **Tournament Brackets:**
  - Schedule elimination/round-robin tournaments
  - Auto-generate matches based on sign-ups

- **Breaks and Meals:**
  - Block out time for lunch/dinner/breaks
  - Algorithm respects these as "occupied" slots

- **Notification System:**
  - Alert attendees when schedule published
  - Remind before their voted games start
  - SMS/Email/Discord integration

- **Schedule Templates:**
  - Save successful schedules as templates
  - Apply to future similar events
  - Community-shared templates

- **Optimizer Improvements:**
  - Use constraint satisfaction solver (e.g., OR-Tools)
  - Multi-objective optimization (fairness + availability)
  - Allow manual override of suggestions
  - A/B test different algorithms

- **Analytics:**
  - Show which games had best attendance
  - Analyze if suggested times were optimal
  - Feed back into future algorithms

## Documentation

### API Documentation

- OpenAPI/Swagger via `rocket_okapi`
- Auto-generated from route annotations
- Available at `/swagger-ui` in dev

### User Guide

- Admin guide for manual scheduling
- How to interpret suggested games
- Best practices for event planning

### Developer Guide

- This document
- `GAME_SCHEDULE_TECHNICAL_ANALYSIS.md`
- Inline code comments

## Success Metrics

- ✅ Admins can create game schedules without errors
- ✅ Zero overlapping games (validation working)
- ✅ All CRUD operations audited correctly
- ✅ Calendar renders smoothly with 100+ events
- [ ] Algorithm suggests reasonable schedules (qualitative)
- [ ] Suggested games have 80%+ availability scores
- [ ] < 500ms API response time for schedule generation
- [ ] < 5% pin action failure rate
- [ ] Positive user feedback on UX

## Questions & Decisions

### Resolved

- ✅ Calendar library: react-big-calendar (chosen over FullCalendar)
- ✅ Adding games: Click-to-add dialog (abandoned drag-from-drawer)
- ✅ Date format: British locale (DD/MM/YYYY, 24-hour time)
- ✅ Algorithm: Greedy by votes (simple, fast, good enough)
- ✅ Suggested game storage: Computed on-demand, not persisted

### Open Questions

- **Should suggested games be cached?**
  - Pro: Faster responses, consistent results
  - Con: Complexity, cache invalidation
  - Decision: Start without caching, add if needed

- **How to handle very long events (1+ week)?**
  - May generate 336+ time slots (7 days × 48 slots/day)
  - Could impact performance
  - Mitigation: Limit to first N slots, or increase slot duration

- **Should we persist suggested schedules?**
  - Pro: Admins can review/edit before publishing
  - Con: Adds complexity, stale data
  - Decision: No persistence for v1, evaluate later

## Contact & Resources

- **Project Repository:** github.com/lewisoaten/caLANdar
- **Feature Branch:** `game-schedule`
- **Documentation:** See `/GAME_SCHEDULE_*.md` files
- **Design Reference:** Original specification in project discussions

## Appendix: SQL Schema

```sql
-- Game schedule entries (Slice 1)
CREATE TABLE game_schedule_entry (
    id SERIAL PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES event(id) ON DELETE CASCADE,
    game_id BIGINT NOT NULL REFERENCES steam_game(appid),
    start_time TIMESTAMPTZ NOT NULL,
    duration_minutes INTEGER NOT NULL,
    is_pinned BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_modified TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_game_schedule_event ON game_schedule_entry(event_id, is_pinned);

-- Invitations with attendance data (existing)
CREATE TABLE invitation (
    event_id INTEGER,
    email VARCHAR(255) NOT NULL,
    handle VARCHAR(255),
    invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    responded_at TIMESTAMPTZ,
    response invitation_response,  -- ENUM: 'yes', 'no', 'maybe'
    attendance BYTEA,  -- Array of bytes: 1=attending, 0=not, per 30-min bucket
    last_modified TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(event_id, email)
);

-- Game suggestions (existing)
CREATE TABLE event_game (
    event_id INTEGER NOT NULL,
    game_id BIGINT NOT NULL,
    user_email VARCHAR(255) NOT NULL,
    comment TEXT,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_modified TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(event_id, game_id, user_email)
);

CREATE TABLE event_game_vote (
    event_id INTEGER NOT NULL,
    game_id BIGINT NOT NULL,
    email VARCHAR(255) NOT NULL,
    vote vote,  -- ENUM: 'yes', 'no', 'novote'
    vote_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_modified TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(event_id, game_id, email)
);
```

---

**Document Status:** Living document, updated as implementation progresses
**Next Review:** After SQLx cache update and frontend implementation
