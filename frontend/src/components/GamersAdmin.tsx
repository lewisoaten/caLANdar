import * as React from "react";
import { useContext, useEffect, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import LinearProgress from "@mui/material/LinearProgress";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import EditSharp from "@mui/icons-material/EditSharp";
import EventAvailableSharp from "@mui/icons-material/EventAvailableSharp";
import EventBusySharp from "@mui/icons-material/EventBusySharp";
import GroupOffSharp from "@mui/icons-material/GroupOffSharp";
import SyncSharp from "@mui/icons-material/SyncSharp";
import SyncProblemSharp from "@mui/icons-material/SyncProblemSharp";
import SyncDisabledSharp from "@mui/icons-material/SyncDisabledSharp";
import ErrorOutlineSharp from "@mui/icons-material/ErrorOutlineSharp";
import { useSnackbar } from "notistack";

import {
  GamerFilter,
  GamerSort,
  GamerSummaryData,
  PaginatedGamersResponse,
} from "../types/gamer";
import { dateParser } from "../utils";
import { UserContext, UserDispatchContext } from "../UserProvider";
import {
  EmptyState,
  FilterChips,
  HlPagination,
  PageHeader,
  SearchField,
  StatCell,
  StatGrid,
  Tag,
  UserAvatar,
  colors,
  useNow,
  fonts,
  hairline,
  srOnly,
} from "./hl";
import { AdminSelect } from "./AdminSelect";
import { SteamGameCacheCard } from "./RefreshGamesButton";
import {
  formatAgo,
  isLibraryStale,
  isValidSteamInput,
  useDebouncedValue,
} from "./adminListUtils";

export const GAMERS_PAGE_SIZE = 9;

const SORTS: ReadonlyArray<{ id: GamerSort; label: string }> = [
  { id: "last_rsvp", label: "Last RSVP" },
  { id: "games_updated", label: "Games updated" },
  { id: "callsign", label: "Callsign A–Z" },
];

/** Query string for `GET /api/gamers` (admin). `page` is 1-based. */
export function buildGamersQuery(q: {
  page: number;
  search: string;
  filter: GamerFilter;
  sort: GamerSort;
}): string {
  const params = new URLSearchParams({
    as_admin: "true",
    page: String(q.page),
    limit: String(GAMERS_PAGE_SIZE),
    filter: q.filter,
    sort: q.sort,
  });
  const search = q.search.trim();
  if (search) params.set("search", search);
  return params.toString();
}

/** Whether a gamer has a Steam account (older APIs lack `steamLinked`). */
const steamLinked = (g: GamerSummaryData) =>
  g.steamLinked ?? Boolean(g.steamId && g.steamId !== "0");

/** The name to show for a gamer: latest callsign, else any handle. */
const displayCallsign = (g: GamerSummaryData) =>
  g.callsign || g.handles.find((h) => h.trim()) || null;

interface FetchResult {
  key: string;
  data?: PaginatedGamersResponse;
  error?: string;
}

async function readError(response: Response): Promise<string> {
  const text = await response.text();
  try {
    const body = JSON.parse(text) as { error?: { description?: string } };
    if (body?.error?.description) return body.error.description;
  } catch {
    // Not the JSON error envelope; fall through to the raw text.
  }
  return text || `HTTP ${response.status}`;
}

interface MetaRowProps {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  color: string;
}

function MetaRow({ icon, label, value, color }: MetaRowProps) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        fontSize: 13,
        color: colors.textMuted,
        "& > svg": { fontSize: 17, flex: "none" },
      }}
    >
      {icon}
      <Box component="dt" sx={{ flex: 1, m: 0 }}>
        {label}
      </Box>
      <Box
        component="dd"
        sx={{ m: 0, fontFamily: fonts.mono, fontSize: 12, color }}
      >
        {value}
      </Box>
    </Box>
  );
}

interface GamerCardProps {
  gamer: GamerSummaryData;
  now: number;
  onEdit: (gamer: GamerSummaryData) => void;
}

