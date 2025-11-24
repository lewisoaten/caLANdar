# Attendance Encoding Reference

## Overview

The `attendance` field in invitations is a byte array where each bit represents a 6-hour time block.

## Time Block Definitions

| Block Name | Time Range | Typical Hours      |
| ---------- | ---------- | ------------------ |
| Morning    | Block 0    | 6:00 AM - 12:00 PM |
| Afternoon  | Block 1    | 12:00 PM - 6:00 PM |
| Evening    | Block 2    | 6:00 PM - 12:00 AM |
| Overnight  | Block 3    | 12:00 AM - 6:00 AM |

## Byte Array Structure

### Single Day (4 blocks)

```
Byte 0:
  Bit 0: Morning
  Bit 1: Afternoon
  Bit 2: Evening
  Bit 3: Overnight
  Bits 4-7: (unused or next day)
```

### Multi-Day Event (e.g., 3 days = 12 blocks)

```
Byte 0:
  Bits 0-3: Day 1 (morning, afternoon, evening, overnight)
  Bits 4-7: Day 2 (morning, afternoon, evening, overnight)

Byte 1:
  Bits 0-3: Day 3 (morning, afternoon, evening, overnight)
  Bits 4-7: (unused if only 3 days)
```

## Example: 2-Day Weekend Event

**Event**: Friday 6pm → Sunday 6pm

**Attendance byte array**: `[0b10110111, 0b00001101]`

### Decoding:

```
Byte 0 = 0b10110111 = 183
├─ Bit 0 (0): Friday Morning (6am-12pm) - NOT AVAILABLE ❌
├─ Bit 1 (1): Friday Afternoon (12pm-6pm) - AVAILABLE ✅
├─ Bit 2 (1): Friday Evening (6pm-12am) - AVAILABLE ✅
├─ Bit 3 (1): Friday Overnight (12am-6am) - AVAILABLE ✅
├─ Bit 4 (0): Saturday Morning - NOT AVAILABLE ❌
├─ Bit 5 (1): Saturday Afternoon - AVAILABLE ✅
├─ Bit 6 (1): Saturday Evening - AVAILABLE ✅
└─ Bit 7 (1): Saturday Overnight - AVAILABLE ✅

Byte 1 = 0b00001101 = 13
├─ Bit 0 (1): Sunday Morning - AVAILABLE ✅
├─ Bit 1 (0): Sunday Afternoon - NOT AVAILABLE ❌
├─ Bit 2 (1): Sunday Evening - AVAILABLE ✅
├─ Bit 3 (1): Sunday Overnight - AVAILABLE ✅
└─ Bits 4-7: (unused)
```

**Result**: User is available for:

- Friday: 12pm-6am (afternoon, evening, overnight)
- Saturday: 12pm-6am (afternoon, evening, overnight)
- Sunday: 6am-12pm, 6pm-6am (morning, evening, overnight)

## Game Scheduling Logic

### Availability Check for a Game

A user is considered **available for a game** if:

- The game's time slot **overlaps with ANY** of their available 6-hour blocks

**Example:**

- User available: Friday 6pm-12am (evening block)
- Game scheduled: Friday 8pm-10pm (2 hours)
- **Result**: ✅ Available (game overlaps with evening block)

### Edge Case: Game spans multiple blocks

- User available: Saturday 12pm-6pm (afternoon only)
- Game scheduled: Saturday 4pm-8pm (spans afternoon + evening)
- **Result**: ✅ Available (game starts in available block)

This is a **lenient** approach - if the game overlaps ANY available block, the user counts as available.

## Implementation Notes

### Decoding in TypeScript (Frontend)

```typescript
function decodeAttendance(
  attendance: number[] | null,
  eventStart: moment.Moment,
  eventEnd: moment.Moment,
): TimeBlock[] {
  if (!attendance || attendance.length === 0) {
    return [];
  }

  const blocks: TimeBlock[] = [];
  const blockDuration = 6; // hours
  const blockNames = ["morning", "afternoon", "evening", "overnight"];

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
          end: currentTime.clone().add(blockDuration, "hours"),
          type: blockNames[bitPosition % 4],
        });
      }
    }

    currentTime.add(blockDuration, "hours");
    bitIndex++;
  }

  return blocks;
}
```

### Decoding in Rust (Backend)

```rust
fn decode_attendance(
    attendance: &[u8],
    event_start: DateTime<Utc>,
    event_end: DateTime<Utc>,
) -> Vec<TimeBlock> {
    let mut blocks = Vec::new();
    let block_duration = chrono::Duration::hours(6);

    let mut current_time = event_start.date().and_hms(6, 0, 0); // Start at 6am
    let mut bit_index = 0;

    while current_time < event_end {
        let byte_index = bit_index / 8;
        let bit_position = bit_index % 8;

        if byte_index < attendance.len() {
            let byte = attendance[byte_index];
            let is_available = (byte & (1 << bit_position)) != 0;

            if is_available {
                blocks.push(TimeBlock {
                    start: current_time,
                    end: current_time + block_duration,
                });
            }
        }

        current_time = current_time + block_duration;
        bit_index += 1;
    }

    blocks
}
```

## Fallback: No Attendance Data

If `attendance` is `null` or empty, use the main RSVP response:

- `response = "yes"` → 100% available (1.0 weight)
- `response = "maybe"` → 50% available (0.5 weight)
- `response = "no"` or `null` → 0% available (0.0 weight)

## Testing

### Test Case 1: Full Availability

```
Event: Friday 6pm → Sunday 6pm (3 days)
Attendance: [0xFF, 0x0F] // All 12 blocks set
Result: Available for all time blocks
```

### Test Case 2: Partial Availability

```
Event: Friday 6pm → Sunday 6pm
Attendance: [0xCC, 0x03] // Alternating blocks
Result: Available for specific blocks only
```

### Test Case 3: No Data

```
Event: Friday 6pm → Sunday 6pm
Attendance: null
RSVP: "yes"
Result: Treated as 100% available
```

## Calendar Display

When displaying the schedule:

- Game slots: 30-minute granularity (can start at :00 or :30)
- Availability checks: 6-hour block granularity
- **Mismatch is OK**: A game at 7:30pm can still match the "evening" block (6pm-12am)

This allows fine-grained scheduling while working with coarse-grained availability data.
