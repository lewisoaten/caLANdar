/**
 * How seats are named in the UI. A seat has three bits of text:
 *
 * - `label` — the identifier, a short code drawn on the tile ("S1");
 * - `name` — an optional human-readable title ("Wall sofa (S)");
 * - `description` — optional free text ("Next to the fridge").
 *
 * The tile shows the identifier; everything prose or spoken uses the name
 * (falling back to the identifier), plus the identifier when it differs.
 */

export interface NamedSeat {
  label: string;
  name?: string | null;
  description?: string | null;
}

const clean = (text: string | null | undefined) => text?.trim() ?? "";

/** The seat's name, or its identifier when it has none. */
export const seatDisplayName = (seat: {
  label: string;
  name?: string | null;
}): string => clean(seat.name) || seat.label;

/** The seat's name, when it has one that says more than its identifier. */
export const seatNameIfDifferent = (seat: {
  label: string;
  name?: string | null;
}): string => {
  const name = clean(seat.name);
  return name && name.toLowerCase() !== seat.label.trim().toLowerCase()
    ? name
    : "";
};

/** The identifier, when it adds something beyond the display name. */
const extraIdentifier = (seat: NamedSeat): string =>
  seatNameIfDifferent(seat) ? seat.label : "";

/** "Wall sofa (S) · S1" — the name, then the identifier when it differs. */
export const seatHeading = (seat: NamedSeat): string =>
  [seatDisplayName(seat), extraIdentifier(seat)].filter(Boolean).join(" · ");

/** "Wall sofa (S) · S1 — Next to the fridge". */
export const seatSummary = (seat: NamedSeat): string => {
  const about = clean(seat.description);
  return about ? `${seatHeading(seat)} — ${about}` : seatHeading(seat);
};

/**
 * Start of a seat's accessible name: "S1, Wall sofa (S), Next to the fridge"
 * (the identifier first, as on the tile, then the name and description).
 */
export const seatSpokenName = (seat: NamedSeat): string =>
  [seat.label, seatNameIfDifferent(seat), clean(seat.description)]
    .filter(Boolean)
    .join(", ");
