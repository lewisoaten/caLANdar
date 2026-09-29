import { describe, test, expect, vi, beforeEach } from "vitest";
import * as Sentry from "@sentry/react";
import { ApiError } from "../utils/apiError";
import {
  captureHandledError,
  shouldShowReportDialog,
} from "../utils/sentryReporting";

vi.mock("@sentry/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@sentry/react")>()),
  captureException: vi.fn(),
}));

type DialogArgs = Parameters<typeof shouldShowReportDialog>;
const exceptionEvent = {
  type: undefined,
  exception: { values: [{ type: "Error", value: "boom" }] },
} as DialogArgs[0];

describe("shouldShowReportDialog", () => {
  test("asks for a report on an unexpected exception", () => {
    expect(
      shouldShowReportDialog(exceptionEvent, {
        originalException: new TypeError("x is undefined"),
      }),
    ).toBe(true);
  });

  test("asks for a report on a server error", () => {
    expect(
      shouldShowReportDialog(exceptionEvent, {
        originalException: new ApiError("Unable to save", 500, "db error"),
      }),
    ).toBe(true);
  });

  test("does not ask for a report on a handled client error", () => {
    expect(
      shouldShowReportDialog(exceptionEvent, {
        originalException: new ApiError("Unable to save", 409, "Seat taken"),
      }),
    ).toBe(false);
  });

  test("does not ask for a report on events without an exception", () => {
    expect(
      shouldShowReportDialog({ type: undefined } as DialogArgs[0], {}),
    ).toBe(false);
  });
});

describe("captureHandledError", () => {
  beforeEach(() => vi.mocked(Sentry.captureException).mockClear());

  test("adds the HTTP status and description as structured data", () => {
    const error = new ApiError("Unable to save", 409, "Seat taken");
    captureHandledError(error, {
      tags: { rsvp_step: "seat_reservation" },
      extra: { eventId: 14 },
    });

    expect(Sentry.captureException).toHaveBeenCalledWith(error, {
      level: "warning",
      tags: { rsvp_step: "seat_reservation", http_status: "409" },
      extra: { eventId: 14, status: 409, description: "Seat taken" },
    });
  });

  test("reports server errors at error level", () => {
    captureHandledError(new ApiError("Unable to save", 500), {});
    expect(vi.mocked(Sentry.captureException).mock.calls[0][1]).toMatchObject({
      level: "error",
      tags: { http_status: "500" },
      extra: { status: 500 },
    });
  });

  test("passes other errors through without API fields", () => {
    const error = new TypeError("Failed to fetch");
    captureHandledError(error, { tags: { rsvp_step: "rsvp" } });
    expect(Sentry.captureException).toHaveBeenCalledWith(error, {
      level: "error",
      tags: { rsvp_step: "rsvp" },
      extra: {},
    });
  });
});