function GamerCard({ gamer, now, onEdit }: GamerCardProps) {
  const linked = steamLinked(gamer);
  const callsign = displayCallsign(gamer);
  const others = gamer.handles.filter((h) => h && h !== callsign);
  const stale = linked && isLibraryStale(gamer.gamesOwnedLastModified, now);
  const lastRsvp = gamer.eventsLastResponse;

  let games: MetaRowProps;
  if (!linked) {
    games = {
      icon: <SyncDisabledSharp aria-hidden="true" />,
      label: "Games updated",
      value: "Not linked",
      color: colors.textDim,
    };
  } else if (stale) {
    games = {
      icon: (
        <SyncProblemSharp aria-hidden="true" sx={{ color: colors.amber }} />
      ),
      label: "Games updated",
      value: (
        <>
          {gamer.gamesOwnedLastModified
            ? formatAgo(gamer.gamesOwnedLastModified, now)
            : "Never synced"}
          <Box component="span" sx={srOnly}>
            {" "}
            (over 30 days old)
          </Box>
        </>
      ),
      color: colors.amber,
    };
  } else {
    games = {
      icon: <SyncSharp aria-hidden="true" sx={{ color: colors.lime }} />,
      label: "Games updated",
      value: formatAgo(gamer.gamesOwnedLastModified, now),
      color: colors.lime,
    };
  }

  return (
    <Box
      component="article"
      aria-label={callsign ?? gamer.email}
      sx={{
        border: `1px solid ${hairline.panel}`,
        backgroundColor: colors.surface,
        p: "16px 18px",
        display: "flex",
        flexDirection: "column",
        gap: "14px",
        minWidth: 0,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: "14px" }}>
        <UserAvatar
          name={callsign ?? gamer.email}
          src={gamer.avatarUrl}
          size={44}
        />
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: "2px",
          }}
        >
          <Box
            component="h3"
            sx={{
              m: 0,
              fontSize: 16,
              fontWeight: 600,
              lineHeight: 1.3,
              color: callsign ? colors.text : colors.textMuted,
              overflowWrap: "anywhere",
            }}
          >
            {callsign ?? "No callsign yet"}
          </Box>
          <Box
            component="span"
            title={gamer.email}
            sx={{
              fontFamily: fonts.mono,
              fontSize: 12,
              color: colors.textMuted,
              overflowWrap: "anywhere",
            }}
          >
            {gamer.email}
          </Box>
          {others.length > 0 && (
            <Box
              component="span"
              sx={{
                fontSize: 12,
                color: colors.textMuted,
                overflowWrap: "anywhere",
              }}
              title={others.join(", ")}
            >
              AKA {others.join(", ")}
            </Box>
          )}
        </Box>
        {linked ? (
          <Tag tone="lime" size="sm" title="Steam linked">
            Steam
          </Tag>
        ) : (
          <Tag tone="neutral" size="sm" title="Steam not linked">
            No Steam
          </Tag>
        )}
        <Tooltip title="Edit Steam ID">
          <IconButton
            aria-label={`Edit Steam ID for ${gamer.email}`}
            onClick={() => onEdit(gamer)}
            sx={{
              mr: -1,
              color: colors.textMuted,
              "&:hover": { color: colors.cyan },
            }}
          >
            <EditSharp sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      </Box>

      <StatGrid columns={4}>
        <StatCell value={gamer.eventsInvitedCount} label="Invited" />
        <StatCell value={gamer.eventsAcceptedCount} label="In" tone="lime" />
        <StatCell
          value={gamer.eventsTentativeCount}
          label="Maybe"
          tone="amber"
        />
        <StatCell value={gamer.gamesOwnedCount} label="Games" tone="cyan" />
      </StatGrid>

      <Box
        component="dl"
        sx={{ m: 0, display: "flex", flexDirection: "column", gap: "6px" }}
      >
        {lastRsvp ? (
          <MetaRow
            icon={
              <EventAvailableSharp
                aria-hidden="true"
                sx={{ color: colors.text }}
              />
            }
            label="Last RSVP"
            value={formatAgo(lastRsvp, now)}
            color={colors.text}
          />
        ) : (
          <MetaRow
            icon={
              <EventBusySharp
                aria-hidden="true"
                sx={{ color: colors.textDim }}
              />
            }
            label="Last RSVP"
            value="Never"
            color={colors.textDim}
          />
        )}
        <MetaRow {...games} />
      </Box>
    </Box>
  );
}

