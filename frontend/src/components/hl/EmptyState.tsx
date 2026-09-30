import * as React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { SxProps, Theme } from "@mui/material/styles";
import { Kicker } from "./Kicker";
import { colors } from "./tokens";

export interface EmptyStateProps {
  /** Short heading, e.g. "No events yet". */
  title: React.ReactNode;
  /** One line of help text. */
  description?: React.ReactNode;
  /** Large icon above the title (e.g. `<EventBusySharp />`). */
  icon?: React.ReactNode;
  /** Optional kicker, e.g. "NOTHING HERE". */
  kicker?: React.ReactNode;
  /** A button or link to resolve the empty state. */
  action?: React.ReactNode;
  /** `panel` draws its own dashed frame; `plain` sits inside an existing panel. */
  variant?: "panel" | "plain";
  sx?: SxProps<Theme>;
}

/** Placeholder for empty lists and no-results filters. */
export function EmptyState({
  title,
  description,
  icon,
  kicker,
  action,
  variant = "plain",
  sx,
}: EmptyStateProps) {
  return (
    <Box
      role="status"
      sx={[
        {
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          gap: 1.25,
          px: 2.5,
          py: 5,
          ...(variant === "panel" && {
            border: `1px dashed rgba(54,230,255,0.25)`,
            backgroundColor: colors.surface,
          }),
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {icon && (
        <Box
          aria-hidden="true"
          sx={{
            color: colors.textDim,
            display: "inline-flex",
            "& svg": { fontSize: 44 },
          }}
        >
          {icon}
        </Box>
      )}
      {kicker && <Kicker>{kicker}</Kicker>}
      <Typography
        component="p"
        sx={{
          m: 0,
          fontSize: 18,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        {title}
      </Typography>
      {description && (
        <Typography
          component="div"
          sx={{ color: colors.textMuted, fontSize: 15, maxWidth: "48ch" }}
        >
          {description}
        </Typography>
      )}
      {action && <Box sx={{ mt: 1 }}>{action}</Box>}
    </Box>
  );
}

export default EmptyState;
