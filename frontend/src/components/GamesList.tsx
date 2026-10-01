import * as React from "react";
import { Link as RouterLink } from "react-router-dom";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import IconButton from "@mui/material/IconButton";
import Skeleton from "@mui/material/Skeleton";
import Typography from "@mui/material/Typography";
import AddCircleSharp from "@mui/icons-material/AddCircleSharp";
import ArrowForwardSharp from "@mui/icons-material/ArrowForwardSharp";
import SportsEsportsSharp from "@mui/icons-material/SportsEsportsSharp";
import ErrorOutlineSharp from "@mui/icons-material/ErrorOutlineSharp";
import { EventGame } from "../types/game_suggestions";
import {
  EmptyState,
  HlPagination,
  PageHeader,
  SearchField,
  Trophy,
  colors,
  fonts,
  hairline,
  srOnly,
  tint,
  trophy,
} from "./hl";
import { OwnerChips, type OwnerIdentity } from "./GameOwners";
import { rankSuggestions } from "./lobbyModel";
import GameCoverImage from "./GameCoverImage";

/** A game in the squad library plus its place in the event's vote, if any. */
export interface SquadGame extends EventGame {
  vote?: VoteInfo | null;
}

export interface VoteInfo {
  /** Competition rank in the vote (most votes first; ties share a rank). */
  rank: number;
  votes: number;
  /** 1-3 when the game earns a trophy (needs a vote), else null. */
  trophyRank?: number | null;
}

export type VoteFilter = "all" | "in" | "out";

export const VOTE_FILTERS: ReadonlyArray<{ id: VoteFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "in", label: "In the vote" },
  { id: "out", label: "Not suggested" },
];

/** Cards per page. */
export const GAMES_PAGE_SIZE = 24;

/** `1,641 H PLAYED` from minutes (`null` when never played). */
export function formatPlayedHours(minutes: number): string | null {
  if (!minutes || minutes <= 0) return null;
  const hours = Math.round(minutes / 60);
  return hours < 1
    ? "<1 H PLAYED"
    : `${hours.toLocaleString("en-GB")} H PLAYED`;
}

/**
 * Each suggested game's place in the vote, ranked exactly like the lobby's
 * vote list (lobbyModel.rankSuggestions: competition ranking, ties by name,
 * no trophy without a vote).
 */
export function voteRanks(
  suggestions: ReadonlyArray<{
    appid: number;
    name: string;
    votes: number | null;
  }>,
): Map<number, VoteInfo> {
  return new Map(
    rankSuggestions(
      suggestions.map((s) => ({ ...s, votes: s.votes ?? 0 })),
    ).map(({ suggestion, rank, trophyRank }) => [
      suggestion.appid,
      { rank, votes: suggestion.votes, trophyRank },
    ]),
  );
}

/** Apply the search text and the vote filter. */
export function filterGames<T extends SquadGame>(
  games: ReadonlyArray<T>,
  query: string,
  filter: VoteFilter,
): T[] {
  const q = query.trim().toLowerCase();
  return games.filter(
    (g) =>
      (!q || g.name.toLowerCase().includes(q)) &&
      (filter === "all" || (filter === "in") === Boolean(g.vote)),
  );
}

export interface GameGroup<T> {
  owners: number;
  games: T[];
}

/** Group by owner count, most-owned first, keeping order inside a group. */
export function groupByOwners<T extends EventGame>(
  games: ReadonlyArray<T>,
): GameGroup<T>[] {
  const groups = new Map<number, T[]>();
  for (const g of games) {
    const n = g.gamerOwned.length;
    const list = groups.get(n);
    if (list) list.push(g);
    else groups.set(n, [g]);
  }
  return [...groups.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([owners, list]) => ({ owners, games: list }));
}

export const ownedByLabel = (owners: number, squadSize: number) =>
  squadSize > 0 && owners <= squadSize
    ? `Owned by ${owners} of ${squadSize}`
    : `Owned by ${owners}`;

const countLabel = (n: number) =>
  `${n.toLocaleString("en-GB")} game${n === 1 ? "" : "s"}`;

// ---------------------------------------------------------------------------

/** Joined segmented buttons (the design's "All / In the vote / Not suggested"). */
function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: ReadonlyArray<{ id: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <Box
      role="group"
      aria-label={label}
      sx={{
        display: "flex",
        flexWrap: "wrap",
        maxWidth: "100%",
        border: `1px solid ${hairline.control}`,
        backgroundColor: "rgba(12,15,24,0.8)",
      }}
    >
      {options.map((o) => {
        const on = o.id === value;
        return (
          <ButtonBase
            key={o.id}
            aria-pressed={on}
            onClick={() => onChange(o.id)}
            sx={{
              flex: { xs: "1 1 auto", md: "0 0 auto" },
              minHeight: 44,
              px: 2,
              fontFamily: fonts.ui,
              fontWeight: 600,
              fontSize: 13,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              backgroundColor: on ? colors.cyan : "transparent",
              color: on ? colors.ink : colors.textMuted,
              transition: "color .15s",
              "&:hover": { color: on ? colors.ink : colors.text },
              "&.Mui-focusVisible": {
                outline: `2px solid ${colors.cyan}`,
                outlineOffset: 2,
                zIndex: 1,
              },
            }}
          >
            {o.label}
          </ButtonBase>
        );
      })}
    </Box>
  );
}

