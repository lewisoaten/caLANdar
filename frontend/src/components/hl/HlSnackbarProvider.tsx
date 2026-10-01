import * as React from "react";
import GlobalStyles from "@mui/material/GlobalStyles";
import { styled } from "@mui/material/styles";
import {
  MaterialDesignContent,
  SnackbarProvider,
  type SnackbarProviderProps,
} from "notistack";
import { colors, effects, fonts, tones } from "./tokens";

const accentFor = {
  default: colors.cyan,
  info: colors.cyan,
  success: tones.lime.border,
  warning: tones.amber.border,
  error: tones.pink.border,
} as const;

/** notistack's toast, restyled: solid dark surface, accent border + left bar. */
const HlToast = styled(MaterialDesignContent)(() => ({
  borderRadius: 0,
  boxSizing: "border-box",
  width: "100%",
  backgroundColor: colors.surfaceSolid,
  color: colors.text,
  fontFamily: fonts.ui,
  fontSize: 14,
  fontWeight: 500,
  border: `1px solid ${colors.cyan}`,
  boxShadow: `inset 3px 0 0 ${colors.cyan}, ${effects.toast}`,
  "& #notistack-snackbar": { gap: 10 },
  "& #notistack-snackbar svg": { color: colors.cyan },
  ...Object.fromEntries(
    (Object.keys(accentFor) as Array<keyof typeof accentFor>).map((k) => [
      `&.notistack-MuiContent-${k}`,
      {
        backgroundColor: colors.surfaceSolid,
        color: colors.text,
        borderColor: accentFor[k],
        boxShadow: `inset 3px 0 0 ${accentFor[k]}, ${effects.toast}`,
        "& #notistack-snackbar svg": { color: accentFor[k] },
      },
    ]),
  ),
}));

/** The notistack components map for HyperLAN toasts. */
export const hlSnackbarComponents = {
  default: HlToast,
  info: HlToast,
  success: HlToast,
  warning: HlToast,
  error: HlToast,
} as const;

/**
 * CSS variable the app shell sets to the height of whatever fixed/sticky
 * chrome sits at the bottom of the viewport (live ticker, mobile tab bar), so
 * toasts stack just above it instead of covering it.
 */
export const TOAST_BOTTOM_VAR = "--hl-toast-bottom";

/** Class put on notistack's container (see the global styles below). */
const CONTAINER_CLASS = "hl-toasts";

const toastContainerStyles = (
  <GlobalStyles
    styles={{
      [`.notistack-SnackbarContainer.${CONTAINER_CLASS}`]: {
        bottom: `calc(var(${TOAST_BOTTOM_VAR}, 0px) + 12px) !important`,
        right: "24px",
        // One width for every toast so the stack lines up.
        width: "min(400px, calc(100vw - 48px))",
        maxWidth: "none",
        alignItems: "stretch",
        "& .notistack-Snackbar": { minWidth: 0, width: "100%" },
        // Mobile (<= 760px, the HyperLAN breakpoint): full width with the
        // page gutter.
        "@media (max-width: 760px)": {
          left: "16px !important",
          right: "16px !important",
          width: "auto",
        },
      },
    }}
  />
);

/**
 * `SnackbarProvider` pre-configured with HyperLAN toasts: bottom right (full
 * width on mobile), max 3, stacked above the shell's bottom chrome.
 */
export function HlSnackbarProvider({
  children,
  ...props
}: Partial<SnackbarProviderProps> & { children?: React.ReactNode }) {
  return (
    <SnackbarProvider
      maxSnack={3}
      anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      Components={hlSnackbarComponents}
      classes={{ containerRoot: CONTAINER_CLASS }}
      {...props}
    >
      {toastContainerStyles}
      {children}
    </SnackbarProvider>
  );
}

export default HlSnackbarProvider;
