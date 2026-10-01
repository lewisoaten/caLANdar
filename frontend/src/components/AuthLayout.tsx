import * as React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { BrandMark, colors, fonts, hairline } from "./hl";
import { DEFAULT_EVENT_IMAGE } from "./eventListModel";

/**
 * Full-bleed two-column frame shared by Sign in and Verify email: a hero with
 * the LAN photo, brand and pitch (the page's H1) on the left, and the form
 * column on the right. Stacks on narrow screens. The shell renders these
 * pages without chrome and already provides `<main>`.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 440px), 1fr))",
      }}
    >
      <Box
        component="section"
        aria-labelledby="auth-hero-title"
        sx={{
          position: "relative",
          overflow: "hidden",
          minHeight: "clamp(260px,40vh,100vh)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          p: "clamp(22px,4vw,56px)",
          // The grid is two columns from 880px (2 x 440px minimum).
          borderBottom: `1px solid ${hairline.chrome}`,
          "@media (min-width: 880px)": {
            borderBottom: 0,
            borderRight: `1px solid ${hairline.chrome}`,
          },
        }}
      >
        <Box
          aria-hidden="true"
          sx={{
            position: "absolute",
            inset: 0,
            backgroundImage: `url('${DEFAULT_EVENT_IMAGE}')`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundColor: colors.surface2,
            filter: "saturate(1.2)",
          }}
        />
        <Box
          aria-hidden="true"
          sx={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(160deg,rgba(6,7,11,0.55) 0%,rgba(6,7,11,0.85) 55%,#06070b 100%)",
          }}
        />
        <Box
          aria-hidden="true"
          sx={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "repeating-linear-gradient(0deg,rgba(255,255,255,0.025) 0 1px,transparent 1px 3px)",
          }}
        />
        <BrandMark size={38} sx={{ position: "relative" }} />
        <Box
          sx={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            gap: "18px",
            pt: 4,
          }}
        >
          <Box
            component="span"
            sx={{
              fontFamily: fonts.mono,
              fontSize: 12,
              letterSpacing: "0.18em",
              color: colors.lime,
            }}
          >
            <span aria-hidden="true">{"// "}</span>LAN PARTY OS
          </Box>
          <Typography
            id="auth-hero-title"
            component="h1"
            sx={{
              m: 0,
              fontSize: "clamp(40px,6vw,84px)",
              lineHeight: 0.92,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "-0.01em",
              textWrap: "balance",
              maxWidth: "11ch",
            }}
          >
            Plan the LAN.{" "}
            <Box component="span" sx={{ color: colors.cyan }}>
              Claim your desk.
            </Box>
          </Typography>
          <Typography
            component="p"
            sx={{
              m: 0,
              maxWidth: "44ch",
              fontSize: 17,
              lineHeight: 1.6,
              color: colors.text2,
            }}
          >
            RSVP, pick a seat, vote on the games and see who&apos;s playing
            when. All in one place.
          </Typography>
        </Box>
      </Box>
      <Box
        component="section"
        aria-labelledby="auth-form-title"
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          p: "clamp(28px,5vw,64px) clamp(18px,4vw,56px)",
        }}
      >
        <Box
          sx={{
            width: "100%",
            maxWidth: 420,
            display: "flex",
            flexDirection: "column",
            gap: "28px",
          }}
        >
          {children}
        </Box>
      </Box>
    </Box>
  );
}

/** Mono label above the form heading ("PLAYER LOGIN"). */
export function AuthKicker({
  children,
  color = colors.textDim,
}: {
  children: React.ReactNode;
  color?: string;
}) {
  return (
    <Box
      component="span"
      sx={{
        fontFamily: fonts.mono,
        fontSize: 12,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color,
      }}
    >
      {children}
    </Box>
  );
}

/** The form column's H2 ("Jump in", "Check your inbox"). */
export function AuthTitle({
  children,
  size = "clamp(34px,4vw,44px)",
  ref,
}: {
  children: React.ReactNode;
  size?: string;
  /** Focus target when the view changes (focusable via script only). */
  ref?: React.Ref<HTMLHeadingElement>;
}) {
  return (
    <Typography
      ref={ref}
      id="auth-form-title"
      component="h2"
      tabIndex={-1}
      sx={{
        m: 0,
        fontSize: size,
        fontWeight: 700,
        textTransform: "uppercase",
        lineHeight: 1,
        outline: "none",
      }}
    >
      {children}
    </Typography>
  );
}

/** Solid chamfered 56px CTA styling shared by the auth forms. */
export const authCtaSx = {
  minHeight: 56,
  fontSize: 15,
  letterSpacing: "0.16em",
} as const;

/** Very small sanity check; the server is the real judge of the address. */
export const looksLikeEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

/** Mono label above an auth form field. */
export const fieldLabelSx = {
  fontFamily: fonts.mono,
  fontSize: 11,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: colors.textMuted,
} as const;

/** 56px email/token input from the design. */
export const bigInputSx = {
  "& .MuiOutlinedInput-root": {
    minHeight: 56,
    backgroundColor: "rgba(12,15,24,0.9)",
  },
  "& .MuiOutlinedInput-input": { fontSize: 17, px: 2 },
  "& .MuiOutlinedInput-notchedOutline": {
    borderColor: "rgba(54,230,255,0.35)",
  },
} as const;
