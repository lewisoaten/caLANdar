import * as React from "react";
import { useContext, useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import LinearProgress from "@mui/material/LinearProgress";
import SyncSharp from "@mui/icons-material/SyncSharp";
import TaskAltSharp from "@mui/icons-material/TaskAltSharp";
import HourglassTopSharp from "@mui/icons-material/HourglassTopSharp";
import StorageSharp from "@mui/icons-material/StorageSharp";
import { useSnackbar } from "notistack";
import { UserContext, UserDispatchContext } from "../UserProvider";
import { colors, fonts, tint, useNow } from "./hl";
import { formatAgo, formatCount } from "./adminListUtils";
import { apiErrorFrom } from "../utils/apiError";

type BoolState = [boolean, React.Dispatch<React.SetStateAction<boolean>>];

/** The most recent refresh, which runs in the background on the server. */
export interface SteamCacheRefreshState {
  running: boolean;
  startedAt: string | null;
  /** Games added by the last finished refresh. */
  gamesAdded: number | null;
  /** Why the last refresh failed, if it did. */
  error: string | null;
}

/** `GET /steam-game-update-v2/stats` */
export interface SteamCacheStats {
  gamesCached: number;
  lastRefreshed: string | null;
  refresh?: SteamCacheRefreshState;
}

/** What a finished refresh reports back to the caller. */
export interface SteamCacheRefreshResult {
  gamesCached: number;
  lastRefreshed: string | null;
  gamesAdded?: number | null;
}

interface RefreshGamesButtonProps {
  /** Optional externally-owned loading state (so it survives remounts). */
  loadingState?: BoolState;
  /** Optional externally-owned "finished" state. */
  doneState?: BoolState;
  /** Button label; defaults to "Refresh cache". */
  label?: string;
  /** Called with the refreshed cache stats when the POST succeeds. */
  onRefreshed?: (result: SteamCacheRefreshResult | null) => void;
  /**
   * Called with the HTTP status (0 for a network error) and the server's
   * explanation, if any, when it fails.
   */
  onError?: (status: number, description?: string) => void;
  /**
   * Announce the outcome with a toast (default). Callers that show the
   * outcome inline in a live region pass `false` so it is reported once.
   */
  toasts?: boolean;
}

/**
 * The API's short explanation of a failed refresh. Older servers embedded
 * Steam's HTML error page in it, so anything markup-like or long is dropped
 * in favour of the generic message.
 */
export function safeDescription(text: string | undefined): string | undefined {
  const t = text?.trim();
  if (!t || t.length > 200 || /<[a-z!/]/i.test(t)) return undefined;
  return t;
}

const REFRESH_URL = "/api/steam-game-update-v2?as_admin=true";
const STATS_URL = "/api/steam-game-update-v2/stats?as_admin=true";

/** How often to ask the server whether the refresh has finished. */
const POLL_MS = 3_000;
/** Give up waiting once the server itself presumes a refresh dead. */
const POLL_LIMIT_MS = 30 * 60_000;

/**
 * Admin action: refresh the server's Steam game cache. The POST
 * (`/api/steam-game-update-v2?as_admin=true`) only starts the refresh, since
 * a full refresh outlasts the proxy's request timeout; the button then polls
 * the stats endpoint until it finishes. There is no finer progress, so
 * callers show an indeterminate bar while `loading` is true (see
 * {@link SteamGameCacheCard}). Setting `loadingState` to true from outside
 * resumes polling, e.g. for a refresh that was already running.
 */
export default function RefreshGamesButton(props: RefreshGamesButtonProps) {
  const { signOut } = useContext(UserDispatchContext);
  const userDetails = useContext(UserContext);
  const token = userDetails?.token;
  const { enqueueSnackbar } = useSnackbar();

  const ownLoading = useState(false);
  const ownDone = useState(false);
  const [loading, setLoading] = props.loadingState ?? ownLoading;
  const [done, setDone] = props.doneState ?? ownDone;
  const { onRefreshed, onError, toasts = true } = props;

  const latest = React.useRef({ onRefreshed, onError, toasts });

  function succeed(result: SteamCacheRefreshResult | null) {
    setLoading(false);
    setDone(true);
    if (latest.current.toasts) {
      enqueueSnackbar(
        result && typeof result.gamesCached === "number"
          ? `Steam game cache refreshed: ${formatCount(result.gamesCached)} games`
          : "Steam game cache refreshed",
        { variant: "success" },
      );
    }
    latest.current.onRefreshed?.(result);
  }

  function fail(status: number, description?: string) {
    setLoading(false);
    if (latest.current.toasts) {
      enqueueSnackbar(
        description ??
          `Couldn't refresh the Steam game cache${status ? ` (error ${status})` : ""}. Please try again.`,
        { variant: "error" },
      );
    }
    latest.current.onError?.(status, description);
  }
  const outcome = React.useRef({ succeed, fail });
  // The polling effect outlives renders; give it the current handlers.
  useEffect(() => {
    latest.current = { onRefreshed, onError, toasts };
    outcome.current = { succeed, fail };
  });

  // While a refresh is in flight, poll the server for its outcome.
  useEffect(() => {
    if (!loading || !token) return undefined;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const started = Date.now();
    const tick = async () => {
      let stats: SteamCacheStats | null = null;
      try {
        const response = await fetch(STATS_URL, {
          headers: {
            Accept: "application/json",
            Authorization: "Bearer " + token,
          },
        });
        if (cancelled) return;
        if (response.status === 401) {
          setLoading(false);
          signOut();
          return;
        }
        if (response.ok) stats = (await response.json()) as SteamCacheStats;
      } catch (error) {
        // Transient; keep waiting.
        console.error("Couldn't check the Steam cache refresh", error);
      }
      if (cancelled) return;
      const refresh = stats?.refresh;
      if (stats && refresh && !refresh.running) {
        if (refresh.error) {
          outcome.current.fail(0, safeDescription(refresh.error));
        } else {
          outcome.current.succeed({
            gamesCached: stats.gamesCached,
            lastRefreshed: stats.lastRefreshed,
            gamesAdded: refresh.gamesAdded,
          });
        }
        return;
      }
      if (Date.now() - started > POLL_LIMIT_MS) {
        outcome.current.fail(
          0,
          "The refresh is taking too long; check back later.",
        );
        return;
      }
      timer = setTimeout(() => void tick(), POLL_MS);
    };
    timer = setTimeout(() => void tick(), POLL_MS / 3);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [loading, token, signOut, setLoading]);

  async function handleClick() {
    setLoading(true);
    setDone(false);
    let status = 0;
    let description: string | undefined;
    try {
      const response = await fetch(REFRESH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: "Bearer " + token,
        },
      });
      status = response.status;
      if (response.status === 401) {
        setLoading(false);
        signOut();
        return;
      }
      if (response.ok) {
        // Started (202); the polling effect reports the outcome. A server
        // that still refreshes inside the request answers 200 with the result.
        if (response.status === 200) {
          let result: SteamCacheRefreshResult | null = null;
          try {
            result = (await response.json()) as SteamCacheRefreshResult | null;
          } catch {
            result = null;
          }
          succeed(result);
        }
        return;
      }
      description = safeDescription(
        (await apiErrorFrom("Steam cache refresh failed", response))
          .description,
      );
    } catch (error) {
      console.error("Steam cache refresh failed", error);
    }
    fail(status, description);
  }

  return (
    <Button
      variant="outlined"
      color="warning"
      onClick={() => void handleClick()}
      disabled={loading}
      aria-busy={loading || undefined}
      startIcon={
        loading ? (
          <HourglassTopSharp />
        ) : done ? (
          <TaskAltSharp />
        ) : (
          <SyncSharp />
        )
      }
      sx={{
        flex: "none",
        px: 2.5,
        "&.Mui-disabled": {
          color: colors.amber,
          borderColor: tint("amber", 0.35),
          backgroundColor: tint("amber", 0.08),
          cursor: "progress",
        },
      }}
    >
      {loading ? "Refreshing…" : (props.label ?? "Refresh cache")}
    </Button>
  );
}

