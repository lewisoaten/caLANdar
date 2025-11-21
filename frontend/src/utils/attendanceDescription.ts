import moment from "moment";

/**
 * Time periods for the 4 buckets per day
 */
const TIME_PERIODS = ["Morning", "Afternoon", "Evening", "Overnight"];

/**
 * Get a human-readable description of attendance times
 * @param attendance Array of attendance buckets (1 = attending, 0 = not attending)
 * @param timeBegin Event start time
 * @param timeEnd Event end time
 * @returns Human-readable description like "Friday evening until Sunday morning"
 */
export const getAttendanceDescription = (
  attendance: number[] | null,
  timeBegin: moment.Moment,
  timeEnd: moment.Moment,
): string => {
  if (!attendance || attendance.length === 0) {
    return "No attendance selected";
  }

  // Build the mapping of all possible buckets
  const numberOfDays =
    moment(timeEnd)
      .startOf("day")
      .diff(moment(timeBegin).startOf("day"), "days") + 1;

  const allBuckets: Array<{
    day: number;
    bucket: number;
    dayName: string;
    period: string;
  }> = [];

  for (let dayNum = 0; dayNum < numberOfDays; dayNum++) {
    const day = moment(timeBegin).startOf("day").add(dayNum, "days");
    for (let bucketNum = 0; bucketNum < 4; bucketNum++) {
      const bucketTime = moment(day).add(6 * (bucketNum + 1), "hours");
      if (
        timeBegin < moment(bucketTime).add(6, "hours") &&
        timeEnd >= bucketTime
      ) {
        allBuckets.push({
          day: dayNum,
          bucket: bucketNum,
          dayName: day.format("dddd"),
          period: TIME_PERIODS[bucketNum],
        });
      }
    }
  }

  // Filter to only selected buckets
  const selectedBuckets = allBuckets.filter(
    (_, idx) => idx < attendance.length && attendance[idx] === 1,
  );

  if (selectedBuckets.length === 0) {
    return "No attendance selected";
  }

  // Find continuous ranges
  const ranges: Array<{ start: number; end: number }> = [];
  let currentRangeStart = 0;

  for (let i = 1; i < selectedBuckets.length; i++) {
    const prev = selectedBuckets[i - 1];
    const curr = selectedBuckets[i];

    // Check if buckets are continuous
    const prevIndex = prev.day * 4 + prev.bucket;
    const currIndex = curr.day * 4 + curr.bucket;

    if (currIndex !== prevIndex + 1) {
      // End current range
      ranges.push({ start: currentRangeStart, end: i - 1 });
      currentRangeStart = i;
    }
  }
  // Add the last range
  ranges.push({ start: currentRangeStart, end: selectedBuckets.length - 1 });

  // Format ranges as text
  const rangeTexts = ranges.map((range) => {
    const start = selectedBuckets[range.start];
    const end = selectedBuckets[range.end];

    if (range.start === range.end) {
      // Single bucket
      return `${start.dayName} ${start.period.toLowerCase()}`;
    }

    if (start.day === end.day) {
      // Same day, multiple periods
      if (range.end - range.start === 1) {
        return `${
          start.dayName
        } ${start.period.toLowerCase()} and ${end.period.toLowerCase()}`;
      }
      return `${
        start.dayName
      } ${start.period.toLowerCase()} to ${end.period.toLowerCase()}`;
    }

    // Different days
    return `${start.dayName} ${start.period.toLowerCase()} until ${
      end.dayName
    } ${end.period.toLowerCase()}`;
  });

  // Join multiple ranges with commas and "and"
  if (rangeTexts.length === 1) {
    return rangeTexts[0];
  }

  if (rangeTexts.length === 2) {
    return `${rangeTexts[0]} and ${rangeTexts[1]}`;
  }

  // More than 2 ranges
  const lastRange = rangeTexts[rangeTexts.length - 1];
  const otherRanges = rangeTexts.slice(0, -1);
  return `${otherRanges.join(", ")}, and ${lastRange}`;
};
