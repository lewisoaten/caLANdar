import Box from "@mui/material/Box";
import type { SxProps, Theme } from "@mui/material/styles";
import { chamfer, colors, fonts, srOnly } from "./tokens";

export interface BrandMarkProps {
  /** Tile edge in px (sidebar 32, mobile bar 30, sign-in 38). */
  size?: number;
  /** Show the "caLANdar" wordmark next to the tile. */
  wordmark?: boolean;
  /** Small mono line under the wordmark, e.g. "LAN PARTY OS". */
  tagline?: string;
  sx?: SxProps<Theme>;
}

/** The caLANdar logo: chamfered cyan "cL" tile plus the ca<b>LAN</b>dar wordmark. */
export function BrandMark({
  size = 32,
  wordmark = true,
  tagline,
  sx,
}: BrandMarkProps) {
  const cut = Math.round(size / 4);
  return (
    <Box
      sx={[
        { display: "flex", alignItems: "center", gap: 1.5, minWidth: 0 },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Box
        aria-hidden="true"
        sx={{
          width: size,
          height: size,
          flex: "none",
          display: "grid",
          placeItems: "center",
          backgroundColor: colors.cyan,
          color: colors.ink,
          fontFamily: fonts.ui,
          fontWeight: 700,
          fontSize: Math.round(size * 0.42),
          lineHeight: 1,
          clipPath: chamfer(cut),
        }}
      >
        cL
      </Box>
      {wordmark ? (
        <Box sx={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          <Box
            component="span"
            sx={{
              fontFamily: fonts.ui,
              fontWeight: 700,
              fontSize: Math.round(size * 0.6),
              letterSpacing: "0.01em",
              lineHeight: 1,
              color: colors.text,
            }}
          >
            ca
            <Box component="span" sx={{ color: colors.cyan }}>
              LAN
            </Box>
            dar
          </Box>
          {tagline && (
            <Box
              component="span"
              sx={{
                fontFamily: fonts.mono,
                fontSize: 10,
                letterSpacing: "0.16em",
                color: colors.textDim,
              }}
            >
              {tagline}
            </Box>
          )}
        </Box>
      ) : (
        <Box component="span" sx={srOnly}>
          caLANdar
        </Box>
      )}
    </Box>
  );
}

export default BrandMark;