function Cover({
  appid,
  name,
  badge,
}: {
  appid: number;
  name?: string;
  badge?: string | null;
}) {
  return (
    <Box sx={{ position: "relative" }}>
      <GameCoverImage appid={appid} name={name} />
      {badge && (
        <Box
          component="span"
          sx={{
            position: "absolute",
            right: 8,
            bottom: 8,
            px: 1,
            py: "3px",
            backgroundColor: "rgba(6,7,11,0.85)",
            fontFamily: fonts.mono,
            fontSize: 11,
            color: colors.text,
          }}
        >
          {badge}
        </Box>
      )}
    </Box>
  );
}

export { Cover as GameCover };

/** 26px bordered trophy tile for ranks 1-3. */
function TrophyTile({ rank }: { rank: number | null }) {
  const color = rank ? trophy[rank as 1 | 2 | 3] : undefined;
  if (!color) return null;
  return (
    <Box
      sx={{
        width: 26,
        height: 26,
        flex: "none",
        display: "grid",
        placeItems: "center",
        border: `1px solid ${color}`,
        backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
      }}
    >
      <Trophy rank={rank} size={16} />
    </Box>
  );
}

export interface GameCardProps {
  game: SquadGame;
  me?: OwnerIdentity | null;
  lobbyHref?: string;
  onSuggest?: (game: SquadGame) => void;
  /** Shown instead of the suggest button when suggesting isn't possible. */
  suggestUnavailable?: string;
}

export const GameCard = React.memo(function GameCard({
  game,
  me,
  lobbyHref,
  onSuggest,
  suggestUnavailable,
}: GameCardProps) {
  const titleId = React.useId();
  const vote = game.vote;
  const hours = formatPlayedHours(game.playtimeForever);
  return (
    <Box
      component="article"
      aria-labelledby={titleId}
      sx={{
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
        border: `1px solid ${hairline.panel}`,
        backgroundColor: colors.surface,
        transition: "border-color .15s",
        "&:hover, &:focus-within": { borderColor: tint("cyan", 0.5) },
      }}
    >
      <Cover appid={game.appid} name={game.name} badge={hours} />
      <Box
        sx={{
          flex: 1,
          p: "14px 16px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 1.5,
        }}
      >
        <Typography
          id={titleId}
          component="h3"
          sx={{ m: 0, fontSize: 16, fontWeight: 600, lineHeight: 1.25 }}
        >
          {game.name}
        </Typography>
        {game.gamerOwned.length > 0 && (
          <OwnerChips
            gamers={game.gamerOwned}
            me={me}
            max={8}
            label={`Owners of ${game.name}`}
          />
        )}
        <Box
          sx={{
            mt: "auto",
            pt: 1.5,
            borderTop: `1px solid ${tint("cyan", 0.1)}`,
            display: "flex",
            alignItems: "center",
            gap: 1.25,
            minHeight: 44,
          }}
        >
          {vote ? (
            <>
              <TrophyTile
                rank={
                  vote.trophyRank !== undefined
                    ? vote.trophyRank
                    : vote.votes > 0
                      ? vote.rank
                      : null
                }
              />
              <Box
                sx={{
                  flex: 1,
                  minWidth: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: "1px",
                }}
              >
                <Box
                  component="span"
                  sx={{
                    fontFamily: fonts.mono,
                    fontSize: 11,
                    letterSpacing: "0.14em",
                    color: colors.lime,
                  }}
                >
                  IN THE VOTE · #{vote.rank}
                </Box>
                <Box
                  component="span"
                  sx={{ fontSize: 12, color: colors.textMuted }}
                >
                  {vote.votes} vote{vote.votes === 1 ? "" : "s"}
                </Box>
              </Box>
              {lobbyHref && (
                <IconButton
                  component={RouterLink}
                  to={lobbyHref}
                  aria-label={`See ${game.name} in the vote`}
                  sx={{
                    width: 44,
                    height: 44,
                    flex: "none",
                    border: `1px solid ${hairline.control}`,
                    color: colors.textMuted,
                    "&:hover": {
                      color: colors.cyan,
                      borderColor: colors.cyan,
                      backgroundColor: "transparent",
                    },
                  }}
                >
                  <ArrowForwardSharp sx={{ fontSize: 18 }} />
                </IconButton>
              )}
            </>
          ) : onSuggest ? (
            <Button
              variant="outlined"
              fullWidth
              size="small"
              startIcon={<AddCircleSharp />}
              onClick={() => onSuggest(game)}
              aria-label={`Suggest ${game.name} for this LAN`}
            >
              Suggest for this LAN
            </Button>
          ) : (
            <Box
              component="span"
              sx={{ fontSize: 13, color: colors.textMuted }}
            >
              {suggestUnavailable ?? "Not suggested"}
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
});

const gridSx = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 260px), 1fr))",
  gap: "14px",
} as const;

