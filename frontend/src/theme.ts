import { createTheme, type Theme } from "@mui/material/styles";
import {
  bracket,
  colors as c,
  effects,
  fonts,
  hairline,
  MOBILE_MAX_WIDTH,
  tint,
} from "./components/hl/tokens";

/**
 * caLANdar "HyperLAN" theme.
 *
 * A dark HUD look built from the tokens in `components/hl/tokens.ts`:
 * cyan primary, violet secondary, lime/amber/pink status colours, square
 * corners everywhere, Chakra Petch for UI and JetBrains Mono for data.
 *
 * Signature details applied globally here:
 * - contained buttons are chamfered (the cut is drawn on a `::before` layer so
 *   the focus ring outside the button is not clipped);
 * - Card and outlined Paper get the surface fill, a hairline border and the
 *   14px cyan corner bracket;
 * - every focusable element gets the 2px cyan `:focus-visible` ring.
 *
 * See `components/hl/README.md` for the developer guide.
 */

declare module "@mui/material/styles" {
  interface TypographyVariants {
    /** `// LABEL` style: 11px mono, wide tracking, dim. */
    kicker: React.CSSProperties;
    /** Inline mono data (timestamps, ids, counts). */
    mono: React.CSSProperties;
  }
  interface TypographyVariantsOptions {
    kicker?: React.CSSProperties;
    mono?: React.CSSProperties;
  }
}

declare module "@mui/material/Typography" {
  interface TypographyPropsVariantOverrides {
    kicker: true;
    mono: true;
  }
}

// Shared input surface for TextField/OutlinedInput.
const inputSurface = {
  backgroundColor: c.surface,
  borderRadius: 0,
};

const inputLabelStyles = {
  color: c.textMuted,
  "&.Mui-focused": { color: c.cyan },
  "&.Mui-error": { color: c.pinkText },
};

const focusRing = {
  outline: `2px solid ${c.cyan}`,
  outlineOffset: 2,
};

type PaletteKey =
  "primary" | "secondary" | "success" | "warning" | "error" | "info";
const paletteKeys: PaletteKey[] = [
  "primary",
  "secondary",
  "success",
  "warning",
  "error",
  "info",
];

/** Fill/text used by contained buttons per palette colour. */
const containedColors: Record<PaletteKey, { bg: string; hover: string }> = {
  primary: { bg: c.cyan, hover: c.text },
  secondary: { bg: c.violetLight, hover: c.violetText },
  success: { bg: c.lime, hover: "#c4ff9c" },
  warning: { bg: c.amber, hover: "#ffd77f" },
  error: { bg: c.pink, hover: c.pinkText },
  info: { bg: c.cyan, hover: c.text },
};

/** Readable text colour per palette colour (outlined/text buttons, alerts). */
const readable: Record<PaletteKey, string> = {
  primary: c.cyan,
  secondary: c.violetText,
  success: c.lime,
  warning: c.amber,
  error: c.pinkText,
  info: c.cyan,
};

/** Border colour per palette colour. */
const accent: Record<PaletteKey, string> = {
  primary: c.cyan,
  secondary: c.violetLight,
  success: c.lime,
  warning: c.amber,
  error: c.pink,
  info: c.cyan,
};

const tintName: Record<PaletteKey, Parameters<typeof tint>[0]> = {
  primary: "cyan",
  secondary: "violet",
  success: "lime",
  warning: "amber",
  error: "pink",
  info: "cyan",
};

