import moment from "moment";

// Hack to decode JSON with dates to include actual moment dates
//  Credit: https://weblog.west-wind.com/posts/2014/jan/06/javascript-json-date-parsing-and-real-dates
var reISO =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}(?:\.\d*)?)(?:Z|(\+|-)([\d|:]*))?$/;

export const dateParser = function (key: string, value: string) {
  if (typeof value === "string") {
    var a = reISO.exec(value);
    if (a) return moment(value);
  }
  return value;
};