function GameCardSkeleton() {
  return (
    <Box
      aria-hidden="true"
      sx={{
        border: `1px solid ${hairline.panel}`,
        backgroundColor: colors.surface,
      }}
    >
      <Skeleton
        variant="rectangular"
        sx={{ aspectRatio: "460 / 215", height: "auto" }}
      />
      <Box
        sx={{
          p: "14px 16px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 1.5,
        }}
      >
        <Skeleton variant="text" width="70%" height={24} />
        <Box sx={{ display: "flex", gap: "6px" }}>
          <Skeleton variant="rectangular" width={96} height={28} />
          <Skeleton variant="rectangular" width={84} height={28} />
        </Box>
        <Skeleton variant="rectangular" height={44} />
      </Box>
    </Box>
  );
}

function GroupHeading({ label, count }: { label: string; count: string }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: "14px" }}>
      <Typography
        component="h2"
        sx={{
          m: 0,
          fontFamily: fonts.mono,
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: colors.lime,
        }}
      >
        {label}
      </Typography>
      <Box
        aria-hidden="true"
        sx={{ flex: 1, height: "1px", backgroundColor: hairline.panel }}
      />
      <Box
        component="span"
        sx={{
          fontFamily: fonts.mono,
          fontSize: 11,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: colors.textDim,
        }}
      >
        {count}
      </Box>
    </Box>
  );
}

export interface GamesListProps {
  games: SquadGame[];
  /** Attendees who said yes/maybe ("Owned by N of M"); 0 if unknown. */
  squadSize?: number;
  loading: boolean;
  /** More pages are still arriving in the background. */
  loadingMore?: boolean;
  error?: string | null;
  onRetry?: () => void;
  me?: OwnerIdentity | null;
  lobbyHref?: string;
  onSuggest?: (game: SquadGame) => void;
  suggestUnavailable?: string;
  /** Status content (e.g. "Valheim added to the vote.") next to the filters. */
  status?: React.ReactNode;
  /**
   * Server-side search: pass the search text and its setter, and `games` are
   * taken as already matching it (no name filtering here). Without these the
   * search box filters `games` locally.
   */
  query?: string;
  onQueryChange?: (query: string) => void;
  /** A server-side search for `query` is in flight. */
  searching?: boolean;
}

/** How long the result count waits for typing to pause before it's announced. */
export const ANNOUNCE_DELAY_MS = 700;

/** Screen-reader summary of what the filters left on screen. */
export function resultsAnnouncement(
  shown: number,
  total: number,
  query: string,
): string {
  if (query.trim()) {
    return `${countLabel(shown)} match “${query.trim()}”`;
  }
  return shown === total
    ? `${countLabel(total)} shown`
    : `${shown.toLocaleString("en-GB")} of ${countLabel(total)} shown`;
}

/**
 * The Games screen body: the squad's combined Steam library for an event,
 * grouped by how many attendees own each game, with search, a vote filter and
 * client-side pagination.
 */
