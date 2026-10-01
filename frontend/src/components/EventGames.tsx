import * as React from "react";
import { useContext } from "react";
import { Link as RouterLink, useParams } from "react-router-dom";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import AddCircleSharp from "@mui/icons-material/AddCircleSharp";
import CloseSharp from "@mui/icons-material/CloseSharp";
import HowToVoteSharp from "@mui/icons-material/HowToVoteSharp";
import { UserDispatchContext, UserContext } from "../UserProvider";
import { EventGame } from "../types/game_suggestions";
import { RSVP } from "../types/invitations";
import { dateParser } from "../utils";
import { apiErrorFrom, userFacingReason } from "../utils/apiError";
import GamesList, {
  GameCover,
  rankSuggestions,
  type SquadGame,
  type VoteInfo,
} from "./GamesList";
import { OwnerChips, type OwnerIdentity } from "./GameOwners";
import { Kicker, colors, fonts, tint } from "./hl";

/** Games requested per page while loading the whole squad library. */
export const EVENT_GAMES_BATCH = 100;

interface SuggestionLite {
  appid: number;
  votes: number | null;
}

interface InvitationLite {
  response: RSVP | null;
}

interface MyInvitation {
  handle: string | null;
  avatarUrl: string | null;
  response: RSVP | null;
}

interface EventLite {
  id: number;
  title: string;
  timeEnd: { valueOf(): number };
}

const attending = (r: RSVP | null | undefined) =>
  r === RSVP.yes || r === RSVP.maybe;

/** Why the viewer can't suggest (the server needs a yes/maybe RSVP to an active event). */
export function suggestBlocker(
  event: EventLite | null,
  mine: MyInvitation | null,
  now = Date.now(),
): string | undefined {
  if (event && event.timeEnd.valueOf() <= now) return "Suggestions closed";
  if (!mine || !attending(mine.response)) return "RSVP to suggest games";
  return undefined;
}

/** Attach vote info to each game. */
export function withVotes(
  games: ReadonlyArray<EventGame>,
  votes: Map<number, VoteInfo>,
): SquadGame[] {
  return games.map((g) => ({ ...g, vote: votes.get(g.appid) ?? null }));
}

// ---------------------------------------------------------------------------

interface SuggestDialogProps {
  game: SquadGame | null;
  eventTitle?: string;
  squadSize: number;
  me?: OwnerIdentity | null;
  onClose: () => void;
  onSubmit: (game: SquadGame, comment: string) => Promise<void>;
}