interface EditSteamDialogProps {
  gamer: GamerSummaryData | null;
  onClose: () => void;
  onSaved: () => void;
}

function EditSteamDialog({ gamer, onClose, onSaved }: EditSteamDialogProps) {
  const { signOut } = useContext(UserDispatchContext);
  const { token } = useContext(UserContext);
  const { enqueueSnackbar } = useSnackbar();
  const [value, setValue] = useState(gamer?.steamId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!gamer) return;
    const input = value.trim();
    if (!isValidSteamInput(input)) {
      setError(
        "Enter a 17-digit SteamID64 or a steamcommunity.com/id/… or /profiles/… URL.",
      );
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/profile/${encodeURIComponent(gamer.email)}?as_admin=true`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: "Bearer " + token,
          },
          body: JSON.stringify({ steamId: input }),
        },
      );
      if (response.status === 401) {
        signOut();
        return;
      }
      if (response.ok) {
        enqueueSnackbar("Steam ID updated successfully", {
          variant: "success",
        });
        onSaved();
        return;
      }
      setError(`Failed to update Steam ID: ${await readError(response)}`);
    } catch (e) {
      console.error("Error updating Steam ID:", e);
      setError("Error updating Steam ID. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={gamer !== null}
      onClose={saving ? undefined : onClose}
      fullWidth
      maxWidth="xs"
      aria-labelledby="edit-steam-title"
    >
      <Box
        component="form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <DialogTitle id="edit-steam-title">Edit Steam ID</DialogTitle>
        <DialogContent
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            pt: "8px !important",
          }}
        >
          <Box
            component="p"
            sx={{ m: 0, fontSize: 14, color: colors.textMuted }}
          >
            For{" "}
            <Box
              component="span"
              sx={{ fontFamily: fonts.mono, color: colors.text }}
            >
              {gamer?.email}
            </Box>
            . Their library resyncs on their next refresh.
          </Box>
          <TextField
            autoFocus
            label="Steam ID or profile URL"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            error={Boolean(error)}
            helperText={
              error ?? "17-digit SteamID64, or a steamcommunity.com profile URL"
            }
            slotProps={{
              htmlInput: { spellCheck: false, autoComplete: "off" },
            }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button color="inherit" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

const GamersAdmin = () => {
  const { signOut } = useContext(UserDispatchContext);
  const { token, isAdmin } = useContext(UserContext);

  const [page, setPage] = useState(1);
  const [searchText, setSearchText] = useState("");
  const [filter, setFilter] = useState<GamerFilter>("all");
  const [sort, setSort] = useState<GamerSort>("last_rsvp");
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState<GamerSummaryData | null>(null);
  const [result, setResult] = useState<FetchResult | null>(null);
  const now = useNow(60_000);
  const listTop = useRef<HTMLDivElement>(null);

  const search = useDebouncedValue(searchText, 400, () => setPage(1));
  const query = buildGamersQuery({ page, search, filter, sort });
  const key = `${query}#${reload}`;

  useEffect(() => {
    if (!token || !isAdmin) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/gamers?${query}`, {
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: "Bearer " + token,
          },
        });
        if (cancelled) return;
        if (response.status === 401) {
          signOut();
          return;
        }
        if (!response.ok) {
          const message = await readError(response);
          if (!cancelled) setResult((r) => ({ ...r, key, error: message }));
          return;
        }
        const data = JSON.parse(
          await response.text(),
          dateParser,
        ) as PaginatedGamersResponse;
        if (!cancelled) setResult({ key, data });
      } catch (error) {
        console.error("Error fetching gamers:", error);
        if (!cancelled)
          setResult((r) => ({
            ...r,
            key,
            error: "Couldn't reach the server.",
          }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, query, token, isAdmin, signOut]);

  if (!isAdmin) {
    return (
      <Alert severity="error">
        You do not have permission to view this page. Admin access required.
      </Alert>
    );
  }

  const loading = result?.key !== key;
  const data = result?.data;
  const error = !loading ? result?.error : undefined;
  const gamers = data?.gamers ?? [];
  const total = data?.total ?? 0;
  const counts = data?.counts;
  const filtersActive = filter !== "all" || search.trim() !== "";

  const change =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
    };

  const goToPage = (p: number) => {
    setPage(p);
    listTop.current?.scrollIntoView?.({ block: "start" });
  };

  return (
    <>
      <PageHeader
        kicker="Admin"
        kickerTone="amber"
        title="Gamers"
        actions={
          <SearchField
            value={searchText}
            onChange={setSearchText}
            label="Search email or callsign"
            sx={{ width: { xs: "100%", sm: 420 }, maxWidth: "100%" }}
          />
        }
        sx={{ "& > :last-child": { flex: { xs: "1 1 100%", sm: "0 1 auto" } } }}
      />

      <SteamGameCacheCard />

      <Box
        ref={listTop}
        sx={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 1,
          scrollMarginTop: 80,
        }}
      >
        <FilterChips<GamerFilter>
          label="Filter gamers"
          value={filter}
          onChange={change(setFilter)}
          options={[
            { id: "all", label: "All", count: counts?.all },
            { id: "steam", label: "Steam linked", count: counts?.steam },
            { id: "no_steam", label: "No Steam", count: counts?.noSteam },
            {
              id: "stale_library",
              label: "Library 30d+ old",
              count: counts?.staleLibrary,
            },
          ]}
        />
        <Box sx={{ flex: 1 }} />
        <AdminSelect<GamerSort>
          label="Sort"
          ariaLabel="Sort gamers by"
          value={sort}
          options={SORTS}
          onChange={change(setSort)}
        />
      </Box>

      <Box
        component="section"
        aria-labelledby="gamers-list-heading"
        aria-busy={loading || undefined}
        sx={{ display: "flex", flexDirection: "column", gap: "14px" }}
      >
        <Box component="h2" id="gamers-list-heading" sx={srOnly}>
          Gamer list
        </Box>
        <Box sx={{ height: 4, mb: "-18px" }}>
          {loading && data && (
            <LinearProgress aria-label="Loading gamers" sx={{ height: 2 }} />
          )}
        </Box>

        {error ? (
          <EmptyState
            variant="panel"
            icon={<ErrorOutlineSharp />}
            title="Couldn't load gamers"
            description={error}
            action={
              <Button
                variant="outlined"
                onClick={() => setReload((n) => n + 1)}
              >
                Try again
              </Button>
            }
          />
        ) : !data ? (
          <Box
            role="status"
            sx={{
              p: 5,
              textAlign: "center",
              border: `1px solid ${hairline.panel}`,
              backgroundColor: colors.surface,
              color: colors.textMuted,
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            Loading gamers…
            <LinearProgress aria-hidden="true" />
          </Box>
        ) : gamers.length === 0 ? (
          <EmptyState
            variant="panel"
            icon={<GroupOffSharp />}
            title={
              filtersActive ? "No gamers match those filters." : "No gamers yet"
            }
            description={
              filtersActive
                ? undefined
                : "Gamers appear here once they are invited to an event."
            }
            action={
              filtersActive ? (
                <Button
                  variant="outlined"
                  onClick={() => {
                    setSearchText("");
                    setFilter("all");
                    setPage(1);
                  }}
                >
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fill, minmax(min(100%, 320px), 1fr))",
              gap: "14px",
              opacity: loading ? 0.6 : 1,
              transition: "opacity .15s",
            }}
          >
            {gamers.map((g) => (
              <GamerCard
                key={g.email}
                gamer={g}
                now={now}
                onEdit={setEditing}
              />
            ))}
          </Box>
        )}

        {data && total > 0 && (
          <Box
            sx={{
              border: `1px solid ${hairline.panel}`,
              backgroundColor: colors.surface,
              p: "12px 20px",
            }}
          >
            <HlPagination
              label="Gamer pages"
              page={page}
              pageSize={GAMERS_PAGE_SIZE}
              total={total}
              onChange={goToPage}
            />
          </Box>
        )}
      </Box>

      {editing && (
        <EditSteamDialog
          key={editing.email}
          gamer={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setReload((n) => n + 1);
          }}
        />
      )}
    </>
  );
};

export default GamersAdmin;
