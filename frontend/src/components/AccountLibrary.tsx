import * as React from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Skeleton from "@mui/material/Skeleton";
import { UserGame } from "../types/profile";
import {
  HlPagination,
  Panel,
  SearchField,
  colors,
  fonts,
  hairline,
  srOnly,
  tint,
} from "./hl";
import GameCoverImage from "./GameCoverImage";

export type LibrarySort = "playtime" | "name";

/** Library rows per page. */
export const LIBRARY_PAGE_SIZE = 10;

/** `1,641 h`, `1 h` for anything under an hour, `Unplayed` for 0. */
export function formatLibraryHours(minutes: number): string {
  if (!minutes || minutes <= 0) return "Unplayed";
  return `${Math.max(1, Math.round(minutes / 60)).toLocaleString("en-GB")} h`;
}

/** Playtime bar width (0-100) relative to the most-played game; played games get at least 1%. */
export function playtimePercent(minutes: number, max: number): number {
  if (!minutes || minutes <= 0 || !max || max <= 0) return 0;
  return Math.min(100, Math.max(1, (minutes / max) * 100));
}

function Row({ game, max }: { game: UserGame; max: number }) {
  const pct = playtimePercent(game.playtimeForever, max);
  const hours = formatLibraryHours(game.playtimeForever);
  return (
    <Box
      component="li"
      sx={{
        display: "flex",
        alignItems: "center",
        gap: "14px",
        px: 2.5,
        py: 1.25,
        borderBottom: `1px solid ${hairline.faint}`,
      }}
    >
      <GameCoverImage
        appid={game.appid}
        name={game.name}
        width={76}
        height={35}
      />
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          gap: "6px",
        }}
      >
        <Box sx={{ display: "flex", gap: 1.25, alignItems: "baseline" }}>
          <Box
            component="span"
            title={game.name}
            sx={{
              flex: 1,
              minWidth: 0,
              fontSize: 14,
              fontWeight: 600,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {game.name}
          </Box>
          <Box
            component="span"
            sx={{
              fontFamily: fonts.mono,
              fontSize: 12,
              color: colors.textMuted,
              flex: "none",
            }}
          >
            <Box component="span" sx={srOnly}>
              Playtime:{" "}
            </Box>
            {hours}
          </Box>
        </Box>
        <Box
          aria-hidden="true"
          sx={{
            height: 4,
            backgroundColor: tint("neutral", 0.1),
            position: "relative",
          }}
        >
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              right: "auto",
              width: `${pct}%`,
              backgroundColor: colors.cyan,
            }}
          />
        </Box>
      </Box>
    </Box>
  );
}

function RowSkeleton() {
  return (
    <Box
      aria-hidden="true"
      sx={{
        display: "flex",
        alignItems: "center",
        gap: "14px",
        px: 2.5,
        py: 1.25,
        borderBottom: `1px solid ${hairline.faint}`,
      }}
    >
      <Skeleton variant="rectangular" width={76} height={35} />
      <Box
        sx={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}
      >
        <Skeleton variant="text" width="60%" height={20} />
        <Skeleton variant="rectangular" height={4} />
      </Box>
    </Box>
  );
}

export interface AccountLibraryProps {
  /** A Steam account is linked (a profile exists). */
  linked: boolean;
  games: UserGame[];
  /** Games matching the search (for the pager). */
  total: number;
  /** Whole library size. */
  libraryGames: number;
  /** Most-played game's minutes (bar scale). */
  maxPlaytime: number;
  page: number;
  onPageChange: (page: number) => void;
  search: string;
  onSearchChange: (search: string) => void;
  sort: LibrarySort;
  onSortChange: (sort: LibrarySort) => void;
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
}