export default function GamesList({
  games,
  squadSize = 0,
  loading,
  loadingMore = false,
  error,
  onRetry,
  me,
  lobbyHref,
  onSuggest,
  suggestUnavailable,
  status,
  query: controlledQuery,
  onQueryChange,
  searching = false,
}: GamesListProps) {
  const [localQuery, setLocalQuery] = React.useState("");
  const serverSearch = onQueryChange !== undefined;
  const query = serverSearch ? (controlledQuery ?? "") : localQuery;
  const setQuery = serverSearch ? onQueryChange : setLocalQuery;
  const [filter, setFilter] = React.useState<VoteFilter>("all");
  const [page, setPage] = React.useState(1);
  const topRef = React.useRef<HTMLDivElement>(null);

  const filtered = React.useMemo(
    () => filterGames(games, serverSearch ? "" : query, filter),
    [games, query, filter, serverSearch],
  );

  // One polite live region for the result count, updated once typing pauses
  // (not on every keystroke).
  const summary =
    !loading && !error && (games.length > 0 || query.trim())
      ? resultsAnnouncement(filtered.length, games.length, query)
      : "";
  const [announced, setAnnounced] = React.useState("");
  React.useEffect(() => {
    if (searching) return;
    const t = window.setTimeout(() => setAnnounced(summary), ANNOUNCE_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [summary, searching]);
  const groupTotals = React.useMemo(() => {
    const totals = new Map<number, number>();
    for (const g of filtered)
      totals.set(
        g.gamerOwned.length,
        (totals.get(g.gamerOwned.length) ?? 0) + 1,
      );
    return totals;
  }, [filtered]);

  const pages = Math.max(1, Math.ceil(filtered.length / GAMES_PAGE_SIZE));
  const current = Math.min(page, pages);
  const groups = React.useMemo(
    () =>
      groupByOwners(
        filtered.slice(
          (current - 1) * GAMES_PAGE_SIZE,
          current * GAMES_PAGE_SIZE,
        ),
      ),
    [filtered, current],
  );

  const changePage = (p: number) => {
    setPage(p);
    topRef.current?.scrollIntoView({ block: "start" });
  };

  let body: React.ReactNode;
  if (loading) {
    body = (
      <Box sx={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        <Skeleton variant="text" width={200} height={20} />
        <Box sx={gridSx}>
          {Array.from({ length: 8 }).map((_, i) => (
            <GameCardSkeleton key={i} />
          ))}
        </Box>
      </Box>
    );
  } else if (error) {
    body = (
      <EmptyState
        variant="panel"
        icon={<ErrorOutlineSharp />}
        title="Couldn't load the squad's games"
        description={error}
        action={
          onRetry && (
            <Button variant="outlined" onClick={onRetry}>
              Try again
            </Button>
          )
        }
      />
    );
  } else if (games.length === 0 && !query.trim()) {
    body = (
      <EmptyState
        variant="panel"
        icon={<SportsEsportsSharp />}
        title="No games yet"
        description="Games show up here once attendees have RSVP'd and linked their Steam library on their Account page."
      />
    );
  } else if (filtered.length === 0) {
    body = (
      <Box
        sx={{
          p: "48px 20px",
          textAlign: "center",
          border: `1px dashed ${hairline.control}`,
          color: colors.textMuted,
        }}
      >
        No games match those filters.
      </Box>
    );
  } else {
    body = (
      <>
        {groups.map((group) => {
          const total = groupTotals.get(group.owners) ?? group.games.length;
          return (
            <Box
              component="section"
              key={group.owners}
              aria-label={ownedByLabel(group.owners, squadSize)}
              sx={{ display: "flex", flexDirection: "column", gap: "14px" }}
            >
              <GroupHeading
                label={ownedByLabel(group.owners, squadSize)}
                count={countLabel(total)}
              />
              <Box sx={gridSx}>
                {group.games.map((game) => (
                  <GameCard
                    key={game.appid}
                    game={game}
                    me={me}
                    lobbyHref={lobbyHref}
                    onSuggest={onSuggest}
                    suggestUnavailable={suggestUnavailable}
                  />
                ))}
              </Box>
            </Box>
          );
        })}
        {filtered.length > GAMES_PAGE_SIZE && (
          <HlPagination
            page={current}
            pageSize={GAMES_PAGE_SIZE}
            total={filtered.length}
            onChange={changePage}
            label="Games pages"
          />
        )}
      </>
    );
  }

  return (
    <Box
      ref={topRef}
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: "clamp(18px,2.4vw,28px)",
        scrollMarginTop: 80,
      }}
    >
      <PageHeader
        kicker="SQUAD LIBRARY · STEAM"
        title="Games"
        description="Everything the squad owns, grouped by how many of you can play it. Suggest one to put it straight into the vote."
        actions={
          <SearchField
            value={query}
            onChange={(v) => {
              setQuery(v);
              setPage(1);
            }}
            label="Filter games"
            placeholder="Filter games…"
            sx={{ width: { xs: "100%", md: 340 } }}
          />
        }
        sx={{
          "& > div:last-of-type": { flex: { xs: "1 1 100%", md: "0 1 340px" } },
        }}
      />
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "10px 16px",
        }}
      >
        <Segmented
          label="Vote status"
          options={VOTE_FILTERS}
          value={filter}
          onChange={(v) => {
            setFilter(v);
            setPage(1);
          }}
        />
        {((loadingMore && !serverSearch) || searching) && !loading && (
          <Box
            component="span"
            aria-hidden="true"
            sx={{
              fontFamily: fonts.mono,
              fontSize: 11,
              letterSpacing: "0.12em",
              color: colors.textMuted,
            }}
          >
            {searching ? "SEARCHING…" : "LOADING MORE GAMES…"}
          </Box>
        )}
        <Box
          role="status"
          aria-live="polite"
          sx={{ display: "flex", minWidth: 0, maxWidth: "100%" }}
        >
          {status}
          <Box component="span" sx={srOnly}>
            {announced}
          </Box>
        </Box>
      </Box>
      {body}
    </Box>
  );
}
