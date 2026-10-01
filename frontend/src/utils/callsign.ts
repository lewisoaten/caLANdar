/**
 * The one fallback shown wherever a gamer has not chosen a callsign yet
 * (lobby squad, game vote, seat map, roster, gamers admin), so the same person
 * never reads as "Unnamed gamer" on one screen and "Someone" on another.
 */
export const NO_CALLSIGN = "No callsign yet";

/** The gamer's callsign, or {@link NO_CALLSIGN} when it is missing or blank. */
export const displayCallsign = (handle: string | null | undefined): string => {
  const trimmed = handle?.trim();
  return trimmed ? trimmed : NO_CALLSIGN;
};
