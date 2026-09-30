import * as React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { SxProps, Theme } from "@mui/material/styles";
import { Kicker } from "./Kicker";
import { colors, type HlTone } from "./tokens";

export interface PageHeaderProps {
  /** Page title (the page's single H1). */
  title: React.ReactNode;
  /** Kicker above the title, without the `// ` (added automatically). */
  kicker?: React.ReactNode;
  /** Kicker colour; use `amber` on admin pages. */
  kickerTone?: HlTone | "dim";
  /** Supporting paragraph under the title. */
  description?: React.ReactNode;
  /** Buttons, filters or a search field aligned to the right (wraps below on narrow screens). */
  actions?: React.ReactNode;
  sx?: SxProps<Theme>;
}

/** Page title block: kicker + uppercase H1 + optional description and actions. */
export function PageHeader({
  title,
  kicker,
  kickerTone = "dim",
  description,
  actions,
  sx,
}: PageHeaderProps) {
  return (
    <Box
      sx={[
        {
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 2,
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: "6px",
          minWidth: 0,
          flex: "1 1 auto",
        }}
      >
        {kicker && <Kicker tone={kickerTone}>{kicker}</Kicker>}
        <Typography variant="h1" sx={{ overflowWrap: "anywhere" }}>
          {title}
        </Typography>
        {description && (
          <Typography
            component="div"
            sx={{
              mt: 0.75,
              maxWidth: "62ch",
              color: colors.textMuted,
              fontSize: 16,
              lineHeight: 1.6,
            }}
          >
            {description}
          </Typography>
        )}
      </Box>
      {actions && (
        <Box
          sx={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 1.25,
            flex: "0 1 auto",
          }}
        >
          {actions}
        </Box>
      )}
    </Box>
  );
}

export default PageHeader;
