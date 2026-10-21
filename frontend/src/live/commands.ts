/**
 * Live commands (docs/live-event/DESIGN.md §3.5): plain REST through the
 * `/api` proxy, each with an `Idempotency-Key` so retries on bad Wi-Fi are
 * applied once. The response's entities are applied straight away, so you
 * see your own action without waiting for the stream echo.
 */
import { ApiError, apiErrorFrom } from "../utils/apiError";
import type { LiveConnection } from "./connection";
import { applyEntities, type EntityBatch, type LiveState } from "./store";

export interface CommandResult extends EntityBatch {
  seq: number;
}

/**
 * Apply a command's entities, unless the stream has already passed them: a
 * slow response must not overwrite newer state (another player's join that
 * arrived over SSE meanwhile). The cursor stays put, because the feed rows
 * up to `result.seq` still have to come from the stream.
 */
export function applyCommandResult(
  state: LiveState,
  result: CommandResult,
): LiveState {
  return result.seq > state.seq ? applyEntities(state, result) : state;
}

/** A random idempotency key. */
export function idempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto)
    return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export interface CommandOptions {
  method?: "POST" | "PUT" | "PATCH" | "DELETE";
  /** Send `?as_admin=true` (admin-only endpoints). */
  admin?: boolean;
  /** Network retries with the same key. */
  retries?: number;
}

/**
 * Send a command for the connection's event. `path` is relative to
 * `/api/events/:id/live` (or a full `/api/...` path). Throws an ApiError on rejection (409 carries the
 * reason, e.g. "Lobby full").
 */
export async function sendLiveCommand(
  connection: LiveConnection,
  token: string,
  path: string,
  body?: unknown,
  options: CommandOptions = {},
): Promise<CommandResult> {
  const eventId = connection.store.getState().eventId;
  const { method = "POST", admin = false, retries = 2 } = options;
  const key = idempotencyKey();
  // Paths are relative to the event's live API, unless they are full API
  // paths (`/api/games/...`).
  const base = path.startsWith("/api/")
    ? path
    : `/api/events/${eventId}/live${path}`;
  const url = `${base}${admin ? (base.includes("?") ? "&" : "?") + "as_admin=true" : ""}`;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
          "Idempotency-Key": key,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (!res.ok) throw await apiErrorFrom("Live action failed", res);
      const result = (await res.json()) as CommandResult;
      connection.store.update((s) => applyCommandResult(s, result));
      return result;
    } catch (e) {
      // Only network failures are retried; the server's answer is final.
      if (e instanceof ApiError) throw e;
      lastError = e;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  throw lastError;
}
