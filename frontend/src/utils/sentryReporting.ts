import * as Sentry from "@sentry/react";
import { ApiError } from "./apiError";

type BeforeSend = NonNullable<Sentry.BrowserOptions["beforeSend"]>;
type SentryEvent = Parameters<BeforeSend>[0];
type SentryHint = Parameters<BeforeSend>[1];

/**
 * A 4xx from the API: an expected outcome that the UI explains to the user
 * (a seat already taken, an inactive event), rather than a malfunction.
 */
export function isClientError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status >= 400 && error.status < 500;
}

/**
 * Reports an error the UI has caught and shown to the user.
 *
 * An ApiError's status and description are custom properties, which Sentry
 * does not serialise on its own, so they are added explicitly as structured
 * data and a searchable `http_status` tag. Client errors are reported at
 * warning level: worth seeing, but expected.
 */
export function captureHandledError(
  error: unknown,
  context: { tags?: Record<string, string>; extra?: Record<string, unknown> },
): void {
  const apiError = error instanceof ApiError ? error : undefined;
  Sentry.captureException(error, {
    level: isClientError(error) ? "warning" : "error",
    tags: {
      ...context.tags,
      ...(apiError && { http_status: String(apiError.status) }),
    },
    extra: {
      ...context.extra,
      ...(apiError && {
        status: apiError.status,
        description: apiError.description,
      }),
    },
  });
}

/**
 * Whether to ask the user for a crash report. Genuine exceptions warrant one;
 * a handled client error does not, since the UI has already told the user
 * what happened and what to do.
 */
export function shouldShowReportDialog(
  event: SentryEvent,
  hint: SentryHint,
): boolean {
  return Boolean(event.exception) && !isClientError(hint.originalException);
}
