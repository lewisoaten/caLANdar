import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";

/**
 * True at the HyperLAN mobile breakpoint (viewport <= 760px).
 *
 * The theme's `md` breakpoint starts at 761px, so in `sx` the same split is
 * `{ xs: mobileValue, md: desktopValue }` or `theme.breakpoints.down("md")`.
 * Prefer those CSS forms for pure layout; use this hook only when the markup
 * itself differs (e.g. a drawer vs. a bottom sheet).
 */
export function useIsMobile(): boolean {
  const theme = useTheme();
  return useMediaQuery(theme.breakpoints.down("md"), { noSsr: true });
}

export default useIsMobile;
