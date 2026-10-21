/**
 * Cover images are sent to the API as base64 inside the event's JSON and come
 * back with every event fetch, so large photos are scaled down before upload.
 */

/** Longest side of a stored cover image, in pixels. */
export const MAX_IMAGE_SIDE = 1920;

/** Files at or under this size, and within MAX_IMAGE_SIDE, are kept as-is. */
export const KEEP_AS_IS_BYTES = 500 * 1024;

/** Largest image to upload: base64 adds a third, and the API's JSON limit is 8 MiB. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** The image is still over MAX_UPLOAD_BYTES after scaling; the message is for people. */
export class ImageTooLargeError extends Error {}

/** Formats scaled on a canvas; GIFs (animation) and SVGs are kept as-is. */
const SCALABLE = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Size that fits `width`×`height` within `max` on its longest side. */
export function fitWithin(
  width: number,
  height: number,
  max = MAX_IMAGE_SIDE,
): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Whether a decoded image needs re-encoding before upload. */
export function needsShrinking(
  bytes: number,
  width: number,
  height: number,
): boolean {
  return bytes > KEEP_AS_IS_BYTES || Math.max(width, height) > MAX_IMAGE_SIDE;
}

const toBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(reader.result?.toString().split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

const encode = (
  canvas: HTMLCanvasElement,
  type: string,
): Promise<Blob | null> =>
  new Promise((resolve) => canvas.toBlob(resolve, type, 0.85));

/** Draws the image at its fitted size and encodes it, WebP (keeps transparency) or JPEG. */
async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    if (!needsShrinking(file.size, bitmap.width, bitmap.height)) return file;
    const { width, height } = fitWithin(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, width, height);
    // Browsers without a WebP encoder hand back PNG; use JPEG there instead.
    const webp = await encode(canvas, "image/webp");
    const blob =
      webp?.type === "image/webp" ? webp : await encode(canvas, "image/jpeg");
    return blob && blob.size < file.size ? blob : file;
  } finally {
    bitmap.close();
  }
}

/**
 * Bare base64 of `file` ready to store as a cover image, scaled down if it's
 * large. Rejects with a message for people when it's still too big to upload.
 */
export async function prepareEventImage(file: File): Promise<string> {
  const blob = SCALABLE.has(file.type) ? await shrink(file) : file;
  if (blob.size > MAX_UPLOAD_BYTES)
    throw new ImageTooLargeError(
      `That image is too large (${(blob.size / 1024 / 1024).toFixed(1)} MB). Please use one under 5 MB.`,
    );
  return toBase64(blob);
}
