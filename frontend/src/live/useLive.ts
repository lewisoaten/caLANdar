/**
 * React bindings for the Live store: one shared connection per event (or
 * wall-board) for however many components read it.
 */
import {
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { UserContext, UserDispatchContext } from "../UserProvider";
import {
  inLiveWindow,
  LiveConnection,
  msUntilLiveWindowChange,
  type LiveEndpoint,
} from "./connection";
import { LiveStore, type LiveState } from "./store";

interface Entry {
  connection: LiveConnection;
  refs: number;
  stopTimer: ReturnType<typeof setTimeout> | null;
}

const registry = new Map<string, Entry>();

const endpointKey = (e: LiveEndpoint) =>
  e.kind === "gamer"
    ? `gamer:${e.eventId}:${e.token}`
    : `wall:${e.wallboardToken}`;

/** The registry entry for an endpoint, created (not started) if missing. */
function entryFor(endpoint: LiveEndpoint, onUnauthorized?: () => void): Entry {
  const key = endpointKey(endpoint);
  let entry = registry.get(key);
  if (!entry) {
    const store = new LiveStore(
      endpoint.kind === "gamer" ? endpoint.eventId : 0,
    );
    entry = {
      connection: new LiveConnection(store, { endpoint, onUnauthorized }),
      refs: 0,
      stopTimer: null,
    };
    registry.set(key, entry);
  }
  return entry;
}

function acquire(entry: Entry) {
  if (entry.stopTimer) clearTimeout(entry.stopTimer);
  entry.stopTimer = null;
  entry.refs += 1;
  entry.connection.start();
}

function release(key: string, entry: Entry) {
  entry.refs -= 1;
  if (entry.refs > 0) return;
  // Linger briefly so a route change between two live views (or React's
  // strict-mode double mount) doesn't drop and reopen the stream.
  entry.stopTimer = setTimeout(() => {
    entry.connection.stop();
    if (registry.get(key) === entry) registry.delete(key);
  }, 5000);
}

/** The connection (and store) for an endpoint, held while mounted. */
export function useLiveConnection(
  endpoint: LiveEndpoint | null,
  onUnauthorized?: () => void,
): LiveConnection | null {
  const key = endpoint ? endpointKey(endpoint) : null;
  const entry = useMemo(
    () => (endpoint ? entryFor(endpoint, onUnauthorized) : null),
    // The key captures everything about the endpoint.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  useEffect(() => {
    if (!entry || !key) return undefined;
    acquire(entry);
    return () => release(key, entry);
  }, [entry, key]);
  return entry?.connection ?? null;
}

const emptyStore = new LiveStore(0);

/** Subscribe to a store (or nothing yet). */
export function useLiveState(connection: LiveConnection | null): LiveState {
  const store = connection?.store ?? emptyStore;
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}

/** The wall-board's live connection and state (no login). */
export function useWallboard(wallboardToken: string | null) {
  const connection = useLiveConnection(
    wallboardToken ? { kind: "wallboard", wallboardToken } : null,
  );
  const state = useLiveState(connection);
  return { connection, state };
}

/** The signed-in gamer's live connection and state for an event. */
export function useLive(eventId: number | null) {
  const { token } = useContext(UserContext);
  const { signOut } = useContext(UserDispatchContext);
  const connection = useLiveConnection(
    eventId != null && token ? { kind: "gamer", eventId, token } : null,
    signOut,
  );
  const state = useLiveState(connection);
  return { connection, state };
}

/** Longest single timer: browsers overflow past 2^31-1 ms (~24.8 days). */
const MAX_TIMER_MS = 24 * 60 * 60 * 1000;

/**
 * Whether an event is in its live window, re-evaluated when the window
 * opens or closes, so a page left open before the event starts following
 * Live when it begins.
 */
export function useInLiveWindow(
  timeBegin: string | null | undefined,
  timeEnd: string | null | undefined,
): boolean {
  const check = () =>
    timeBegin && timeEnd ? inLiveWindow(timeBegin, timeEnd, Date.now()) : false;
  const [inside, setInside] = useState(check);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!timeBegin || !timeEnd) return undefined;
    const sync = () => setInside(inLiveWindow(timeBegin, timeEnd, Date.now()));
    // Now (the times just arrived or changed), then when the window next
    // opens or closes.
    const soon = setTimeout(sync, 0);
    const wait = msUntilLiveWindowChange(timeBegin, timeEnd, Date.now());
    const later =
      wait == null
        ? null
        : setTimeout(
            () => {
              sync();
              setTick((n) => n + 1);
            },
            Math.min(wait, MAX_TIMER_MS),
          );
    return () => {
      clearTimeout(soon);
      if (later) clearTimeout(later);
    };
  }, [timeBegin, timeEnd, tick]);
  return timeBegin && timeEnd ? inside : false;
}
