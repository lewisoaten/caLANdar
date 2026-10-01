import { useContext, useEffect, useState } from "react";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import PauseSharp from "@mui/icons-material/PauseSharp";
import PlayArrowSharp from "@mui/icons-material/PlayArrowSharp";
import { UserContext, UserDispatchContext } from "../UserProvider";
import { UserAvatar } from "./hl/UserAvatar";
import { usePrefersReducedMotion } from "./hl/usePrefersReducedMotion";
import { colors, fonts, tint, srOnly } from "./hl/tokens";

export interface ActivityTickerEvent {
  id: number;
  timestamp: string;
  message: string;
  icon: string;
  eventType: string;
  userHandle?: string | null;
  userAvatarUrl?: string | null;
  gameId?: number | null;
}

/** Ticker label + colour for an activity item (colour-coded by type). */
export function tickerKind(
  item: Pick<ActivityTickerEvent, "eventType" | "icon">,
): {
  label: string;
  color: string;
} {
  switch (item.eventType) {
    case "rsvp":
      // The API marks the response with an icon: Yes, Maybe, other.
      if (item.icon === "🎉") return { label: "RSVP", color: colors.lime };
      if (item.icon === "🙋") return { label: "RSVP", color: colors.amber };
      return { label: "RSVP", color: colors.textMuted };
    case "game_vote":
      return { label: "VOTE", color: colors.cyan };
    case "game_suggestion":
      return { label: "SUGGEST", color: colors.violetText };
    case "seat_reservation":
      return { label: "SEAT", color: colors.violetLight };
    case "event_create":
      return { label: "EVENT", color: colors.gold };
    default:
      return {
        label: item.eventType.replace(/_/g, " ").toUpperCase().slice(0, 8),
        color: colors.textDim,
      };
  }
}

/** Minimum items per marquee half, so short feeds still fill the bar. */
const MIN_RUN = 8;

/** Height of the LIVE bar; 44px so the pause button is a full touch target. */
export const TICKER_HEIGHT = 44;

export interface ActivityTickerViewProps {
  items: ReadonlyArray<ActivityTickerEvent>;
  /** `sticky`: bottom of the content column (desktop). `fixed`: above the mobile tab bar. */
  placement?: "sticky" | "fixed";
}

/**
 * The 44px LIVE bar: a chamfered LIVE tag and a 60s marquee of colour-coded
 * activity. Pauses on hover/focus or with the pause button. Under
 * prefers-reduced-motion nothing moves: the feed is listed once in a strip
 * that scrolls by hand (keyboard focusable), and there is no pause button.
 */
