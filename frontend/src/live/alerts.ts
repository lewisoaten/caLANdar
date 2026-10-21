/**
 * Realtime extras (DESIGN.md §8): OS notifications (and a buzz on phones)
 * for new pink alerts while the tab is in the background, and
 * client-triggered ticks so deadlines land within a second of a countdown
 * reaching zero even when the stream instance isn't ticking (§3.8).
 */
import { useEffect, useRef } from "react";
import type { Toast } from "./toasts";
import type { LiveState } from "./store";

export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

/** Show an OS notification for alerts that appear while the tab is hidden. */
export function useAlertNotifications(toasts: Toast[]) {
  const seen = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const t of toasts) {
      if (seen.current.has(t.id)) continue;
      seen.current.add(t.id);
      if (t.cls !== "alert" && t.cls !== "own") continue;
      try {
        // Browsers only allow a buzz after the user has interacted.
        if (
          typeof navigator !== "undefined" &&
          "vibrate" in navigator &&
          (
            navigator as Navigator & {
              userActivation?: { hasBeenActive: boolean };
            }
          ).userActivation?.hasBeenActive
        )
          navigator.vibrate?.([120, 60, 120]);
      } catch {
        // ignore
      }
      if (
        !notificationsSupported() ||
        Notification.permission !== "granted" ||
        document.visibilityState !== "hidden"
      )
        continue;
      try {
        new Notification(t.title, { body: t.sub ?? t.kicker, tag: t.id });
      } catch {
        // Some browsers only allow notifications from a service worker.
      }
    }
  }, [toasts]);
}

/** The next moment a server deadline passes (server ms), if any. */
export function nextDeadline(state: LiveState, now: number): number | null {
  const times: number[] = [];
  const add = (iso: string | null | undefined, plus = 0) => {
    if (!iso) return;
    const t = Date.parse(iso) + plus;
    if (t > now) times.push(t);
  };
  for (const l of Object.values(state.lobbies)) {
    add(l.graceUntil);
    if (l.status === "empty") add(l.emptySince, 5 * 60_000);
    if (l.status === "planned" || l.status === "confirmed") add(l.start);
  }
  for (const v of Object.values(state.votes)) {
    if (v.status !== "open") continue;
    add(v.settleAt);
    add(v.deadline);
  }
  for (const p of Object.values(state.people))
    add(p.presence?.switchGraceUntil ?? null);
  return times.length ? Math.min(...times) : null;
}

/**
 * Ask the server to tick just after the next deadline we can see. Debounced
 * to one call a second.
 */
export function useClientTick(
  state: LiveState,
  serverNow: () => number,
  tick: () => void,
) {
  const last = useRef(0);
  useEffect(() => {
    const now = serverNow();
    const at = nextDeadline(state, now);
    if (at == null || at - now > 6 * 3600e3) return undefined;
    const timer = setTimeout(
      () => {
        if (Date.now() - last.current < 1000) return;
        last.current = Date.now();
        tick();
      },
      Math.max(0, at - now) + 400,
    );
    return () => clearTimeout(timer);
  }, [state, serverNow, tick]);
}
