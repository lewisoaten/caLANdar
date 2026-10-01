/**
 * Reports when the user starts and stops scrolling: `onChange(true)` on the
 * first scroll event, `onChange(false)` once `idleMs` pass without another.
 *
 * Cheap enough to sit on every scroll event: a passive capture listener (so
 * nested scrollers count too) that only resets a timer. No layout reads, no
 * state churn while the scroll continues. Returns a cleanup function.
 */
export function watchScrolling(
  target: Pick<EventTarget, "addEventListener" | "removeEventListener">,
  onChange: (scrolling: boolean) => void,
  idleMs = 200,
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const settle = () => {
    timer = undefined;
    onChange(false);
  };
  const onScroll = () => {
    if (timer === undefined) onChange(true);
    else clearTimeout(timer);
    timer = setTimeout(settle, idleMs);
  };
  const opts: AddEventListenerOptions = { passive: true, capture: true };
  target.addEventListener("scroll", onScroll, opts);
  return () => {
    target.removeEventListener("scroll", onScroll, opts);
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
}

/** Touch-first device (phones, tablets): where scrolling competes for frames. */
export const isCoarsePointer = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(pointer: coarse)").matches;
