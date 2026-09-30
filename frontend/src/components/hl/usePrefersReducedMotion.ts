import useMediaQuery from "@mui/material/useMediaQuery";

/**
 * True when the user asked the OS for reduced motion. CSS animations are
 * already slowed/stopped globally by the theme's CssBaseline; use this for
 * motion driven from JavaScript (timers, scroll animations).
 */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery("(prefers-reduced-motion: reduce)", { noSsr: true });
}

export default usePrefersReducedMotion;
