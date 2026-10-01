import * as React from "react";
import Box from "@mui/material/Box";
import type { SxProps, Theme } from "@mui/material/styles";
import { colors, fonts, hairline, tones, type HlTone } from "./tokens";

export interface StatCellProps {
  /** The number/value (mono, bold). */
  value: React.ReactNode;
  /** Small caps label under the value. */
  label: React.ReactNode;
  /** Value colour; defaults to primary text. */
  tone?: HlTone | "text";
  /** `md` = 17px value (cards), `lg` = 20px (page stats). */
  size?: "md" | "lg";
  /** Optional icon shown before the value. */
  icon?: React.ReactNode;
  sx?: SxProps<Theme>;
}

/** One readout: big mono value over a small label. Use inside `StatGrid`. */
export function StatCell({
  value,
  label,
  tone = "text",
  size = "md",
  icon,
  sx,
}: StatCellProps) {
  return (
    <Box
      sx={[
        {
          backgroundColor: colors.surfaceFlat,
          padding: size === "lg" ? "12px 14px" : "8px 10px",
          display: "flex",
          flexDirection: "column",
          gap: "2px",
          minWidth: 0,
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Box
        component="span"
        sx={{
          display: "inline-flex",
          alignItems: "center",
          gap: 0.75,
          fontFamily: fonts.mono,
          fontSize: size === "lg" ? 20 : 17,
          fontWeight: 700,
          lineHeight: 1.2,
          fontVariantNumeric: "tabular-nums",
          color: tone === "text" ? colors.text : tones[tone].fg,
          "& svg": { fontSize: size === "lg" ? 20 : 17 },
        }}
      >
        {icon}
        {value}
      </Box>
      <Box
        component="span"
        sx={{
          fontFamily: fonts.mono,
          fontSize: size === "lg" ? 10 : 9,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: colors.textMuted,
          // Never truncate: labels wrap at spaces, tighten their tracking on
          // phone widths, and only break inside a word as a last resort.
          overflowWrap: "anywhere",
          "@media (max-width: 400px)": { letterSpacing: "0.04em" },
        }}
      >
        {label}
      </Box>
    </Box>
  );
}

export interface StatGridProps {
  children: React.ReactNode;
  /** Number of equal columns; defaults to the number of children. */
  columns?: number;
  sx?: SxProps<Theme>;
}

/** Row of StatCells separated by 1px hairlines. */
export function StatGrid({ children, columns, sx }: StatGridProps) {
  const count = columns ?? React.Children.count(children);
  return (
    <Box
      sx={[
        {
          display: "grid",
          gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))`,
          gap: "1px",
          backgroundColor: hairline.soft,
          border: `1px solid ${hairline.soft}`,
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
    </Box>
  );
}

export default StatCell;
