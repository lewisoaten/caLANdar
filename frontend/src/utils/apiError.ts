/**
 * An API request that returned an unsuccessful status. Carries the status and
 * the server's description so failures can be reported and explained rather
 * than collapsed into a generic message.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly description: string | undefined;

  constructor(message: string, status: number, description?: string) {
    super(description ? `${message}: ${description}` : message);
    this.name = "ApiError";
    this.status = status;
    this.description = description;
  }
}

/**
 * Builds an ApiError from a failed response, reading the description from the
 * API's error body (`{"error": {"code", "reason", "description"}}`) if present.
 */
export async function apiErrorFrom(
  message: string,
  response: Response,
): Promise<ApiError> {
  let description: string | undefined;
  try {
    const body = await response.json();
    if (
      typeof body?.error?.description === "string" &&
      body.error.description
    ) {
      description = body.error.description;
    }
  } catch {
    // Not JSON, or no body: fall back to the status alone.
  }
  return new ApiError(message, response.status, description);
}

/**
 * The server's explanation of a failure, if it is safe to show to the user.
 * Client errors qualify (their descriptions explain what to change: a seat
 * already taken, an inactive event), and so does 502 Bad Gateway, which the
 * API uses for upstream failures (Steam, the email provider) with a message
 * written for people. Other server errors describe internals such as
 * database constraint names.
 */
export function userFacingReason(error: unknown): string | undefined {
  if (
    error instanceof ApiError &&
    ((error.status >= 400 && error.status < 500) || error.status === 502)
  ) {
    return error.description;
  }
  return undefined;
}
