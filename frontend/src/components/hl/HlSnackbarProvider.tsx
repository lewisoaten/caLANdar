import * as React from "react";
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

/** `SnackbarProvider` pre-configured with HyperLAN toasts (bottom right, max 3). */
export function HlSnackbarProvider({
  children,
  ...props
}: Partial<SnackbarProviderProps> & { children?: React.ReactNode }) {
  return (
    <SnackbarProvider
      maxSnack={3}
      anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      Components={hlSnackbarComponents}
      {...props}
    >
      {children}
    </SnackbarProvider>
  );
}

export default HlSnackbarProvider;
