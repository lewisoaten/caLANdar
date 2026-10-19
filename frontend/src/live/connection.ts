/**
 * Keeps a LiveStore in step with the server (docs/live-event/DESIGN.md §3.8,
 * §7.1): snapshot → stream token → EventSource, with the cost rules:
 *
 * - streams only open inside the live window (doors − 2h → end + 1h);
 *   outside it the snapshot is polled every minute while the page is visible;
 * - a tab hidden for 2 minutes closes its stream and resumes from its cursor
 *   when shown again (the server replays what was missed);
 * - after 4 hours without any input the stream closes until the next input
 *   (not on the wall-board);
 * - `reset` refetches the snapshot; `reconnect` (server recycle) reopens.
 */
import type { LiveLogEntry, LiveSnapshot } from "./types";
import { LiveStore, applyRow, applySnapshot } from "./store";

export const LIVE_WINDOW_BEFORE_MS = 2 * 60 * 60 * 1000;
export const LIVE_WINDOW_AFTER_MS = 60 * 60 * 1000;
export const HIDDEN_CLOSE_MS = 2 * 60 * 1000;
export const IDLE_CLOSE_MS = 4 * 60 * 60 * 1000;
export const POLL_MS = 60 * 1000;
/** Re-mint the stream token when it has less than this left. */
const TOKEN_REFRESH_MS = 60 * 60 * 1000;

/** Is `now` inside the window in which streams are held open? */
export function inLiveWindow(
  timeBegin: string,
  timeEnd: string,
  now: number,
): boolean {
  return (
    now >= Date.parse(timeBegin) - LIVE_WINDOW_BEFORE_MS &&
    now <= Date.parse(timeEnd) + LIVE_WINDOW_AFTER_MS
  );
}

export interface TransportHandlers {
  onOpen(): void;
  onRow(row: LiveLogEntry): void;
  onPing(serverTime: string): void;
  onReset(): void;
  onReconnect(): void;
  /** `fatal`: the browser gave up (e.g. 401); a new token is needed. */
  onError(fatal: boolean): void;
}

export interface TransportHandle {
  close(): void;
}

/**
 * How rows reach the client. The EventSource implementation is the default;
 * swapping in another (Supabase Realtime, plan B in §3.8) touches only this.
 */
export interface LiveTransport {
  open(
    url: string,
    token: string,
    since: number,
    handlers: TransportHandlers,
  ): TransportHandle;
}

export const eventSourceTransport: LiveTransport = {
  open(url, token, since, h) {
    const sep = url.includes("?") ? "&" : "?";
    const source = new EventSource(
      `${url}${sep}st=${encodeURIComponent(token)}&since=${since}`,
    );
    source.onopen = () => h.onOpen();
    source.onmessage = (e) => {
      try {
        h.onRow(JSON.parse(e.data) as LiveLogEntry);
      } catch {
        // Ignore a malformed row; the next snapshot fixes any gap.
      }
    };
    source.addEventListener("ping", (e) => {
      try {
        h.onPing(JSON.parse((e as MessageEvent).data).serverTime);
      } catch {
        // ignore
      }
    });
    source.addEventListener("reset", () => h.onReset());
    source.addEventListener("reconnect", () => h.onReconnect());
    source.onerror = () => h.onError(source.readyState === EventSource.CLOSED);
    return { close: () => source.close() };
  },
};

/** Where to fetch from: a signed-in gamer, or the no-login wall-board. */
export type LiveEndpoint =
  | { kind: "gamer"; eventId: number; token: string }
  | { kind: "wallboard"; wallboardToken: string };

export interface LiveConnectionOptions {
  endpoint: LiveEndpoint;
  transport?: LiveTransport;
  /** Called on a 401 from the API (the session expired). */
  onUnauthorized?: () => void;
  fetchImpl?: typeof fetch;
}

interface StreamToken {
  token: string;
  streamUrl: string;
  expiresAt: string;
}

