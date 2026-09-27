import moment from "moment";
import { getAttendanceBucketCount } from "./attendanceBuckets";

/**
 * Calculate default attendance buckets for an event (all buckets = 1)
 *
 * The length of the returned array must match the API's own bucket count
 * exactly, or the RSVP is rejected — see `./attendanceBuckets`.
 *
 * @param timeBegin Event start time
 * @param timeEnd Event end time
 * @returns Array of attendance buckets (1 = attending, 0 = not attending)
 */
export const calculateDefaultAttendance = (
  timeBegin: moment.Moment,
  timeEnd: moment.Moment,
): number[] =>
  Array.from({ length: getAttendanceBucketCount(timeBegin, timeEnd) }, () => 1);