const theme: Theme = createTheme({
  breakpoints: {
    // md starts just above the 760px mobile breakpoint of the design, so
    // `theme.breakpoints.down("md")` is exactly "mobile" (<= 760px).
    values: { xs: 0, sm: 600, md: MOBILE_MAX_WIDTH + 1, lg: 1200, xl: 1536 },
  },
  palette: {
    mode: "dark",
    primary: {
      main: c.cyan,
      light: "#8af0ff",
      dark: "#1fb8cc",
      contrastText: c.ink,
    },
    secondary: {
      main: c.violet,
      light: c.violetLight,
      dark: "#6a3fe0",
      contrastText: c.ink,
    },
    success: {
      main: c.lime,
      light: "#c4ff9c",
      dark: "#6fcc33",
      contrastText: c.ink,
    },
    warning: {
      main: c.amber,
      light: "#ffd77f",
      dark: "#cc9420",
      contrastText: c.ink,
    },
    error: {
      main: c.pink,
      light: c.pinkText,
      dark: "#cc2e6e",
      contrastText: c.ink,
    },
    info: {
      main: c.cyan,
      light: "#8af0ff",
      dark: "#1fb8cc",
      contrastText: c.ink,
    },
    background: {
      default: c.bg,
      paper: c.surfaceSolid,
    },
    text: {
      primary: c.text,
      secondary: c.textMuted,
      disabled: c.textDim,
    },
    divider: hairline.panel,
    action: {
      hover: tint("cyan", 0.06),
      selected: tint("cyan", 0.12),
      focus: tint("cyan", 0.12),
      disabled: c.textDim,
      disabledBackground: tint("neutral", 0.12),
    },
  },
  shape: { borderRadius: 0 },
  typography: {
    fontFamily: fonts.ui,
    fontSize: 15,
    fontWeightRegular: 400,
    fontWeightMedium: 500,
    fontWeightBold: 700,
    h1: {
      fontSize: "clamp(34px, 4.4vw, 52px)",
      fontWeight: 700,
      lineHeight: 1,
      textTransform: "uppercase",
      letterSpacing: 0,
    },
    h2: {
      fontSize: "clamp(20px, 2vw, 26px)",
      fontWeight: 700,
      lineHeight: 1.15,
      textTransform: "uppercase",
      letterSpacing: "0.04em",
    },
    h3: {
      fontSize: 20,
      fontWeight: 700,
      lineHeight: 1.2,
      textTransform: "uppercase",
      letterSpacing: "0.04em",
    },
    h4: {
      fontSize: 18,
      fontWeight: 700,
      lineHeight: 1.25,
      textTransform: "uppercase",
      letterSpacing: "0.04em",
    },
    h5: { fontSize: 16, fontWeight: 600, lineHeight: 1.3 },
    h6: { fontSize: 15, fontWeight: 600, lineHeight: 1.35 },
    subtitle1: { fontSize: 16, fontWeight: 600, lineHeight: 1.4 },
    subtitle2: { fontSize: 14, fontWeight: 600, lineHeight: 1.4 },
    body1: { fontSize: 16, lineHeight: 1.6 },
    body2: { fontSize: 14, lineHeight: 1.55 },
    caption: { fontSize: 13, lineHeight: 1.45 },
    overline: {
      fontFamily: fonts.mono,
      fontSize: 11,
      lineHeight: 1.4,
      letterSpacing: "0.18em",
      textTransform: "uppercase",
    },
    button: {
      fontSize: 14,
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: "0.12em",
      lineHeight: 1.2,
    },
    kicker: {
      fontFamily: fonts.mono,
      fontSize: 11,
      fontWeight: 400,
      lineHeight: 1.4,
      letterSpacing: "0.18em",
      textTransform: "uppercase",
      color: c.textDim,
    },
    mono: {
      fontFamily: fonts.mono,
      fontSize: 13,
      lineHeight: 1.45,
      fontVariantNumeric: "tabular-nums",
    },
  },
  shadows: [
    "none",
    ...Array.from({ length: 24 }, (_, i) =>
      i < 8
        ? `0 ${4 + i * 2}px ${16 + i * 6}px -8px rgba(0,0,0,0.6)`
        : effects.dialog,
    ),
  ] as Theme["shadows"],
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        ":root": { colorScheme: "dark" },
        html: { WebkitFontSmoothing: "antialiased" },
        body: {
          backgroundColor: c.bg,
          color: c.text,
          fontFamily: fonts.ui,
        },
        "::selection": { backgroundColor: c.cyan, color: c.ink },
        ":focus-visible": focusRing,
        a: { color: c.cyan },
        "a:hover": { color: c.lime },
        "input::placeholder, textarea::placeholder": {
          color: c.placeholder,
          opacity: 1,
        },
        "*": {
          scrollbarWidth: "thin",
          scrollbarColor: `${hairline.control} transparent`,
        },
        "@keyframes hlPulse": {
          "0%, 100%": { opacity: 1 },
          "50%": { opacity: 0.35 },
        },
        "@keyframes hlTick": {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(-50%)" },
        },
        "@media (prefers-reduced-motion: reduce)": {
          "*, *::before, *::after": {
            animationDuration: "0.01ms !important",
            animationIterationCount: "1 !important",
            transitionDuration: "0.01ms !important",
            scrollBehavior: "auto !important",
          },
          // The ticker is static under reduced motion (no marquee at all):
          // ActivityTicker renders the feed once, scrollable by hand.
          ".hl-tick": { animation: "none !important" },
        },
      },
    },
    MuiTypography: {
      defaultProps: {
        variantMapping: {
          kicker: "span",
          mono: "span",
        },
      },
    },
    MuiButtonBase: {
      defaultProps: { disableRipple: true },
      styleOverrides: {
        // ButtonBase resets `outline: 0`, which beats the global
        // `:focus-visible` ring: restore it for every bare ButtonBase. The
        // switch draws its ring on the track instead. `:where` keeps this at
        // single-class specificity so component rings (tabs, menu items,
        // checkboxes with inset offsets) still win.
        root: {
          "&:where(.Mui-focusVisible:not(.MuiSwitch-switchBase))": focusRing,
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          borderRadius: 0,
          minHeight: 48,
          padding: "0 22px",
          gap: 8,
          whiteSpace: "nowrap",
          transition:
            "background-color .15s, color .15s, border-color .15s, box-shadow .15s",
          "&.Mui-focusVisible": focusRing,
          variants: [
            {
              props: { size: "small" },
              style: { minHeight: 44, padding: "0 14px", fontSize: 13 },
            },
            {
              props: { size: "large" },
              style: {
                minHeight: 52,
                padding: "0 28px",
                fontSize: 15,
                letterSpacing: "0.14em",
              },
            },
            // Contained: chamfered solid fill. The fill lives on ::before so
            // clip-path doesn't clip the focus ring drawn outside the button.
            {
              props: { variant: "contained" },
              style: {
                position: "relative",
                isolation: "isolate",
                fontWeight: 700,
                backgroundColor: "transparent",
                boxShadow: "none",
                "&::before": {
                  content: '""',
                  position: "absolute",
                  inset: 0,
                  zIndex: -1,
                  backgroundColor: "var(--hl-btn-bg)",
                  clipPath:
                    "polygon(var(--hl-cut) 0,100% 0,100% calc(100% - var(--hl-cut)),calc(100% - var(--hl-cut)) 100%,0 100%,0 var(--hl-cut))",
                  transition: "background-color .15s",
                },
                "--hl-cut": "10px",
                "&:hover": {
                  backgroundColor: "transparent",
                  boxShadow: "none",
                },
                "&:hover::before": { backgroundColor: "var(--hl-btn-hover)" },
                "&.Mui-disabled": {
                  color: c.textDim,
                  backgroundColor: "transparent",
                },
                "&.Mui-disabled::before": {
                  backgroundColor: tint("neutral", 0.12),
                },
              },
            },
            {
              props: { variant: "contained", size: "large" },
              style: { "--hl-cut": "12px" },
            },
            ...paletteKeys.map((key) => ({
              props: { variant: "contained" as const, color: key },
              style: {
                color: c.ink,
                "--hl-btn-bg": containedColors[key].bg,
                "--hl-btn-hover": containedColors[key].hover,
              },
            })),
            {
              props: { variant: "contained", color: "inherit" },
              style: {
                color: c.ink,
                "--hl-btn-bg": c.text,
                "--hl-btn-hover": "#ffffff",
              },
            },
            // Outlined: 1px accent border over a faint tint.
            ...paletteKeys.map((key) => ({
              props: { variant: "outlined" as const, color: key },
              style: {
                color: readable[key],
                borderColor: tint(tintName[key], 0.45),
                backgroundColor: tint(tintName[key], 0.04),
                "&:hover": {
                  borderColor: accent[key],
                  backgroundColor: tint(tintName[key], 0.12),
                },
              },
            })),
            {
              props: { variant: "outlined", color: "inherit" },
              style: {
                color: c.textMuted,
                borderColor: tint("neutral", 0.3),
                "&:hover": {
                  color: c.text,
                  borderColor: tint("neutral", 0.6),
                  backgroundColor: tint("neutral", 0.06),
                },
              },
            },
            {
              props: { variant: "outlined" },
              style: {
                "&.Mui-disabled": {
                  color: c.textDim,
                  borderColor: tint("neutral", 0.18),
                  backgroundColor: "transparent",
                },
              },
            },
            ...paletteKeys.map((key) => ({
              props: { variant: "text" as const, color: key },
              style: {
                color: readable[key],
                "&:hover": { backgroundColor: tint(tintName[key], 0.08) },
              },
            })),
            {
              props: { variant: "text" },
              style: {
                padding: "0 14px",
                "&.Mui-disabled": { color: c.textDim },
              },
            },
          ],
        },
        startIcon: { marginRight: 0, "& > *:nth-of-type(1)": { fontSize: 20 } },
        endIcon: { marginLeft: 0, "& > *:nth-of-type(1)": { fontSize: 20 } },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: 0,
          minWidth: 44,
          minHeight: 44,
          color: c.textMuted,
          "&:hover": { color: c.cyan, backgroundColor: tint("cyan", 0.08) },
          "&.Mui-focusVisible": focusRing,
          "&.Mui-disabled": { color: c.disabled },
          variants: paletteKeys.map((key) => ({
            props: { color: key },
            style: { color: readable[key] },
          })),
        },
      },
    },
    MuiFab: {
      styleOverrides: {
        root: {
          borderRadius: 0,
          boxShadow: effects.glow,
          "&.Mui-focusVisible": focusRing,
        },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          borderRadius: 0,
          minHeight: 44,
          border: `1px solid ${hairline.control}`,
          color: c.textMuted,
          fontWeight: 600,
          letterSpacing: "0.14em",
          "&.Mui-selected, &.Mui-selected:hover": {
            backgroundColor: c.cyan,
            color: c.ink,
          },
          "&.Mui-focusVisible": focusRing,
        },
      },
    },
    MuiLink: {
      defaultProps: { underline: "hover" },
      styleOverrides: {
        root: {
          color: c.cyan,
          textUnderlineOffset: 4,
          textDecorationColor: tint("cyan", 0.4),
          "&:hover": { color: c.lime, textDecorationColor: c.lime },
          "&.Mui-focusVisible, &:focus-visible": focusRing,
        },
      },
    },
    // Surfaces --------------------------------------------------------------
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          borderRadius: 0,
          backgroundImage: "none",
          backgroundColor: c.surfaceSolid,
          color: c.text,
          variants: [
            {
              props: { variant: "outlined" },
              style: {
                backgroundColor: c.surface,
                border: `1px solid ${hairline.panel}`,
                ...bracket(),
              },
            },
          ],
        },
      },
    },
    MuiCard: {
      defaultProps: { variant: "outlined" },
      styleOverrides: {
        root: {
          borderRadius: 0,
          backgroundColor: c.surface,
          border: `1px solid ${hairline.panel}`,
          ...bracket(),
        },
      },
    },
    MuiCardHeader: {
      styleOverrides: {
        root: { padding: "16px 20px" },
        title: {
          fontSize: 20,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        },
        subheader: { color: c.textMuted, fontSize: 14 },
      },
    },
    MuiCardContent: {
      styleOverrides: {
        root: { padding: 20, "&:last-child": { paddingBottom: 20 } },
      },
    },
    MuiCardActions: {
      styleOverrides: { root: { padding: "12px 20px 20px", gap: 8 } },
    },
    MuiAccordion: {
      styleOverrides: {
        root: {
          backgroundColor: c.surface,
          border: `1px solid ${hairline.panel}`,
          "&::before": { display: "none" },
        },
      },
    },
    MuiDivider: {
      styleOverrides: { root: { borderColor: hairline.soft } },
    },
    MuiAppBar: {
      defaultProps: { elevation: 0, color: "transparent" },
      styleOverrides: {
        root: {
          backgroundColor: "rgba(6,7,11,0.82)",
          backdropFilter: "blur(12px)",
          borderBottom: `1px solid ${hairline.chrome}`,
        },
      },
    },
    MuiBackdrop: {
      styleOverrides: {
        root: {
          "&:not(.MuiBackdrop-invisible)": {
            backgroundColor: effects.backdrop,
            backdropFilter: effects.backdropBlur,
          },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          backgroundColor: c.surfaceSolid,
          border: `1px solid ${tint("cyan", 0.35)}`,
          boxShadow: effects.dialog,
        },
      },
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: {
          fontSize: 22,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          lineHeight: 1.15,
          padding: "20px 24px 12px",
        },
      },
    },
    MuiDialogContent: {
      styleOverrides: { root: { padding: "12px 24px" } },
    },
    MuiDialogContentText: {
      styleOverrides: { root: { color: c.textMuted } },
    },
    MuiDialogActions: {
      styleOverrides: {
        root: {
          padding: "14px 24px 20px",
          gap: 10,
          borderTop: `1px solid ${hairline.soft}`,
          "& > :not(style) ~ :not(style)": { marginLeft: 0 },
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: c.surfaceSolid,
          backgroundImage: "none",
          borderColor: tint("cyan", 0.35),
          variants: [
            {
              props: { anchor: "right" },
              style: { boxShadow: "-30px 0 80px -20px rgba(54,230,255,0.2)" },
            },
          ],
        },
      },
    },
    MuiPopover: {
      styleOverrides: {
        paper: {
          backgroundColor: c.surfaceSolid,
          border: `1px solid ${hairline.control}`,
          boxShadow: effects.dialog,
        },
      },
    },
    MuiMenu: {
      styleOverrides: { list: { padding: "4px 0" } },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          minHeight: 44,
          fontSize: 15,
          "&:hover": { backgroundColor: tint("cyan", 0.08) },
          "&.Mui-selected, &.Mui-selected:hover": {
            backgroundColor: tint("cyan", 0.12),
            color: c.cyan,
          },
          "&.Mui-focusVisible": {
            backgroundColor: tint("cyan", 0.12),
            outline: `2px solid ${c.cyan}`,
            outlineOffset: -2,
          },
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          minHeight: 44,
          "&:hover": { backgroundColor: tint("cyan", 0.06) },
          "&.Mui-selected, &.Mui-selected:hover": {
            backgroundColor: tint("cyan", 0.08),
            color: c.cyan,
            boxShadow: `inset 2px 0 0 ${c.cyan}`,
          },
          "&.Mui-focusVisible": {
            outline: `2px solid ${c.cyan}`,
            outlineOffset: -2,
            backgroundColor: "transparent",
          },
        },
      },
    },
    MuiListItemIcon: {
      styleOverrides: { root: { color: "inherit", minWidth: 36 } },
    },
    MuiAutocomplete: {
      styleOverrides: {
        paper: {
          backgroundColor: c.surfaceSolid,
          border: `1px solid ${hairline.control}`,
        },
        option: {
          minHeight: 44,
          '&[aria-selected="true"]': {
            backgroundColor: `${tint("cyan", 0.12)} !important`,
          },
        },
      },
    },
    // Inputs ---------------------------------------------------------------
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          ...inputSurface,
          minHeight: 48,
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: hairline.control,
          },
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: hairline.strong,
          },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
            borderColor: c.cyan,
            borderWidth: 1,
          },
          "&.Mui-focused": { boxShadow: `0 0 0 3px ${tint("cyan", 0.18)}` },
          "&.Mui-error .MuiOutlinedInput-notchedOutline": {
            borderColor: c.pink,
          },
          "&.Mui-disabled .MuiOutlinedInput-notchedOutline": {
            borderColor: tint("neutral", 0.18),
          },
        },
        input: { fontSize: 15 },
      },
    },
    MuiFilledInput: {
      styleOverrides: {
        root: {
          ...inputSurface,
          "&:hover": { backgroundColor: c.surface },
          "&.Mui-focused": { backgroundColor: c.surface },
          "&::before": { borderBottomColor: hairline.control },
          "&::after": { borderBottomColor: c.cyan },
        },
      },
    },
    MuiInput: {
      styleOverrides: {
        underline: {
          "&::before": { borderBottomColor: hairline.control },
          "&::after": { borderBottomColor: c.cyan },
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: { root: inputLabelStyles },
    },
    MuiFormLabel: {
      styleOverrides: { root: inputLabelStyles },
    },
    MuiFormHelperText: {
      styleOverrides: {
        root: {
          color: c.textMuted,
          marginLeft: 0,
          "&.Mui-error": { color: c.pinkText },
        },
      },
    },
    MuiInputAdornment: {
      styleOverrides: { root: { color: c.textDim } },
    },
    MuiTextField: {
      defaultProps: { variant: "outlined" },
    },
    MuiSelect: {
      defaultProps: {
        MenuProps: {
          slotProps: {
            paper: {
              sx: {
                backgroundColor: c.surfaceSolid,
                border: `1px solid ${hairline.control}`,
                maxHeight: 360,
              },
            },
          },
        },
      },
      styleOverrides: {
        icon: { color: c.cyan },
        select: { display: "flex", alignItems: "center" },
      },
    },
    MuiNativeSelect: {
      styleOverrides: {
        select: {
          colorScheme: "dark",
          "& option": { backgroundColor: c.surfaceSolid, color: c.text },
        },
        icon: { color: c.cyan },
      },
    },
    MuiCheckbox: {
      styleOverrides: {
        root: {
          color: c.textMuted,
          borderRadius: 0,
          padding: 10,
          "&.Mui-checked, &.MuiCheckbox-indeterminate": { color: c.cyan },
          "&.Mui-focusVisible": {
            outline: `2px solid ${c.cyan}`,
            outlineOffset: -4,
          },
        },
      },
    },
    MuiRadio: {
      styleOverrides: {
        root: {
          color: c.textMuted,
          padding: 10,
          "&.Mui-checked": { color: c.cyan },
          "&.Mui-focusVisible": {
            outline: `2px solid ${c.cyan}`,
            outlineOffset: -4,
          },
        },
      },
    },
    MuiSwitch: {
      styleOverrides: {
        // Square HUD switch: 48x26 track, 18px square thumb.
        root: { width: 64, height: 44, padding: "9px 8px" },
        switchBase: {
          padding: 13,
          color: c.textDim,
          "&.Mui-checked": {
            transform: "translateX(22px)",
            color: c.cyan,
            "& + .MuiSwitch-track": {
              backgroundColor: tint("cyan", 0.2),
              borderColor: c.cyan,
              opacity: 1,
            },
          },
          "&.Mui-focusVisible + .MuiSwitch-track": focusRing,
          "&.Mui-disabled + .MuiSwitch-track": { opacity: 0.4 },
        },
        thumb: { width: 18, height: 18, borderRadius: 0, boxShadow: "none" },
        track: {
          borderRadius: 0,
          opacity: 1,
          backgroundColor: "transparent",
          border: `1px solid ${tint("neutral", 0.35)}`,
          boxSizing: "border-box",
        },
      },
    },
    MuiFormControlLabel: {
      styleOverrides: { label: { fontSize: 15 } },
    },
    MuiSlider: {
      styleOverrides: {
        // Horizontal sliders reserve the thumb's 44px touch target.
        root: { "&.MuiSlider-horizontal": { paddingBlock: 20 } },
        // A 16px square drawn inside a transparent 44×44 thumb, so the whole
        // touch target is the thumb (WCAG 2.5.8) without a bigger visual.
        thumb: {
          borderRadius: 0,
          width: 44,
          height: 44,
          backgroundColor: "transparent",
          "&::before": {
            width: 16,
            height: 16,
            inset: "50% auto auto 50%",
            transform: "translate(-50%, -50%)",
            borderRadius: 0,
            backgroundColor: "currentColor",
            boxShadow: "none",
          },
          "&::after": { display: "none" },
          "&:hover, &.Mui-active, &.Mui-focusVisible": { boxShadow: "none" },
          "&:hover::before, &.Mui-active::before": {
            boxShadow: `0 0 0 6px ${tint("cyan", 0.16)}`,
          },
          "&.Mui-focusVisible::before": focusRing,
        },
        track: { borderRadius: 0 },
        rail: { borderRadius: 0, backgroundColor: tint("cyan", 0.25) },
      },
    },
    // Data display ----------------------------------------------------------
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 0,
          fontFamily: fonts.mono,
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          height: 28,
          variants: [
            {
              props: { variant: "filled", color: "default" },
              style: {
                backgroundColor: tint("neutral", 0.1),
                color: c.text2,
                border: `1px solid ${tint("neutral", 0.25)}`,
              },
            },
            {
              props: { variant: "outlined", color: "default" },
              style: {
                color: c.textMuted,
                borderColor: tint("neutral", 0.35),
              },
            },
            ...paletteKeys.map((key) => ({
              props: { variant: "outlined" as const, color: key },
              style: {
                color: readable[key],
                borderColor: accent[key],
                backgroundColor: tint(tintName[key], 0.06),
              },
            })),
            ...paletteKeys.map((key) => ({
              props: { variant: "filled" as const, color: key },
              style: {
                color: c.ink,
                backgroundColor: containedColors[key].bg,
                fontWeight: 700,
              },
            })),
            {
              props: { size: "small" },
              style: { height: 24, fontSize: 10 },
            },
          ],
          "&.Mui-focusVisible": focusRing,
        },
        label: { paddingLeft: 10, paddingRight: 10 },
        deleteIcon: {
          color: "currentColor",
          opacity: 0.7,
          "&:hover": { color: "currentColor", opacity: 1 },
        },
      },
    },
    MuiBadge: {
      styleOverrides: {
        badge: { borderRadius: 0, fontFamily: fonts.mono, fontWeight: 700 },
      },
    },
    MuiAvatar: {
      styleOverrides: {
        root: {
          borderRadius: 0,
          clipPath: "polygon(20% 0,100% 0,100% 80%,80% 100%,0 100%,0 20%)",
          fontWeight: 700,
          fontSize: 14,
        },
        colorDefault: {
          background: `linear-gradient(135deg, ${c.violet}, ${c.cyan})`,
          color: c.ink,
        },
      },
    },
    MuiAvatarGroup: {
      styleOverrides: {
        avatar: { border: 0, marginLeft: -6 },
      },
    },
    MuiTabs: {
      styleOverrides: {
        root: { minHeight: 48, borderBottom: `1px solid ${hairline.soft}` },
        indicator: { height: 2, backgroundColor: c.cyan },
        scrollButtons: { color: c.cyan },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          minHeight: 48,
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: "0.14em",
          color: c.textMuted,
          "&.Mui-selected": { color: c.cyan },
          "&:hover": { color: c.text },
          "&.Mui-focusVisible": {
            outline: `2px solid ${c.cyan}`,
            outlineOffset: -2,
          },
        },
      },
    },
    MuiTableContainer: {
      styleOverrides: { root: { backgroundColor: "transparent" } },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottom: `1px solid ${hairline.faint}`,
          padding: "12px 16px",
        },
        head: {
          fontFamily: fonts.mono,
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: c.textDim,
          backgroundColor: "transparent",
          borderBottom: `1px solid ${hairline.soft}`,
        },
        stickyHeader: { backgroundColor: c.surfaceSolid },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          "&.MuiTableRow-hover:hover": { backgroundColor: tint("cyan", 0.04) },
          "&.Mui-selected, &.Mui-selected:hover": {
            backgroundColor: tint("cyan", 0.08),
          },
        },
      },
    },
    MuiTablePagination: {
      styleOverrides: {
        root: { color: c.textMuted },
        selectLabel: { fontFamily: fonts.mono, fontSize: 12 },
        displayedRows: { fontFamily: fonts.mono, fontSize: 12 },
      },
    },
    MuiPagination: {
      styleOverrides: { ul: { gap: 4 } },
    },
    MuiPaginationItem: {
      styleOverrides: {
        root: {
          borderRadius: 0,
          minWidth: 40,
          height: 40,
          fontFamily: fonts.mono,
          fontSize: 13,
          color: c.text2,
          border: `1px solid ${hairline.control}`,
          margin: 0,
          "&:hover": {
            borderColor: c.cyan,
            color: c.cyan,
            backgroundColor: "transparent",
          },
          "&.Mui-selected, &.Mui-selected:hover": {
            backgroundColor: c.cyan,
            borderColor: c.cyan,
            color: c.ink,
            fontWeight: 700,
          },
          "&.Mui-disabled": {
            opacity: 1,
            color: c.disabled,
            borderColor: tint("neutral", 0.12),
          },
          "&.Mui-focusVisible": focusRing,
        },
        ellipsis: { border: 0, color: c.textDim },
      },
    },
    MuiTooltip: {
      defaultProps: { arrow: true },
      styleOverrides: {
        tooltip: {
          backgroundColor: c.surfaceSolid,
          border: `1px solid ${tint("cyan", 0.3)}`,
          color: c.text,
          fontSize: 13,
          fontWeight: 500,
          borderRadius: 0,
          padding: "8px 12px",
          boxShadow: effects.dialog,
        },
        arrow: {
          color: c.surfaceSolid,
          "&::before": { border: `1px solid ${tint("cyan", 0.3)}` },
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 0,
          fontSize: 14,
          alignItems: "flex-start",
          variants: paletteKeys
            .filter((k) => k !== "primary" && k !== "secondary")
            .flatMap((key) => [
              {
                props: {
                  variant: "standard" as const,
                  severity: key as "success",
                },
                style: {
                  color: c.text,
                  backgroundColor: tint(tintName[key], 0.08),
                  border: `1px solid ${tint(tintName[key], 0.4)}`,
                  "& .MuiAlert-icon": { color: readable[key] },
                },
              },
              {
                props: {
                  variant: "outlined" as const,
                  severity: key as "success",
                },
                style: {
                  color: c.text,
                  borderColor: accent[key],
                  backgroundColor: c.surface,
                  "& .MuiAlert-icon": { color: readable[key] },
                },
              },
              {
                props: {
                  variant: "filled" as const,
                  severity: key as "success",
                },
                style: {
                  color: c.ink,
                  backgroundColor: containedColors[key].bg,
                  fontWeight: 600,
                },
              },
            ]),
        },
        message: { paddingTop: 9 },
      },
    },
    MuiAlertTitle: {
      styleOverrides: {
        root: {
          fontFamily: fonts.mono,
          fontSize: 11,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          fontWeight: 700,
        },
      },
    },
    MuiSnackbarContent: {
      styleOverrides: {
        root: {
          borderRadius: 0,
          backgroundColor: c.surfaceSolid,
          color: c.text,
          border: `1px solid ${c.cyan}`,
          boxShadow: effects.toast,
        },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          height: 6,
          borderRadius: 0,
          backgroundColor: tint("cyan", 0.12),
        },
        bar: { borderRadius: 0 },
      },
    },
    MuiCircularProgress: {
      defaultProps: { color: "primary" },
    },
    MuiSkeleton: {
      styleOverrides: {
        root: { borderRadius: 0, backgroundColor: tint("cyan", 0.06) },
      },
    },
  },
});

export default theme;
