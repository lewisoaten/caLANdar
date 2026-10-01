/**
 * Event banner images are stored as bare base64 (no MIME type). Every place
 * that shows one builds its data URL here, so a PNG upload isn't labelled
 * JPEG on one screen and PNG on another.
 */

/** Default banner for events without an uploaded image. */
export const DEFAULT_EVENT_IMAGE = "/static/lan_party_image.jpg";

/** Leading base64 characters of each format's magic bytes. */
const SIGNATURES: ReadonlyArray<[prefix: string, mime: string]> = [
  ["iVBORw0KGgo", "image/png"],
  ["/9j/", "image/jpeg"],
  ["R0lGOD", "image/gif"],
  ["UklGR", "image/webp"],
  ["PHN2Zy", "image/svg+xml"], // "<svg"
  ["PD94bW", "image/svg+xml"], // "<?xml"
];

/** MIME type of a base64 image, sniffed from its first bytes (JPEG if unknown). */
export function eventImageMime(base64: string): string {
  const head = base64.trimStart();
  return SIGNATURES.find(([p]) => head.startsWith(p))?.[1] ?? "image/jpeg";
}

/** `data:` URL for a stored event image. */
export const eventImageDataUrl = (base64: string) =>
  `data:${eventImageMime(base64)};base64,${base64}`;

/** Banner `src` for an event: its image, or the default banner. */
export const eventImageSrc = (image: string | undefined | null) =>
  image ? eventImageDataUrl(image) : DEFAULT_EVENT_IMAGE;
