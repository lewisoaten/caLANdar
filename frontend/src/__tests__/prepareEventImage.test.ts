import { describe, expect, test } from "vitest";
import {
  ImageTooLargeError,
  KEEP_AS_IS_BYTES,
  MAX_IMAGE_SIDE,
  MAX_UPLOAD_BYTES,
  fitWithin,
  needsShrinking,
  prepareEventImage,
} from "../utils/prepareEventImage";

describe("prepareEventImage", () => {
  test("fits the longest side within the maximum, keeping the shape", () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 1920, height: 1440 });
    expect(fitWithin(1000, 4000)).toEqual({ width: 480, height: 1920 });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });

  test("keeps small images as they are", () => {
    expect(needsShrinking(KEEP_AS_IS_BYTES, 1600, 900)).toBe(false);
    expect(needsShrinking(KEEP_AS_IS_BYTES + 1, 1600, 900)).toBe(true);
    expect(needsShrinking(1000, MAX_IMAGE_SIDE + 1, 900)).toBe(true);
  });

  test("passes formats it can't scale through as base64", async () => {
    const gif = new File([new Uint8Array([0x47, 0x49, 0x46, 0x38])], "a.gif", {
      type: "image/gif",
    });
    expect(await prepareEventImage(gif)).toBe("R0lGOA==");
  });

  test("refuses an image still too large to upload", async () => {
    const huge = new File([new Uint8Array(MAX_UPLOAD_BYTES + 1)], "a.gif", {
      type: "image/gif",
    });
    await expect(prepareEventImage(huge)).rejects.toBeInstanceOf(
      ImageTooLargeError,
    );
  });
});
