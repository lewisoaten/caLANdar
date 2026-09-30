import * as React from "react";
import Box from "@mui/material/Box";
import type { SxProps, Theme } from "@mui/material/styles";
import { colors, fonts, tones, type HlTone } from "./tokens";

export interface KickerProps {
  children: React.ReactNode;
  /** Colour; defaults to the dim label grey. `amber` marks admin areas. */
  tone?: HlTone | "dim";
  /** Show the decorative `// ` prefix (hidden from screen readers). */
  prefix?: boolean;
  /** Element to render; defaults to `span`. */
  component?: React.ElementType;
  id?: string;
  sx?: SxProps<Theme>;
}

/** Small mono label above headings and sections: `// YOUR INVITES`. */
export function Kicker({
  children,
  tone = "dim",
  prefix = true,
  component = "span",
  id,
  sx,
}: KickerProps) {
  return (
    <Box
      component={component}
      id={id}
      sx={[
        {
          display: "block",
          m: 0,
          fontFamily: fonts.mono,
          fontSize: 11,
          fontWeight: 400,
          lineHeight: 1.4,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: tone === "dim" ? colors.textDim : tones[tone].fg,
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {prefix && <span aria-hidden="true">{"// "}</span>}
      {children}
    </Box>
  );
}

export default Kicker;
