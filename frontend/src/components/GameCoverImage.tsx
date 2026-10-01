import * as React from "react";
import Box from "@mui/material/Box";
import type { SxProps, Theme } from "@mui/material/styles";
import { UserContext } from "../UserProvider";
import { DEFAULT_EVENT_IMAGE } from "../utils/eventImage";
import {
  legacyHeaderFailed,
  markLegacyHeaderFailed,
  markResolvedCoverFailed,
  resolveCover,
  resolvedCover,
  steamHeaderUrl,
} from "../utils/gameCover";
import { colors, fonts } from "./hl";

export interface GameCoverImageProps {
  appid: number;
  /** Shown as a caption on the fallback banner when there's no art. */
  name?: string;
  /** Box width (default `100%`). */
  width?: number | string;
  /** Box height. Without one the box keeps Steam's 460:215 header ratio. */
  height?: number | string;
  loading?: "lazy" | "eager";
  className?: string;
  /** Styles for the outer box (border, display, …). */
  sx?: SxProps<Theme>;
}

/**
 * `src` to show: a URL, `undefined` while asking the server, or `null` for
 * the fallback banner.
 */
type Source = string | null | undefined;

function initialSource(appid: number): Source {
  return legacyHeaderFailed(appid)
    ? resolvedCover(appid)
    : steamHeaderUrl(appid);
}

const fill = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
} as const;

function Cover({
  appid,
  name,
  width = "100%",
  height,
  loading = "lazy",
  className,
  sx,
}: GameCoverImageProps) {
  const { token } = React.useContext(UserContext);
  const [src, setSrc] = React.useState<Source>(() => initialSource(appid));
  const [bannerFailed, setBannerFailed] = React.useState(false);

  React.useEffect(() => {
    if (src !== undefined) return;
    let cancelled = false;
    void resolveCover(appid, token).then((url) => {
      if (!cancelled) setSrc(url === steamHeaderUrl(appid) ? null : url);
    });
    return () => {
      cancelled = true;
    };
  }, [src, appid, token]);

  const onError = () => {
    if (src === steamHeaderUrl(appid)) {
      markLegacyHeaderFailed(appid);
      setSrc(resolvedCover(appid));
    } else {
      markResolvedCoverFailed(appid);
      setSrc(null);
    }
  };

  return (
    <Box
      component="span"
      className={className}
      data-cover-state={
        src === null ? "fallback" : src === undefined ? "loading" : "image"
      }
      sx={[
        {
          position: "relative",
          display: "block",
          flex: "none",
          overflow: "hidden",
          width,
          height,
          aspectRatio: height === undefined ? "460 / 215" : undefined,
          backgroundColor: colors.surface2,
          containerType: "inline-size",
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {src ? (
        <Box
          component="img"
          src={src}
          alt=""
          loading={loading}
          onError={onError}
          sx={fill}
        />
      ) : null}
      {src === null && (
        <>
          {!bannerFailed && (
            <Box
              component="img"
              src={DEFAULT_EVENT_IMAGE}
              alt=""
              loading={loading}
              onError={() => setBannerFailed(true)}
              sx={fill}
            />
          )}
          <Box
            component="span"
            aria-hidden="true"
            sx={{
              position: "absolute",
              display: "block",
              inset: 0,
              background:
                "linear-gradient(180deg, rgba(6,7,11,0.55) 0%, rgba(6,7,11,0.8) 50%, rgba(6,7,11,0.92) 100%)",
            }}
          />
          {name && (
            <Box
              component="span"
              aria-hidden="true"
              data-testid="game-cover-caption"
              sx={{
                position: "absolute",
                left: "6%",
                right: "6%",
                top: "50%",
                transform: "translateY(-50%)",
                textAlign: "center",
                fontFamily: fonts.mono,
                fontWeight: 600,
                fontSize: "clamp(7px, 6.5cqi, 16px)",
                lineHeight: 1.2,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: colors.text,
                textShadow: "0 1px 2px rgba(0,0,0,0.8)",
                overflow: "hidden",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflowWrap: "anywhere",
              }}
            >
              {name}
            </Box>
          )}
        </>
      )}
    </Box>
  );
}

/**
 * A game's Steam header art, decorative (`alt=""`). Falls back from the
 * legacy Steam path, to the URL our API looks up, to the default event
 * banner captioned with the game's name, so a card is never blank or
 * broken. The box keeps its size throughout.
 */
export default function GameCoverImage(props: GameCoverImageProps) {
  // A new game starts the chain again.
  return <Cover key={props.appid} {...props} />;
}
