import * as React from "react";
import Box from "@mui/material/Box";
import type { SxProps, Theme } from "@mui/material/styles";
import { chamferPct, colors, fonts } from "./tokens";

/** Gradient pairs used by generated avatars (from the design's placeholders). */
export const AVATAR_GRADIENTS: ReadonlyArray<readonly [string, string]> = [
  [colors.violet, colors.cyan],
  [colors.cyan, colors.lime],
  [colors.amber, colors.lime],
  [colors.lime, colors.pink],
  [colors.pink, colors.violet],
  [colors.cyan, colors.violet],
  [colors.pink, colors.amber],
  [colors.violet, colors.pink],
];

const EMPTY_GRADIENT = [colors.disabled, colors.disabled] as const;

/** Two-letter initials: first two letters/digits of the handle (or email local part). `?` if none. */
export function getInitials(name: string | null | undefined): string {
  const base = (name ?? "").split("@")[0];
  const chars = base.replace(/[^\p{L}\p{N}]/gu, "");
  return chars ? chars.slice(0, 2).toUpperCase() : "?";
}

/** Deterministic gradient for a name (same name, same colours, everywhere). */
export function avatarGradient(
  name: string | null | undefined,
): readonly [string, string] {
  const key = (name ?? "").trim().toLowerCase();
  if (!key) return EMPTY_GRADIENT;
  // FNV-1a: stable across sessions and browsers.
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return AVATAR_GRADIENTS[(hash >>> 0) % AVATAR_GRADIENTS.length];
}

export interface UserAvatarProps {
  /** Handle (preferred) or email; drives initials, colour and the accessible name. */
  name?: string | null;
  /** Image URL (Steam/Gravatar). Falls back to the initials tile if absent or it fails to load. */
  src?: string | null;
  /** Edge length in px. Common: 22 (ticker/chips), 36-38 (lists), 44+ (headers). */
  size?: number;
  /**
   * Decorative avatars (the default) are hidden from assistive tech because
   * the name is printed next to them. Set `false` when the avatar stands
   * alone, so it is announced as "<name>".
   */
  decorative?: boolean;
  sx?: SxProps<Theme>;
}

/** Square chamfered avatar: the user's picture, or a generated initials tile. */
export function UserAvatar({
  name,
  src,
  size = 36,
  decorative = true,
  sx,
}: UserAvatarProps) {
  const [failedSrc, setFailedSrc] = React.useState<string | null>(null);
  const showImage = Boolean(src) && failedSrc !== src;
  const [from, to] = avatarGradient(name);
  const label = name || "Unknown user";

  const a11y = decorative
    ? { "aria-hidden": true as const }
    : { role: "img", "aria-label": label };

  return (
    <Box
      component="span"
      {...a11y}
      title={decorative ? undefined : label}
      sx={[
        {
          width: size,
          height: size,
          flex: "none",
          display: "inline-grid",
          placeItems: "center",
          overflow: "hidden",
          clipPath: chamferPct,
          background: showImage
            ? colors.surface2
            : `linear-gradient(135deg, ${from}, ${to})`,
          color: name ? colors.ink : colors.text2,
          fontFamily: fonts.ui,
          fontWeight: 700,
          fontSize: Math.max(9, Math.round(size * 0.35)),
          lineHeight: 1,
          letterSpacing: 0,
          userSelect: "none",
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {showImage ? (
        <Box
          component="img"
          src={src ?? undefined}
          alt=""
          loading="lazy"
          onError={() => setFailedSrc(src ?? null)}
          sx={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
      ) : (
        getInitials(name)
      )}
    </Box>
  );
}

export default UserAvatar;