type Phase = "idle" | "busy" | "done" | "error";

interface SteamGameCacheCardProps {
  /** Clock for relative times (tests/stories). */
  now?: number;
}

/**
 * The amber "Steam game cache" card on the Gamers admin page: cache size and
 * last refresh (from the stats endpoint), the Refresh button, an
 * indeterminate progress bar while the refresh runs, and the result.
 */
export function SteamGameCacheCard({ now }: SteamGameCacheCardProps) {
  const { signOut } = useContext(UserDispatchContext);
  const { token } = useContext(UserContext);

  const [stats, setStats] = useState<SteamCacheStats | null>(null);
  const [statsFailed, setStatsFailed] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [added, setAdded] = useState<number | null>(null);
  const [failure, setFailure] = useState<{
    status: number;
    description?: string;
  }>({ status: 0 });
  const loadingState = useState(false);
  const doneState = useState(false);
  const [busy, setBusy] = loadingState;

  const [statsReload, setStatsReload] = useState(0);
  const clockNow = useNow(60_000);
  const clock = now ?? clockNow;

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(STATS_URL, {
          headers: {
            Accept: "application/json",
            Authorization: "Bearer " + token,
          },
        });
        if (cancelled) return;
        if (response.status === 401) {
          signOut();
          return;
        }
        if (!response.ok) throw new Error(String(response.status));
        const body = (await response.json()) as SteamCacheStats;
        if (cancelled) return;
        setStats(body);
        setStatsFailed(false);
        // Someone already started a refresh (maybe before a reload): follow it.
        if (body.refresh?.running) setBusy(true);
      } catch (error) {
        console.error("Couldn't load Steam cache stats", error);
        if (!cancelled) setStatsFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, signOut, statsReload, setBusy]);

  const summary = (s: SteamCacheStats) =>
    `${formatCount(s.gamesCached)} games cached · ${
      s.lastRefreshed
        ? `refreshed ${formatAgo(s.lastRefreshed, clock)}`
        : "never refreshed"
    }`;

  let title: string;
  let sub: React.ReactNode =
    "Names and cover art for every Steam game. Refresh if a new release is missing from search.";
  if (busy) {
    title = "Pulling the Steam games list…";
    sub = "This can take a minute. You can keep using the app meanwhile.";
  } else if (stats) {
    title = summary(stats);
  } else if (statsFailed) {
    title = "Cache stats unavailable";
  } else {
    title = "Loading cache stats…";
  }
  if (!busy && phase === "done") {
    sub =
      added != null
        ? `${formatCount(added)} new game${added === 1 ? "" : "s"} added. New releases now show up in search and suggestions.`
        : "New releases now show up in search and suggestions.";
  } else if (!busy && phase === "error") {
    sub = (
      <Box component="span" sx={{ color: colors.pinkText }}>
        {failure.description
          ? `Refresh failed: ${failure.description}`
          : `Refresh failed${
              failure.status ? ` (error ${failure.status})` : ""
            }. The cache was not changed. Try again.`}
      </Box>
    );
  }

  return (
    <Box
      component="section"
      aria-label="Steam game cache"
      aria-busy={busy || undefined}
      sx={{
        position: "relative",
        border: `1px solid ${tint("amber", 0.3)}`,
        backgroundColor: colors.surface,
        p: "16px 20px",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "14px 20px",
      }}
    >
      <StorageSharp
        aria-hidden="true"
        sx={{ fontSize: 30, color: colors.amber, flex: "none" }}
      />
      <Box
        sx={{
          flex: "1 1 260px",
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          gap: "4px",
        }}
      >
        <Box
          component="h2"
          sx={{
            m: 0,
            fontFamily: fonts.mono,
            fontSize: 11,
            fontWeight: 400,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: colors.amber,
          }}
        >
          Server · Steam game cache
        </Box>
        <Box aria-live="polite" sx={{ display: "contents" }}>
          <Box
            component="span"
            sx={{ fontSize: 16, fontWeight: 600, color: colors.text }}
          >
            {title}
          </Box>
          <Box
            component="span"
            sx={{ fontSize: 13, color: colors.textMuted, lineHeight: 1.45 }}
          >
            {sub}
          </Box>
        </Box>
        {busy && (
          <LinearProgress
            color="warning"
            aria-label="Refreshing the Steam game cache"
            sx={{
              mt: "4px",
              height: 4,
              borderRadius: 0,
              backgroundColor: tint("amber", 0.15),
              "& .MuiLinearProgress-bar": {
                borderRadius: 0,
                backgroundColor: colors.amber,
              },
            }}
          />
        )}
      </Box>
      <RefreshGamesButton
        loadingState={loadingState}
        doneState={doneState}
        toasts={false}
        onRefreshed={(result) => {
          setPhase("done");
          if (result && typeof result.gamesCached === "number") {
            setStats({
              gamesCached: result.gamesCached,
              lastRefreshed: result.lastRefreshed,
            });
            setStatsFailed(false);
            setAdded(
              typeof result.gamesAdded === "number" ? result.gamesAdded : null,
            );
          } else {
            setAdded(null);
            setStatsReload((n) => n + 1);
          }
        }}
        onError={(status, description) => {
          setPhase("error");
          setFailure({ status, description });
        }}
      />
    </Box>
  );
}
