/** Small presentational pieces shared by the Live components. */
import * as React from "react";
import Box from "@mui/material/Box";
import type { SxProps, Theme } from "@mui/material/styles";
import { UserAvatar } from "../hl/UserAvatar";
import { colors, fonts, tint } from "../hl/tokens";
import type { PersonView } from "../../live/types";
import { steamHeader } from "../../live/selectors";

/** Mono uppercase label (kickers, states, times). */
export function Mono({
  children,
  color = colors.textMuted,
  size = 10,
  weight = 700,
  spacing = "0.12em",
  sx,
  component = "span",
}: {
  children: React.ReactNode;
  color?: string;
  size?: number;
  weight?: number;
  spacing?: string;
  sx?: SxProps<Theme>;
  component?: React.ElementType;
}) {
  return (
    <Box
      component={component}
      sx={[
        {
          fontFamily: fonts.mono,
          fontSize: size,
          fontWeight: weight,
          letterSpacing: spacing,
          color,
          whiteSpace: "nowrap",
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
    </Box>
  );
}

/** Food blocks have no art: violet hatching instead. */
export const FOOD_HATCH = `repeating-linear-gradient(135deg, ${tint("violet", 0.22)} 0 8px, ${tint("violet", 0.08)} 8px 16px)`;

/** A game's header art (or the food hatch) as a CSS background. */
export function coverBackground(
  gameId: number | null,
  kind: "game" | "food",
): string {
  if (kind === "food") return FOOD_HATCH;
  const url = steamHeader(gameId);
  return url ? `url("${url}")` : "none";
}

/** A cover image box (Steam header or food hatch). */
export function Cover({
  gameId,
  kind,
  width,
  height,
  shade = 0,
  sx,
}: {
  gameId: number | null;
  kind: "game" | "food";
  width: number | string;
  height: number | string;
  shade?: number;
  sx?: SxProps<Theme>;
}) {
  return (
    <Box
      aria-hidden="true"
      sx={[
        {
          width,
          height,
          flex: "none",
          position: "relative",
          backgroundColor: tint("cyan", 0.06),
          backgroundImage: coverBackground(gameId, kind),
          backgroundSize: "cover",
          backgroundPosition: "center",
          "&::after": shade
            ? {
                content: '""',
                position: "absolute",
                inset: 0,
                background: `rgba(6,7,11,${shade})`,
              }
            : undefined,
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    />
  );
}

/** A row of small avatars, with the viewer's ringed in cyan. */
export function AvatarRow({
  people,
  size = 16,
  max = 6,
  me,
  gap = 2,
}: {
  people: (PersonView | null)[];
  size?: number;
  max?: number;
  me?: string | null;
  gap?: number;
}) {
  const shown = people.filter(Boolean).slice(0, max) as PersonView[];
  const extra = people.filter(Boolean).length - shown.length;
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: `${gap}px` }}>
      {shown.map((p) => (
        <Box
          key={p.pid}
          title={p.handle}
          sx={{
            outline: p.pid === me ? `2px solid ${colors.cyan}` : "none",
            outlineOffset: 1,
            lineHeight: 0,
          }}
        >
          <UserAvatar name={p.handle} src={p.avatarUrl} size={size} />
        </Box>
      ))}
      {extra > 0 && (
        <Mono size={9} color={colors.text2} sx={{ ml: "2px" }}>
          +{extra}
        </Mono>
      )}
    </Box>
  );
}
