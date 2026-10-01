import { describe, test, expect } from "vitest";
import { ApiError, apiErrorFrom, userFacingReason } from "../utils/apiError";

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("apiErrorFrom", () => {
  test("reads the description from the API's error body", async () => {
    const error = await apiErrorFrom(
      "Unable to save seat reservation",
      jsonResponse(409, {
        error: { code: 409, reason: "Conflict", description: "Seat taken" },
      }),
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(409);
    expect(error.description).toBe("Seat taken");
    expect(error.message).toBe("Unable to save seat reservation: Seat taken");
  });

  test("falls back to the status alone for a non-JSON body", async () => {
    const error = await apiErrorFrom(
      "Unable to save RSVP",
      new Response("<html>Bad Gateway</html>", { status: 502 }),
    );
    expect(error.status).toBe(502);
    expect(error.description).toBeUndefined();
    expect(error.message).toBe("Unable to save RSVP");
  });
});

describe("userFacingReason", () => {
  test("exposes client error descriptions", () => {
    expect(userFacingReason(new ApiError("x", 409, "Seat taken"))).toBe(
      "Seat taken",
    );
  });

  test("exposes upstream (502) descriptions written for people", () => {
    expect(
      userFacingReason(new ApiError("x", 502, "Steam API request failed")),
    ).toBe("Steam API request failed");
  });

  test("hides server error descriptions", () => {
    expect(
      userFacingReason(new ApiError("x", 500, "violates foreign key")),
    ).toBeUndefined();
  });

  test("ignores anything that is not an ApiError", () => {
    expect(userFacingReason(new TypeError("Failed to fetch"))).toBeUndefined();
  });
});