function SuggestGameDialog({
  game,
  eventTitle,
  squadSize,
  me,
  onClose,
  onSubmit,
}: SuggestDialogProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
  const [comment, setComment] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // Keep the last game so the dialog content doesn't vanish while closing.
  const [shown, setShown] = React.useState<SquadGame | null>(game);
  if (game && game !== shown) {
    setShown(game);
    setComment("");
    setError(null);
  }
  const titleId = React.useId();
  const pitchId = React.useId();
  const noteId = React.useId();

  const close = () => {
    if (!submitting) onClose();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shown || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(shown, comment.trim());
    } catch (err) {
      setError(
        userFacingReason(err) ??
          "Couldn't suggest this game. It may already be in the vote, or the event may have ended.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const owners = shown?.gamerOwned ?? [];
  return (
    <Dialog
      open={Boolean(game)}
      onClose={close}
      fullScreen={fullScreen}
      aria-labelledby={titleId}
      slotProps={{
        paper: {
          component: "form",
          onSubmit: submit,
          sx: { width: "min(480px, 100%)", m: { xs: 0, sm: 2 } },
        } as object,
      }}
    >
      {shown && (
        <>
          <Box sx={{ position: "relative" }}>
            <GameCover appid={shown.appid} />
            <IconButton
              onClick={close}
              aria-label="Close"
              sx={{
                position: "absolute",
                top: 10,
                right: 10,
                border: `1px solid ${tint("cyan", 0.35)}`,
                backgroundColor: "rgba(6,7,11,0.8)",
                color: colors.text,
                "&:hover": { backgroundColor: "rgba(6,7,11,0.95)" },
              }}
            >
              <CloseSharp />
            </IconButton>
          </Box>
          <Box
            sx={{
              p: "20px 22px 22px",
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            <Box sx={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <Kicker>
                {eventTitle
                  ? `SUGGEST FOR ${eventTitle.toUpperCase()}`
                  : "SUGGEST FOR THIS LAN"}
              </Kicker>
              <Typography
                id={titleId}
                component="h2"
                sx={{
                  m: 0,
                  fontSize: 26,
                  fontWeight: 700,
                  lineHeight: 1.1,
                  textTransform: "uppercase",
                }}
              >
                {shown.name}
              </Typography>
            </Box>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <Box
                component="span"
                sx={{
                  fontFamily: fonts.mono,
                  fontSize: 11,
                  letterSpacing: "0.16em",
                  color: colors.textMuted,
                }}
              >
                {owners.length}
                {squadSize > 0 && owners.length <= squadSize
                  ? ` OF ${squadSize}`
                  : ""}{" "}
                OWN IT
              </Box>
              {owners.length > 0 && (
                <OwnerChips
                  gamers={owners}
                  me={me}
                  tone="lime"
                  label={`Owners of ${shown.name}`}
                />
              )}
            </Box>
            <Box sx={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <Box
                component="label"
                htmlFor={pitchId}
                sx={{
                  fontFamily: fonts.mono,
                  fontSize: 11,
                  letterSpacing: "0.16em",
                  color: colors.textMuted,
                }}
              >
                PITCH IT (OPTIONAL)
              </Box>
              <TextField
                id={pitchId}
                multiline
                minRows={3}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="e.g. 4-player co-op, perfect for Saturday night"
                disabled={submitting}
                slotProps={{
                  htmlInput: { maxLength: 500, "aria-describedby": noteId },
                }}
              />
            </Box>
            <Box
              id={noteId}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.25,
                fontSize: 13,
                color: colors.textMuted,
              }}
            >
              <HowToVoteSharp
                aria-hidden="true"
                sx={{ fontSize: 18, color: colors.cyan }}
              />
              Your vote is added automatically. It&apos;ll join the vote in the
              lobby.
            </Box>
            {error && (
              <Alert severity="error" role="alert">
                {error}
              </Alert>
            )}
            <Box
              sx={{
                display: "flex",
                gap: 1.25,
                flexWrap: "wrap",
                justifyContent: "flex-end",
              }}
            >
              <Button
                type="button"
                variant="outlined"
                color="inherit"
                onClick={close}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="contained"
                disabled={submitting}
                startIcon={
                  submitting ? (
                    <CircularProgress size={18} thickness={6} color="inherit" />
                  ) : (
                    <AddCircleSharp />
                  )
                }
              >
                {submitting ? "Suggesting…" : "Suggest & vote"}
              </Button>
            </Box>
          </Box>
        </>
      )}
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

/**
 * The Games page for an event: loads the squad's whole combined library (in
 * batches), the vote and the viewer's RSVP, and lets attendees suggest a game
 * (the suggest endpoint records the suggester's vote too).
 */
const EventGames = () => {
  const { signOut } = useContext(UserDispatchContext);
  const { token, email } = useContext(UserContext);
  const { id } = useParams();
  const eventId = id ?? "";

  const [games, setGames] = React.useState<EventGame[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [suggestions, setSuggestions] = React.useState<SuggestionLite[]>([]);
  const [squadSize, setSquadSize] = React.useState(0);
  const [mine, setMine] = React.useState<MyInvitation | null>(null);
  const [event, setEvent] = React.useState<EventLite | null>(null);
  const [reload, setReload] = React.useState(0);
  const [suggesting, setSuggesting] = React.useState<SquadGame | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);
  const toastLinkRef = React.useRef<HTMLAnchorElement>(null);

  const headers = React.useMemo(
    () => ({
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: "Bearer " + token,
    }),
    [token],
  );

  const getJson = React.useCallback(
    async <T,>(url: string, signal?: AbortSignal): Promise<T | null> => {
      const response = await fetch(url, { headers, signal });
      if (response.status === 401) {
        signOut();
        return null;
      }
      if (response.status === 404) return null;
      if (!response.ok) throw await apiErrorFrom("Request failed", response);
      return JSON.parse(await response.text(), dateParser) as T;
    },
    [headers, signOut],
  );

  const loadSuggestions = React.useCallback(
    async (signal?: AbortSignal) => {
      const data = await getJson<SuggestionLite[]>(
        `/api/events/${eventId}/suggested_games`,
        signal,
      );
      setSuggestions(data ?? []);
    },
    [eventId, getJson],
  );

  // Squad library: first batch, then the remaining pages in parallel.
  React.useEffect(() => {
    if (!eventId) return;
    const controller = new AbortController();
    const { signal } = controller;
    type Page = { eventGames: EventGame[]; totalCount: number };
    const url = (page: number) =>
      `/api/events/${eventId}/games?page=${page}&count=${EVENT_GAMES_BATCH}`;

    (async () => {
      try {
        const first = await getJson<Page>(url(0), signal);
        if (signal.aborted) return;
        setGames(first?.eventGames ?? []);
        setError(null);
        setLoading(false);
        const pages = first?.totalCount ?? 0;
        if (pages > 1) {
          setLoadingMore(true);
          const rest = await Promise.all(
            Array.from({ length: pages - 1 }, (_, i) =>
              getJson<Page>(url(i + 1), signal),
            ),
          );
          if (signal.aborted) return;
          const seen = new Set<number>();
          const all = [first!, ...rest]
            .flatMap((p) => p?.eventGames ?? [])
            .filter((g) => !seen.has(g.appid) && seen.add(g.appid));
          setGames(all);
          setLoadingMore(false);
        }
      } catch (e) {
        if (signal.aborted) return;
        console.error("Error loading event games:", e);
        setError(
          userFacingReason(e) ?? "Something went wrong. Please try again.",
        );
        setLoading(false);
        setLoadingMore(false);
      }
    })();
    return () => controller.abort();
  }, [eventId, getJson, reload]);

  // Vote, squad size, the viewer's RSVP and the event.
  React.useEffect(() => {
    if (!eventId) return;
    const controller = new AbortController();
    const { signal } = controller;
    const ignore = (e: unknown) => {
      if (!signal.aborted) console.error("Error loading games context:", e);
    };
    getJson<SuggestionLite[]>(`/api/events/${eventId}/suggested_games`, signal)
      .then((list) => !signal.aborted && setSuggestions(list ?? []))
      .catch(ignore);
    getJson<InvitationLite[]>(`/api/events/${eventId}/invitations`, signal)
      .then((list) => {
        if (!signal.aborted)
          setSquadSize(
            (list ?? []).filter((i) => attending(i.response)).length,
          );
      })
      .catch(ignore);
    if (email)
      getJson<MyInvitation>(
        `/api/events/${eventId}/invitations/${encodeURIComponent(email)}`,
        signal,
      )
        .then((inv) => !signal.aborted && setMine(inv))
        .catch(ignore);
    getJson<EventLite>(`/api/events/${eventId}`, signal)
      .then((ev) => !signal.aborted && setEvent(ev))
      .catch(ignore);
    return () => controller.abort();
  }, [eventId, email, getJson, reload]);

  React.useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 8000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const votes = React.useMemo(
    () => rankSuggestions(suggestions),
    [suggestions],
  );
  const squadGames = React.useMemo(
    () => withVotes(games, votes),
    [games, votes],
  );
  const me: OwnerIdentity | null = mine
    ? { avatarUrl: mine.avatarUrl, handle: mine.handle }
    : null;
  const blocker = suggestBlocker(event, mine);
  const lobbyHref = `/events/${eventId}`;

  const submitSuggestion = async (game: SquadGame, comment: string) => {
    const response = await fetch(`/api/events/${eventId}/suggested_games`, {
      method: "POST",
      headers,
      body: JSON.stringify({ appid: game.appid, comment: comment || null }),
    });
    if (response.status === 401) {
      signOut();
      return;
    }
    if (!response.ok) throw await apiErrorFrom("Suggest failed", response);
    // Show it in the vote straight away, then refresh the real counts.
    setSuggestions((s) =>
      s.some((x) => x.appid === game.appid)
        ? s
        : [...s, { appid: game.appid, votes: 1 }],
    );
    setSuggesting(null);
    setToast(`${game.name} added to the vote.`);
    loadSuggestions().catch((e) => console.error(e));
    // The trigger button is replaced by the vote footer; land on the toast.
    window.setTimeout(() => toastLinkRef.current?.focus(), 0);
  };

  return (
    <>
      <GamesList
        games={squadGames}
        squadSize={squadSize}
        loading={loading}
        loadingMore={loadingMore}
        error={error}
        onRetry={() => {
          setLoading(true);
          setError(null);
          setReload((r) => r + 1);
        }}
        me={me}
        lobbyHref={lobbyHref}
        onSuggest={blocker ? undefined : setSuggesting}
        suggestUnavailable={blocker}
        status={
          toast && (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 1.25,
                minHeight: 44,
                pl: "14px",
                pr: "6px",
                border: `1px solid ${tint("lime", 0.45)}`,
                backgroundColor: tint("lime", 0.08),
                fontSize: 14,
                color: colors.text,
              }}
            >
              <HowToVoteSharp
                aria-hidden="true"
                sx={{ fontSize: 20, color: colors.lime }}
              />
              <span>{toast}</span>
              <Button
                ref={toastLinkRef}
                component={RouterLink}
                to={lobbyHref}
                variant="text"
                color="success"
                size="small"
              >
                See the vote
              </Button>
            </Box>
          )
        }
      />
      <SuggestGameDialog
        game={suggesting}
        eventTitle={event?.title}
        squadSize={squadSize}
        me={me}
        onClose={() => setSuggesting(null)}
        onSubmit={submitSuggestion}
      />
    </>
  );
};

export default EventGames;
