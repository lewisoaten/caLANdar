import { useNow } from "../components/hl/Countdown";
import type { LiveState } from "./store";

/** Server time in ms, re-rendering every `intervalMs`. */
export function useServerNow(state: LiveState, intervalMs = 1000): number {
  return useNow(intervalMs) + state.serverOffset;
}

/** `m:ss` (or `h:mm:ss`) until `target` from `now`; `0:00` once passed. */
export function formatRemaining(target: string | number, now: number): string {
  const ms = (typeof target === "string" ? Date.parse(target) : target) - now;
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}
