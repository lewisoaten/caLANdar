import * as React from "react";
import Box from "@mui/material/Box";
import type { SxProps, Theme } from "@mui/material/styles";
import { colors, fonts, tones, type HlTone } from "./tokens";

export interface TagProps {
  children: React.ReactNode;
  /** Accent colour. */
  tone?: HlTone;
  /** `outline` (default): tone text + border. `solid`: tone fill, dark text. */
  variant?: "outline" | "solid";
  /** Leading status dot. `"pulse"` animates it (respects reduced motion). */
  dot?: boolean | "pulse";
  /** Leading icon element, e.g. `<BoltSharp />` (sized to 14px). */
  icon?: React.ReactNode;
  /** `sm` = 10px text (inline in lists), `md` = 11-12px (default). */
  size?: "sm" | "md";
  title?: string;
  sx?: SxProps<Theme>;
}

/** Mono status label: `YOU'RE IN`, `STEAM`, `LIVE`, `EVT-001`. */
export function Tag({
  children,
  tone = "cyan",
  variant = "outline",
  dot = false,
  icon,
  size = "md",
  title,
  sx,
}: TagProps) {
  const t = tones[tone];
  const solid = variant === "solid";
  return (
    <Box
      component="span"
      title={title}
      sx={[
        {
          display: "inline-flex",
          alignItems: "center",
          gap: size === "sm" ? "5px" : "8px",
          flex: "none",
          maxWidth: "100%",
          whiteSpace: "nowrap",
          fontFamily: fonts.mono,
          fontSize: size === "sm" ? 10 : 11,
          fontWeight: solid ? 700 : 500,
          lineHeight: 1.2,
          letterSpacing: size === "sm" ? "0.14em" : "0.12em",
          textTransform: "uppercase",
          padding: size === "sm" ? "2px 6px" : "5px 9px",
          border: `1px solid ${solid ? t.solid : t.border}`,
          backgroundColor: solid ? t.solid : "transparent",
          color: solid ? colors.ink : t.fg,
          "& svg": { fontSize: size === "sm" ? 12 : 14 },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {dot && (
        <Box
          component="span"
          aria-hidden="true"
          sx={{
            width: 6,
            height: 6,
            flex: "none",
            borderRadius: "50%",
            backgroundColor: "currentColor",
            animation:
              dot === "pulse" ? "hlPulse 1.6s ease-in-out infinite" : undefined,
          }}
        />
      )}
      {icon && (
        <Box
          component="span"
          aria-hidden="true"
          sx={{ display: "inline-flex" }}
        >
          {icon}
        </Box>
      )}
      <Box
        component="span"
        sx={{ overflow: "hidden", textOverflow: "ellipsis" }}
      >
        {children}
      </Box>
    </Box>
  );
}

export default Tag;
