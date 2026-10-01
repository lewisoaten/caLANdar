import { useEffect, useRef } from "react";

/**
 * Warn before leaving with unsaved changes.
 *
 * The app uses `<BrowserRouter>`, which has no navigation blocker, so this
 * covers the two ways out that can be intercepted:
 * - closing/reloading the tab (`beforeunload`, the browser's own prompt);
 * - clicking an in-app link anywhere on the page (sidebar, breadcrumb, tab
 *   bar): the click is stopped in the capture phase and `onBlocked(href)` is
 *   called so the page can ask and then navigate itself.
 * Browser back/forward can't be cancelled without a data router.
 */
export function useUnsavedChangesGuard(
  dirty: boolean,
  onBlocked: (to: string) => void,
) {
  const blocked = useRef(onBlocked);
  useEffect(() => {
    blocked.current = onBlocked;
  });

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Legacy browsers need a returnValue to show the prompt.
      e.returnValue = "";
    };
    const onClick = (e: MouseEvent) => {
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      )
        return;
      const anchor = (e.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      const to = url.pathname + url.search + url.hash;
      const here =
        window.location.pathname +
        window.location.search +
        window.location.hash;
      if (to === here) return;
      e.preventDefault();
      e.stopPropagation();
      blocked.current(to);
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);
}
