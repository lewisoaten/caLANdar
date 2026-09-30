import * as React from "react";
import Box from "@mui/material/Box";
import type { SxProps, Theme } from "@mui/material/styles";
import EmojiEventsSharp from "@mui/icons-material/EmojiEventsSharp";
import { getTrophyColor } from "../../utils/trophyColors";

const PLACE = { 1: "1st", 2: "2nd", 3: "3rd" } as Record<number, string>;

export interface TrophyProps {
  /** Vote rank; only 1-3 render a trophy (anything else renders nothing). */
  rank: number | null | undefined;
  /** Icon size in px (default 20). */
  size?: number;
  /** Hide from assistive tech when the rank is already stated in text. */
  decorative?: boolean;
  sx?: SxProps<Theme>;
}

/** Gold / silver / bronze trophy for the top three games by votes. */
export function Trophy({
  rank,
  size = 20,
  decorative = false,
  sx,
}: TrophyProps) {
  const color = getTrophyColor(rank);
  if (!color || rank == null) return null;
  const label = `${PLACE[rank]} place`;
  return (
    <Box
      component="span"
      {...(decorative
        ? { "aria-hidden": true }
        : { role: "img", "aria-label": label, title: label })}
      sx={[
        { display: "inline-flex", color, flex: "none", lineHeight: 0 },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <EmojiEventsSharp sx={{ fontSize: size }} />
    </Box>
  );
}

export default Trophy;
