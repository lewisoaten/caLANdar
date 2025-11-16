import moment from "moment";

/**
 * Calculate default attendance buckets for an event (all buckets = 1)
 * @param timeBegin Event start time
 * @param timeEnd Event end time
 * @returns Array of attendance buckets (1 = attending, 0 = not attending)
 */
export const calculateDefaultAttendance = (
  timeBegin: moment.Moment,
  timeEnd: moment.Moment,
): number[] => {
  const numberOfDays =
    moment(timeEnd)
      .startOf("day")
      .diff(moment(timeBegin).startOf("day"), "days") + 1;

  const dates = Array.from(Array(numberOfDays)).map((_, day_number) => {
    return Array.from(Array(4)).map((_, bucket_number) => {
      const day = moment(timeBegin).startOf("day").add(day_number, "days");
      const bucket = moment(day).add(6 * (bucket_number + 1), "hours");
      if (timeBegin < moment(bucket).add(6, "hours") && timeEnd >= bucket) {
        return 1;
      }
      return 0;
    });
  });

  return dates.flat().filter((e) => e === 1);
};