export function ActivityTickerView({
  items,
  placement = "sticky",
}: ActivityTickerViewProps) {
  const [paused, setPaused] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  if (items.length === 0) return null;

  const run: ActivityTickerEvent[] = [];
  if (reducedMotion) run.push(...items);
  else while (run.length < MIN_RUN) run.push(...items);

  const renderRun = (copy: number) => (
    <Box
      component={reducedMotion ? "ul" : "div"}
      sx={{
        display: "flex",
        alignItems: "center",
        flex: "none",
        m: 0,
        p: 0,
        listStyle: "none",
      }}
    >
      {run.map((item, i) => {
        const kind = tickerKind(item);
        return (
          <Box
            component={reducedMotion ? "li" : "span"}
            key={`${copy}-${i}-${item.id}`}
            sx={{
              display: "inline-flex",
              alignItems: "center",
              gap: "10px",
              px: "22px",
              whiteSpace: "nowrap",
              borderRight: `1px solid ${tint("cyan", 0.12)}`,
            }}
          >
            <Box
              component="span"
              sx={{
                fontFamily: fonts.mono,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.16em",
                color: kind.color,
              }}
            >
              {kind.label}
              {reducedMotion && (
                <Box component="span" sx={srOnly}>
                  {": "}
                </Box>
              )}
            </Box>
            {(item.userHandle || item.userAvatarUrl) && (
              <UserAvatar
                name={item.userHandle}
                src={item.userAvatarUrl}
                size={22}
              />
            )}
            <Box component="span" sx={{ fontSize: 13, color: colors.text2 }}>
              {item.message}
            </Box>
          </Box>
        );
      })}
    </Box>
  );

  return (
    <Box
      role="region"
      aria-label="Live activity"
      sx={{
        position: placement,
        bottom:
          placement === "fixed"
            ? "calc(64px + env(safe-area-inset-bottom))"
            : 0,
        left: placement === "fixed" ? 0 : undefined,
        right: placement === "fixed" ? 0 : undefined,
        zIndex: 14,
        height: TICKER_HEIGHT,
        flex: "none",
        display: "flex",
        alignItems: "stretch",
        backgroundColor: "rgba(8,10,16,0.92)",
        borderTop: `1px solid ${tint("cyan", 0.18)}`,
        backdropFilter: "blur(10px)",
        overflow: "hidden",
        "&:hover .hl-tick, &:focus-within .hl-tick": {
          animationPlayState: "paused",
        },
      }}
    >
      <Box
        aria-hidden="true"
        sx={{
          flex: "none",
          display: "flex",
          alignItems: "center",
          gap: 1,
          pl: "14px",
          pr: "22px",
          backgroundColor: colors.cyan,
          color: colors.ink,
          fontFamily: fonts.mono,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.18em",
          clipPath: "polygon(0 0,100% 0,calc(100% - 10px) 100%,0 100%)",
        }}
      >
        <Box
          component="span"
          sx={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            backgroundColor: colors.ink,
            animation: "hlPulse 1.2s ease-in-out infinite",
          }}
        />
        LIVE
      </Box>
      {reducedMotion ? (
        // Static strip: the visible list is the accessible one; it scrolls
        // horizontally by hand (focusable so keyboard users can scroll it).
        <Box
          tabIndex={0}
          aria-label="Live activity feed"
          data-testid="activity-ticker-static"
          sx={{
            flex: 1,
            minWidth: 0,
            overflowX: "auto",
            overflowY: "hidden",
            display: "flex",
            alignItems: "center",
            scrollbarWidth: "thin",
            "&:focus-visible": {
              outline: `2px solid ${colors.cyan}`,
              outlineOffset: -2,
            },
          }}
        >
          {renderRun(0)}
        </Box>
      ) : (
        <>
          {/* Screen readers get the feed once, as a plain list. */}
          <Box component="ul" sx={{ ...srOnly, m: 0, p: 0 }}>
            {items.map((item) => (
              <li key={item.id}>
                {tickerKind(item).label}: {item.message}
              </li>
            ))}
          </Box>
          <Box
            aria-hidden="true"
            sx={{
              flex: 1,
              minWidth: 0,
              overflow: "hidden",
              display: "flex",
              alignItems: "center",
              maskImage:
                "linear-gradient(90deg, transparent, #000 24px, #000 calc(100% - 48px), transparent)",
            }}
          >
            <Box
              className="hl-tick"
              data-testid="activity-ticker-track"
              sx={{
                display: "flex",
                width: "max-content",
                animation: "hlTick 60s linear infinite",
                animationPlayState: paused ? "paused" : "running",
              }}
            >
              {renderRun(0)}
              {renderRun(1)}
            </Box>
          </Box>
          <IconButton
            aria-label={paused ? "Resume live activity" : "Pause live activity"}
            aria-pressed={paused}
            onClick={() => setPaused((p) => !p)}
            sx={{
              flex: "none",
              minWidth: TICKER_HEIGHT,
              minHeight: TICKER_HEIGHT,
              width: TICKER_HEIGHT,
              height: TICKER_HEIGHT,
              borderLeft: `1px solid ${tint("cyan", 0.12)}`,
              "& svg": { fontSize: 20 },
              "&.Mui-focusVisible": {
                outline: `2px solid ${colors.cyan}`,
                outlineOffset: -2,
              },
            }}
          >
            {paused ? <PlayArrowSharp /> : <PauseSharp />}
          </IconButton>
        </>
      )}
    </Box>
  );
}

interface ActivityTickerProps {
  event_id: number;
  /** Truthy once the viewer has RSVP'd; the feed is only shown to them. */
  responded: number | boolean;
  placement?: "sticky" | "fixed";
}

/** Live activity ticker for an event; polls the API every 30s. */
export default function ActivityTicker({
  event_id,
  responded,
  placement = "sticky",
}: ActivityTickerProps) {
  const { signOut } = useContext(UserDispatchContext);
  const { token } = useContext(UserContext);
  const [feed, setFeed] = useState<{
    eventId: number;
    items: ActivityTickerEvent[];
  } | null>(null);

  useEffect(() => {
    if (!responded || !event_id) return;
    let cancelled = false;
    const load = () => {
      fetch(`/api/events/${event_id}/activity-ticker`, {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: "Bearer " + token,
        },
      })
        .then((response) => {
          if (response.status === 401) signOut();
          else if (response.ok) return response.json();
        })
        .then((data) => {
          if (!cancelled && data && Array.isArray(data.events)) {
            setFeed({ eventId: event_id, items: data.events });
          }
        })
        .catch((error) => {
          console.error("Error fetching activity ticker:", error);
        });
    };
    load();
    const interval = window.setInterval(load, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [event_id, responded, token, signOut]);

  if (!responded || feed?.eventId !== event_id) return null;
  return <ActivityTickerView items={feed.items} placement={placement} />;
}

export type { ActivityTickerProps };