export class LiveConnection {
  readonly store: LiveStore;
  private readonly opts: LiveConnectionOptions;
  private readonly transport: LiveTransport;
  private handle: TransportHandle | null = null;
  private streamToken: StreamToken | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private hiddenTimer: ReturnType<typeof setTimeout> | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retries = 0;
  private stopped = true;
  private idle = false;

  constructor(store: LiveStore, opts: LiveConnectionOptions) {
    this.store = store;
    this.opts = opts;
    this.transport = opts.transport ?? eventSourceTransport;
  }

  private get fetcher() {
    return this.opts.fetchImpl ?? fetch.bind(window);
  }

  private get isWallboard() {
    return this.opts.endpoint.kind === "wallboard";
  }

  private authHeaders(): Record<string, string> {
    const e = this.opts.endpoint;
    return e.kind === "gamer"
      ? { Authorization: `Bearer ${e.token}`, Accept: "application/json" }
      : { Accept: "application/json" };
  }

  private snapshotUrl() {
    const e = this.opts.endpoint;
    return e.kind === "gamer"
      ? `/api/events/${e.eventId}/live`
      : `/api/live/${encodeURIComponent(e.wallboardToken)}`;
  }

  private tokenUrl() {
    const e = this.opts.endpoint;
    return e.kind === "gamer"
      ? `/api/events/${e.eventId}/live/stream-token`
      : `/api/live/${encodeURIComponent(e.wallboardToken)}/stream-token`;
  }

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    document.addEventListener("visibilitychange", this.onVisibility);
    window.addEventListener("online", this.onOnline);
    window.addEventListener("offline", this.onOffline);
    if (!this.isWallboard) {
      for (const type of ["pointerdown", "keydown", "wheel", "touchstart"])
        window.addEventListener(type, this.onInput, { passive: true });
      this.armIdle();
    }
    void this.refresh();
  }

  stop() {
    this.stopped = true;
    this.closeStream();
    this.clearTimers();
    document.removeEventListener("visibilitychange", this.onVisibility);
    window.removeEventListener("online", this.onOnline);
    window.removeEventListener("offline", this.onOffline);
    for (const type of ["pointerdown", "keydown", "wheel", "touchstart"])
      window.removeEventListener(type, this.onInput);
  }

  /** Refetch the snapshot, then open the stream or poll as appropriate. */
  async refresh() {
    const ok = await this.loadSnapshot();
    if (this.stopped) return;
    if (ok) this.retries = 0;
    this.decideMode();
    if (!ok) this.scheduleRetry();
  }

  private async loadSnapshot(): Promise<boolean> {
    try {
      const res = await this.fetcher(this.snapshotUrl(), {
        headers: this.authHeaders(),
      });
      if (res.status === 401) {
        this.opts.onUnauthorized?.();
        this.store.update((s) => ({ ...s, error: "unauthorized" }));
        return false;
      }
      if (!res.ok) {
        this.store.update((s) => ({
          ...s,
          error:
            res.status === 403 || res.status === 404 ? "notFound" : "error",
          status: s.loaded ? s.status : "offline",
        }));
        return false;
      }
      const snapshot = (await res.json()) as LiveSnapshot;
      this.store.update((s) => applySnapshot(s, snapshot, Date.now()));
      return true;
    } catch {
      this.store.update((s) => ({ ...s, status: "offline" }));
      return false;
    }
  }

  private scheduleRetry() {
    if (this.retryTimer || this.stopped) return;
    const delay = Math.min(30000, 1000 * 2 ** this.retries);
    this.retries += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.refresh();
    }, delay);
  }

  private shouldStream(): boolean {
    const { event } = this.store.getState();
    if (!event) return false;
    if (document.visibilityState === "hidden" && !this.hiddenTimer)
      return false;
    if (this.idle) return false;
    return inLiveWindow(event.timeBegin, event.timeEnd, Date.now());
  }

  private decideMode() {
    if (this.stopped) return;
    const { event } = this.store.getState();
    if (event && !inLiveWindow(event.timeBegin, event.timeEnd, Date.now())) {
      this.closeStream();
      this.startPolling();
      return;
    }
    this.stopPolling();
    if (this.shouldStream()) void this.openStream();
    else if (!this.handle) this.setStatus("paused");
  }

  private setStatus(status: LiveConnectionStatus) {
    this.store.update((s) => (s.status === status ? s : { ...s, status }));
  }

  private startPolling() {
    this.setStatus("polling");
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => {
      if (document.visibilityState !== "hidden") void this.refresh();
    }, POLL_MS);
  }

  private stopPolling() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  private async ensureToken(): Promise<StreamToken | null> {
    const t = this.streamToken;
    if (t && Date.parse(t.expiresAt) - Date.now() > TOKEN_REFRESH_MS) return t;
    try {
      const res = await this.fetcher(this.tokenUrl(), {
        method: "POST",
        headers: this.authHeaders(),
      });
      if (res.status === 401) {
        this.opts.onUnauthorized?.();
        return null;
      }
      if (!res.ok) return null;
      this.streamToken = (await res.json()) as StreamToken;
      return this.streamToken;
    } catch {
      return null;
    }
  }

  private async openStream() {
    if (this.handle || this.stopped) return;
    this.setStatus(
      this.store.getState().status === "live" ? "reconnecting" : "connecting",
    );
    const token = await this.ensureToken();
    if (this.stopped || this.handle) return;
    if (!token) {
      this.setStatus("offline");
      this.scheduleRetry();
      return;
    }
    const since = this.store.getState().seq;
    this.handle = this.transport.open(token.streamUrl, token.token, since, {
      onOpen: () => {
        this.retries = 0;
        this.setStatus("live");
      },
      onRow: (row) => {
        this.store.update((s) => applyRow(s, row, Date.now()));
        if (this.store.getState().status !== "live") this.setStatus("live");
      },
      onPing: (serverTime) =>
        this.store.update((s) => ({
          ...s,
          serverOffset: Date.parse(serverTime) - Date.now(),
        })),
      onReset: () => {
        this.closeStream();
        void this.refresh();
      },
      onReconnect: () => {
        this.closeStream();
        this.decideMode();
      },
      onError: (fatal) => {
        if (fatal) {
          // e.g. an expired token: mint a new one and reopen.
          this.closeStream();
          this.streamToken = null;
          this.setStatus("reconnecting");
          this.scheduleRetry();
        } else {
          this.setStatus(
            navigator.onLine === false ? "offline" : "reconnecting",
          );
        }
      },
    });
  }

  private closeStream() {
    this.handle?.close();
    this.handle = null;
  }

  private clearTimers() {
    this.stopPolling();
    for (const t of [this.hiddenTimer, this.idleTimer, this.retryTimer])
      if (t) clearTimeout(t);
    this.hiddenTimer = this.idleTimer = this.retryTimer = null;
  }

  private onVisibility = () => {
    if (document.visibilityState === "hidden") {
      if (this.hiddenTimer) return;
      this.hiddenTimer = setTimeout(() => {
        this.hiddenTimer = null;
        if (document.visibilityState === "hidden") {
          this.closeStream();
          this.setStatus("paused");
        }
      }, HIDDEN_CLOSE_MS);
    } else {
      if (this.hiddenTimer) clearTimeout(this.hiddenTimer);
      this.hiddenTimer = null;
      this.decideMode();
    }
  };

  private onOnline = () => {
    this.closeStream();
    void this.refresh();
  };

  private onOffline = () => this.setStatus("offline");

  private armIdle() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      this.idle = true;
      this.closeStream();
      this.setStatus("paused");
    }, IDLE_CLOSE_MS);
  }

  private onInput = () => {
    const wasIdle = this.idle;
    this.idle = false;
    this.armIdle();
    if (wasIdle) this.decideMode();
  };
}

type LiveConnectionStatus = ReturnType<LiveStore["getState"]>["status"];