/** The Account page's Steam library: search, sort, playtime bars, 10 per page. */
export default function AccountLibrary({
  linked,
  games,
  total,
  libraryGames,
  maxPlaytime,
  page,
  onPageChange,
  search,
  onSearchChange,
  sort,
  onSortChange,
  loading,
  error,
  onRetry,
}: AccountLibraryProps) {
  const sortId = React.useId();
  const listRef = React.useRef<HTMLUListElement>(null);

  let body: React.ReactNode;
  if (loading && games.length === 0) {
    body = Array.from({ length: 6 }).map((_, i) => <RowSkeleton key={i} />);
  } else if (error) {
    body = (
      <Box
        sx={{
          p: "32px 20px",
          textAlign: "center",
          color: colors.textMuted,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 1.5,
        }}
      >
        <Box component="span" sx={{ color: colors.pinkText }}>
          {error}
        </Box>
        {onRetry && (
          <Button variant="outlined" size="small" onClick={onRetry}>
            Try again
          </Button>
        )}
      </Box>
    );
  } else if (!linked) {
    body = (
      <Box
        sx={{ p: "32px 20px", textAlign: "center", color: colors.textMuted }}
      >
        Link your Steam account to see your library here.
      </Box>
    );
  } else if (games.length === 0) {
    body = (
      <Box
        sx={{ p: "32px 20px", textAlign: "center", color: colors.textMuted }}
      >
        {search.trim()
          ? "No games match."
          : "No games synced yet. Resync your library to pull them from Steam (your Steam profile's game details must be public)."}
      </Box>
    );
  } else {
    body = (
      <Box
        component="ul"
        ref={listRef}
        aria-label="Your games"
        aria-busy={loading}
        sx={{
          listStyle: "none",
          m: 0,
          p: 0,
          opacity: loading ? 0.6 : 1,
          transition: "opacity .15s",
        }}
      >
        {games.map((g) => (
          <Row key={g.appid} game={g} max={maxPlaytime} />
        ))}
      </Box>
    );
  }

  return (
    <Panel
      title="Library"
      padding="none"
      bracket="none"
      actions={
        <Box
          component="span"
          sx={{
            fontFamily: fonts.mono,
            fontSize: 11,
            letterSpacing: "0.12em",
            color: colors.textDim,
          }}
        >
          {libraryGames.toLocaleString("en-GB")} GAME
          {libraryGames === 1 ? "" : "S"}
        </Box>
      }
    >
      <Box
        sx={{
          px: 2.5,
          py: 1.5,
          display: "flex",
          flexWrap: "wrap",
          gap: 1,
          borderBottom: `1px solid ${hairline.soft}`,
        }}
      >
        <SearchField
          value={search}
          onChange={onSearchChange}
          label="Search library"
          placeholder="Search your games"
          sx={{
            flex: "1 1 200px",
            minHeight: 44,
            backgroundColor: "rgba(6,7,11,0.5)",
          }}
        />
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.25,
            minHeight: 44,
            pl: 1.5,
            border: `1px solid ${tint("cyan", 0.22)}`,
            backgroundColor: colors.surface,
          }}
        >
          <Box
            component="span"
            id={sortId}
            sx={{
              fontFamily: fonts.mono,
              fontSize: 10,
              letterSpacing: "0.16em",
              color: colors.textDim,
            }}
          >
            SORT
          </Box>
          <Select
            value={sort}
            onChange={(e) => onSortChange(e.target.value as LibrarySort)}
            variant="standard"
            disableUnderline
            labelId={sortId}
            sx={{
              minWidth: 120,
              minHeight: 42,
              fontSize: 14,
              "& .MuiSelect-select": {
                py: 0,
                pl: 0.5,
                minHeight: "42px !important",
                display: "flex",
                alignItems: "center",
              },
              "& .MuiSelect-icon": { color: colors.cyan },
            }}
          >
            <MenuItem value="playtime">Playtime</MenuItem>
            <MenuItem value="name">A–Z</MenuItem>
          </Select>
        </Box>
      </Box>
      {body}
      {linked && !error && total > 0 && (
        <HlPagination
          page={page}
          pageSize={LIBRARY_PAGE_SIZE}
          total={total}
          onChange={onPageChange}
          label="Library pages"
          sx={{ px: 2.5, py: 1.5 }}
        />
      )}
    </Panel>
  );
}
