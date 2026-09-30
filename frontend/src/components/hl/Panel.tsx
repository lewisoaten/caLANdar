import * as React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { SxProps, Theme } from "@mui/material/styles";
import { Kicker } from "./Kicker";
import {
  bracket as bracketLayers,
  colors,
  hairline,
  tint,
  tones,
  type HlTone,
} from "./tokens";

export interface PanelProps {
  children?: React.ReactNode;
  /** Heading shown in the panel header (rendered as `titleComponent`). */
  title?: React.ReactNode;
  /** Kicker above the title (or alone, as a small section label). */
  kicker?: React.ReactNode;
  /** Right-aligned header content: counts, buttons, links. */
  actions?: React.ReactNode;
  /** Heading level for `title`; defaults to `h2`. */
  titleComponent?: React.ElementType;
  /** Corner bracket accent: top-left (default), both corners, or none. */
  bracket?: "tl" | "both" | "none";
  /** Accent colour for the bracket and border (e.g. `amber` for admin cards). */
  tone?: HlTone;
  /** Body padding: `normal` = clamp(18-28px), `compact` = 16/20px, `none` for edge-to-edge lists. */
  padding?: "normal" | "compact" | "none";
  /** Root element; defaults to `section` (labelled by its title when present). */
  component?: React.ElementType;
  "aria-label"?: string;
  id?: string;
  sx?: SxProps<Theme>;
}

const bodyPadding = {
  normal: "clamp(18px, 2.4vw, 28px)",
  compact: "16px 20px",
  none: 0,
} as const;

/**
 * The standard HyperLAN surface: translucent panel, hairline border and the
 * 14px cyan corner bracket, with an optional kicker/title/actions header.
 */
export function Panel({
  children,
  title,
  kicker,
  actions,
  titleComponent = "h2",
  bracket = "tl",
  tone = "cyan",
  padding = "normal",
  component = "section",
  id,
  sx,
  ...aria
}: PanelProps) {
  const titleId = React.useId();
  const hasHeader = Boolean(title || actions);
  const accent = tones[tone].border;
  const border = tone === "cyan" ? hairline.panel : tint(tone, 0.35);

  return (
    <Box
      component={component}
      id={id}
      aria-label={aria["aria-label"]}
      aria-labelledby={title && !aria["aria-label"] ? titleId : undefined}
      sx={[
        {
          position: "relative",
          minWidth: 0,
          backgroundColor: colors.surface,
          border: `1px solid ${border}`,
          ...(bracket !== "none"
            ? bracketLayers({ color: accent, both: bracket === "both" })
            : {}),
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {hasHeader && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 1.5,
            px: 2.5,
            py: 2,
            borderBottom: `1px solid ${hairline.soft}`,
          }}
        >
          <Box
            sx={{
              flex: "1 1 auto",
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              gap: 0.5,
            }}
          >
            {kicker && (
              <Kicker tone={tone === "cyan" ? "dim" : tone}>{kicker}</Kicker>
            )}
            {title && (
              <Typography
                id={titleId}
                component={titleComponent}
                sx={{
                  m: 0,
                  fontSize: 20,
                  fontWeight: 700,
                  lineHeight: 1.2,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                {title}
              </Typography>
            )}
          </Box>
          {actions && (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 1.5,
              }}
            >
              {actions}
            </Box>
          )}
        </Box>
      )}
      {!hasHeader && kicker && (
        <Box
          sx={{
            px: padding === "none" ? 2.5 : undefined,
            pt: padding === "none" ? 2 : undefined,
            p: padding === "none" ? undefined : bodyPadding[padding],
            pb: 0,
          }}
        >
          <Kicker tone={tone === "cyan" ? "dim" : tone}>{kicker}</Kicker>
        </Box>
      )}
      {children !== undefined && children !== null && (
        <Box
          sx={{
            p: bodyPadding[padding],
            pt: !hasHeader && kicker && padding !== "none" ? 1 : undefined,
          }}
        >
          {children}
        </Box>
      )}
    </Box>
  );
}

export default Panel;
