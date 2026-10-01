import * as React from "react";
import { useContext } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import LinearProgress from "@mui/material/LinearProgress";
import Link from "@mui/material/Link";
import Skeleton from "@mui/material/Skeleton";
import TextField from "@mui/material/TextField";
import EditSharp from "@mui/icons-material/EditSharp";
import LogoutSharp from "@mui/icons-material/LogoutSharp";
import SyncSharp from "@mui/icons-material/SyncSharp";
import moment from "moment";
import { UserDispatchContext, UserContext } from "../UserProvider";
import { UserGame } from "../types/profile";
import { apiErrorFrom, userFacingReason } from "../utils/apiError";
import { STEAM_ID_HELP, isValidSteamIdInput } from "../utils/steamId";
import AccountLibrary, {
  LIBRARY_PAGE_SIZE,
  type LibrarySort,
} from "./AccountLibrary";
import {
  PageHeader,
  Panel,
  Tag,
  UserAvatar,
  bracket,
  colors,
  fonts,
  hairline,
  tint,
} from "./hl";

interface Callsign {
  handle: string;
  eventCount: number;
  lastEventId: number;
  lastEventTitle: string;
  lastUsed: string;
}

interface Me {
  email: string;
  avatarUrl: string | null;
  isAdmin: boolean;
  callsigns: Callsign[];
}

interface ProfileResponse {
  email: string;
  steamId: string;
  games: UserGame[];
  gameCount: number;
  totalGames?: number;
  libraryGames?: number;
  maxPlaytimeForever?: number;
  lastSynced?: string | null;
  avatarUrl?: string | null;
}

type ProfileState =
  | { status: "loading" }
  | { status: "unlinked" }
  | { status: "error"; message: string }
  | { status: "linked"; data: ProfileResponse };

type SyncState =
  | { state: "idle" }
  | { state: "busy" }
  | { state: "done"; message: string }
  | { state: "error"; message: string };

/** Sum of events across callsigns (each RSVP carries one callsign). */
export const eventsWithCallsign = (callsigns: Callsign[]) =>
  callsigns.reduce((n, c) => n + c.eventCount, 0);

/** Library sync summary shown after a resync. */
export function syncSummary(
  after: number,
  before: number | null,
  newSteamId: boolean,
) {
  const added =
    before == null || newSteamId ? null : Math.max(0, after - before);
  const games = `${after.toLocaleString("en-GB")} game${after === 1 ? "" : "s"}`;
  return `Library synced just now${newSteamId ? " from your new Steam ID" : ""}. ${games}${added == null ? "" : `, ${added} new`}.`;
}

const monoLabel = {
  fontFamily: fonts.mono,
  fontSize: 10,
  letterSpacing: "0.18em",
  color: colors.textDim,
} as const;

function HeroStat({
  value,
  label,
  color,
}: {
  value: React.ReactNode;
  label: string;
  color: string;
}) {
  return (
    <Box
      sx={{
        px: "14px",
        py: 1.25,
        border: `1px solid ${tint("cyan", 0.2)}`,
        display: "flex",
        flexDirection: "column",
        gap: "2px",
        minWidth: 100,
      }}
    >
      <Box
        component="span"
        sx={{ fontFamily: fonts.mono, fontSize: 22, fontWeight: 700, color }}
      >
        {value}
      </Box>
      <Box
        component="span"
        sx={{
          fontFamily: fonts.mono,
          fontSize: 10,
          letterSpacing: "0.16em",
          color: colors.textMuted,
        }}
      >
        {label}
      </Box>
    </Box>
  );
}

const Account = () => {
  const { signOut } = useContext(UserDispatchContext);
  const userDetails = useContext(UserContext);
  const { token } = userDetails;

  const headers = React.useMemo(
    () => ({
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: "Bearer " + token,
    }),
    [token],
  );

  // --- identity + callsigns -------------------------------------------------
  const [me, setMe] = React.useState<Me | null>(null);
  const [meState, setMeState] = React.useState<"loading" | "ok" | "error">(
    "loading",
  );
  React.useEffect(() => {
    const controller = new AbortController();
    fetch("/api/me", { headers, signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401) {
          signOut();
          return;
        }
        if (!response.ok) throw await apiErrorFrom("Load me", response);
        setMe((await response.json()) as Me);
        setMeState("ok");
      })
      .catch((e) => {
        if (controller.signal.aborted) return;
        console.error("Error loading account:", e);
        setMeState("error");
      });
    return () => controller.abort();
  }, [headers, signOut]);

  // --- profile + library ----------------------------------------------------
  const [profile, setProfile] = React.useState<ProfileState>({
    status: "loading",
  });
  const [loadedKey, setLoadedKey] = React.useState<string | null>(null);
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<LibrarySort>("playtime");
  const [reload, setReload] = React.useState(0);

  // Debounce the search box.
  React.useEffect(() => {
    const t = window.setTimeout(() => setQuery(search.trim()), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  const profileUrl = React.useCallback(
    (p: number, count: number, q: string, s: LibrarySort) => {
      const params = new URLSearchParams({
        page: String(p),
        count: String(count),
        sort: s,
      });
      if (q) params.set("search", q);
      return `/api/profile?${params}`;
    },
    [],
  );

  const libraryKey = `${page}|${query}|${sort}|${reload}`;
  const libraryLoading = loadedKey !== libraryKey;
  React.useEffect(() => {
    const controller = new AbortController();
    const key = `${page}|${query}|${sort}|${reload}`;
    fetch(profileUrl(page - 1, LIBRARY_PAGE_SIZE, query, sort), {
      headers,
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.status === 401) {
          signOut();
          return;
        }
        if (response.status === 404) {
          setProfile({ status: "unlinked" });
        } else if (!response.ok) {
          throw await apiErrorFrom("Load profile", response);
        } else {
          const data = (await response.json()) as ProfileResponse;
          setProfile(
            !data.steamId || data.steamId === "0"
              ? { status: "unlinked" }
              : { status: "linked", data },
          );
        }
        setLoadedKey(key);
      })
      .catch((e) => {
        if (controller.signal.aborted) return;
        console.error("Error loading profile games:", e);
        setProfile({
          status: "error",
          message:
            userFacingReason(e) ??
            "Couldn't load your library. Please try again.",
        });
        setLoadedKey(key);
      });
    return () => controller.abort();
  }, [headers, signOut, profileUrl, page, query, sort, reload]);

  const linked = profile.status === "linked";
  const data = profile.status === "linked" ? profile.data : null;
  const libraryGames = data ? (data.libraryGames ?? data.totalGames ?? 0) : 0;

  // --- resync -----------------------------------------------------------------
  const [sync, setSync] = React.useState<SyncState>({ state: "idle" });

  const resync = async (newSteamId = false) => {
    const before = data ? libraryGames : null;
    setSync({ state: "busy" });
    try {
      const response = await fetch(`/api/profile/games/update`, {
        method: "POST",
        headers,
        body: JSON.stringify({}),
      });
      if (response.status === 401) {
        signOut();
        return;
      }
      if (!response.ok) {
        response
          .text()
          .then((t) => console.log(t))
          .catch(() => {});
        setSync({
          state: "error",
          message: `Failed to refresh games (status ${response.status}). Check your Steam profile's game details are public, then try again.`,
        });
        return;
      }
      // Read the new library size, then show the first page again.
      let after = before ?? 0;
      try {
        const summary = await fetch(profileUrl(0, 1, "", "playtime"), {
          headers,
        });
        if (summary.ok) {
          const s = (await summary.json()) as ProfileResponse;
          after = s.libraryGames ?? s.totalGames ?? after;
        }
      } catch {
        // The sync itself worked; the count is just cosmetic.
      }
      setSync({
        state: "done",
        message: syncSummary(after, before, newSteamId),
      });
      setPage(1);
      setReload((r) => r + 1);
    } catch (error) {
      console.error("Error refreshing games:", error);
      setSync({
        state: "error",
        message: "Error refreshing games. Check your connection and try again.",
      });
    }
  };

  // --- Steam ID editing -----------------------------------------------------
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [fieldError, setFieldError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const changeRef = React.useRef<HTMLButtonElement>(null);
  const inputId = React.useId();
  const showForm = editing || profile.status === "unlinked";

  const startEdit = () => {
    setDraft(data?.steamId ?? "");
    setFieldError(null);
    setEditing(true);
  };
  const cancelEdit = () => {
    setEditing(false);
    setFieldError(null);
    window.setTimeout(() => changeRef.current?.focus(), 0);
  };

  const handleSteamIdSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = draft.trim();
    if (!isValidSteamIdInput(value)) {
      setFieldError(STEAM_ID_HELP);
      return;
    }
    setSaving(true);
    setFieldError(null);
    try {
      const response = await fetch(`/api/profile`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ steamId: value }),
      });
      if (response.status === 401) {
        signOut();
        return;
      }
      if (!response.ok) {
        const err = await apiErrorFrom("Save Steam ID", response);
        setFieldError(
          userFacingReason(err) ??
            `Couldn't save your Steam ID (status ${response.status}). Please try again.`,
        );
        return;
      }
      const saved = (await response.json()) as ProfileResponse;
      const changed = saved.steamId !== data?.steamId;
      setProfile((p) => ({
        status: "linked",
        data: {
          ...(p.status === "linked" ? p.data : { games: [], gameCount: 0 }),
          ...saved,
          games: p.status === "linked" && !changed ? p.data.games : [],
        } as ProfileResponse,
      }));
      setEditing(false);
      window.setTimeout(() => changeRef.current?.focus(), 0);
      await resync(changed);
    } catch (error) {
      console.error("Error saving Steam ID:", error);
      setFieldError("Couldn't reach the server. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // --- render ---------------------------------------------------------------
  const callsigns = me?.callsigns ?? [];
  const displayName =
    callsigns[0]?.handle ||
    (userDetails.email || me?.email || "").split("@")[0];
  const email = me?.email || userDetails.email;

  const syncText =
    sync.state === "busy"
      ? "Syncing your Steam library…"
      : sync.state === "done" || sync.state === "error"
        ? sync.message
        : data?.lastSynced
          ? `Last synced ${moment(data.lastSynced).fromNow()}. Resync after buying new games so they show up in votes.`
          : linked
            ? "Not synced yet. Resync to pull your games from Steam."
            : "Link your Steam account so the squad can see which games you own.";

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: "clamp(18px,2.4vw,28px)",
      }}
    >
      {/* Hero */}
      <Box
        component="section"
        aria-label="Player profile"
        sx={{
          position: "relative",
          backgroundColor: colors.surface,
          border: `1px solid ${tint("cyan", 0.2)}`,
          ...bracket({ both: true }),
          p: "clamp(20px,3vw,32px)",
          display: "flex",
          flexWrap: "wrap",
          gap: 3,
          alignItems: "center",
        }}
      >
        <UserAvatar name={displayName} src={me?.avatarUrl} size={96} />
        <PageHeader
          kicker="PLAYER PROFILE"
          title={
            meState === "loading" ? (
              <Skeleton
                variant="text"
                width={220}
                sx={{ fontSize: "inherit" }}
              />
            ) : (
              displayName
            )
          }
          description={
            <Box component="span" sx={{ fontFamily: fonts.mono, fontSize: 13 }}>
              {email}
            </Box>
          }
          sx={{
            flex: "1 1 260px",
            minWidth: 0,
            "& h1": {
              textTransform: "none",
              fontSize: "clamp(30px,4vw,46px)",
            },
          }}
        />
        <Box
          sx={{
            display: "flex",
            gap: 1.25,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <HeroStat
            value={meState === "ok" ? eventsWithCallsign(callsigns) : "–"}
            label="EVENTS"
            color={colors.cyan}
          />
          <HeroStat
            value={linked ? libraryGames.toLocaleString("en-GB") : "–"}
            label="GAMES SYNCED"
            color={colors.lime}
          />
          <Button
            variant="outlined"
            color="error"
            startIcon={<LogoutSharp />}
            onClick={signOut}
          >
            Sign out
          </Button>
        </Box>
      </Box>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "minmax(0,1fr)",
            lg: "minmax(340px,5fr) minmax(0,7fr)",
          },
          gap: "clamp(16px,2vw,24px)",
          alignItems: "start",
        }}
      >
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: "clamp(16px,2vw,24px)",
            minWidth: 0,
          }}
        >
          {/* Callsigns */}
          <Panel title="Callsigns" padding="none" bracket="none">
            <Box
              component="p"
              sx={{
                m: 0,
                px: 2.5,
                py: 1.5,
                fontSize: 14,
                lineHeight: 1.5,
                color: colors.textMuted,
                borderBottom: `1px solid ${hairline.soft}`,
              }}
            >
              Every callsign you&apos;ve used across events. You set one per
              event when you RSVP.
            </Box>
            {meState === "loading" ? (
              <Box sx={{ px: 2.5, py: 1.5 }} aria-hidden="true">
                <Skeleton variant="text" width="50%" height={24} />
                <Skeleton variant="text" width="35%" />
              </Box>
            ) : meState === "error" ? (
              <Box
                sx={{ px: 2.5, py: 2, color: colors.pinkText, fontSize: 14 }}
              >
                Couldn&apos;t load your callsigns.
              </Box>
            ) : callsigns.length === 0 ? (
              <Box
                sx={{ px: 2.5, py: 2, color: colors.textMuted, fontSize: 14 }}
              >
                No callsigns yet. You&apos;ll pick one when you RSVP to an
                event.
              </Box>
            ) : (
              <Box
                component="ul"
                aria-label="Callsigns"
                sx={{ listStyle: "none", m: 0, p: 0 }}
              >
                {callsigns.map((c) => (
                  <Box
                    component="li"
                    key={c.handle}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1.5,
                      px: 2.5,
                      py: 1.5,
                      borderBottom: `1px solid ${hairline.faint}`,
                      "&:last-of-type": { borderBottom: 0 },
                    }}
                  >
                    <UserAvatar name={c.handle} src={me?.avatarUrl} size={32} />
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
                        component="span"
                        sx={{
                          fontSize: 16,
                          fontWeight: 600,
                          overflowWrap: "anywhere",
                        }}
                      >
                        {c.handle}
                      </Box>
                      <Box
                        component="span"
                        sx={{ fontSize: 13, color: colors.textMuted }}
                      >
                        Last used · {c.lastEventTitle}
                      </Box>
                    </Box>
                    <Box
                      component="span"
                      sx={{
                        fontFamily: fonts.mono,
                        fontSize: 12,
                        color: colors.cyan,
                        flex: "none",
                      }}
                    >
                      {c.eventCount} EVENT{c.eventCount === 1 ? "" : "S"}
                    </Box>
                  </Box>
                ))}
              </Box>
            )}
          </Panel>

          {/* Steam link */}
          <Panel
            title="Steam link"
            padding="compact"
            bracket="none"
            actions={
              profile.status === "loading" ? null : linked ? (
                <Tag tone="lime" dot size="sm">
                  CONNECTED
                </Tag>
              ) : profile.status === "unlinked" ? (
                <Tag tone="amber" dot size="sm">
                  NOT LINKED
                </Tag>
              ) : null
            }
          >
            <Box sx={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {profile.status === "loading" ? (
                <Skeleton variant="rectangular" height={46} />
              ) : showForm ? (
                <Box
                  component="form"
                  noValidate
                  onSubmit={handleSteamIdSave}
                  sx={{ display: "flex", flexDirection: "column", gap: 1 }}
                >
                  <Box component="label" htmlFor={inputId} sx={monoLabel}>
                    STEAM ID OR PROFILE URL
                  </Box>
                  <TextField
                    id={inputId}
                    name="steamId"
                    value={draft}
                    onChange={(e) => {
                      setDraft(e.target.value);
                      setFieldError(null);
                    }}
                    autoFocus={editing}
                    disabled={saving}
                    error={Boolean(fieldError)}
                    placeholder="7656119… or steamcommunity.com/id/you"
                    helperText={
                      fieldError ?? (
                        <>
                          Your library resyncs after you save. Find your ID on
                          your{" "}
                          <Link
                            href="https://store.steampowered.com/account/"
                            target="_blank"
                            rel="noreferrer"
                            sx={{ color: colors.cyan }}
                          >
                            Steam account page
                          </Link>
                          .
                        </>
                      )
                    }
                    slotProps={{
                      htmlInput: {
                        autoComplete: "off",
                        spellCheck: false,
                        inputMode: "url",
                        style: { fontFamily: fonts.mono },
                      },
                      formHelperText: {
                        sx: {
                          mx: 0,
                          fontSize: 13,
                          color: fieldError
                            ? colors.pinkText
                            : colors.textMuted,
                        },
                      },
                    }}
                  />
                  <Box
                    sx={{
                      display: "flex",
                      gap: 1,
                      justifyContent: "flex-end",
                      flexWrap: "wrap",
                    }}
                  >
                    {linked && (
                      <Button
                        type="button"
                        variant="outlined"
                        color="inherit"
                        size="small"
                        onClick={cancelEdit}
                        disabled={saving}
                      >
                        Cancel
                      </Button>
                    )}
                    <Button
                      type="submit"
                      variant="contained"
                      size="small"
                      disabled={saving}
                      startIcon={
                        saving ? (
                          <CircularProgress
                            size={16}
                            thickness={6}
                            color="inherit"
                          />
                        ) : undefined
                      }
                    >
                      {saving ? "Saving…" : "Save Steam ID"}
                    </Button>
                  </Box>
                </Box>
              ) : linked ? (
                <Box sx={{ display: "flex", alignItems: "flex-end", gap: 1.5 }}>
                  <Box
                    sx={{
                      flex: 1,
                      minWidth: 0,
                      display: "flex",
                      flexDirection: "column",
                      gap: 0.5,
                    }}
                  >
                    <Box component="span" sx={monoLabel}>
                      STEAM ID
                    </Box>
                    <Box
                      component="span"
                      sx={{
                        fontFamily: fonts.mono,
                        fontSize: 15,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {data?.steamId}
                    </Box>
                  </Box>
                  <Button
                    ref={changeRef}
                    variant="outlined"
                    size="small"
                    startIcon={<EditSharp />}
                    onClick={startEdit}
                    aria-label="Change Steam ID"
                  >
                    Change
                  </Button>
                </Box>
              ) : null}

              <Box
                role="status"
                aria-live="polite"
                sx={{
                  fontSize: 14,
                  color:
                    sync.state === "error" ? colors.pinkText : colors.textMuted,
                  display: "flex",
                  flexDirection: "column",
                  gap: 1,
                }}
              >
                {sync.state === "busy" && (
                  <LinearProgress
                    aria-label="Syncing library"
                    sx={{ height: 4 }}
                  />
                )}
                <span>{syncText}</span>
              </Box>
              {linked && (
                <Button
                  variant="contained"
                  onClick={() => resync(false)}
                  disabled={sync.state === "busy" || saving}
                  startIcon={
                    sync.state === "busy" ? (
                      <CircularProgress
                        size={18}
                        thickness={6}
                        color="inherit"
                      />
                    ) : (
                      <SyncSharp />
                    )
                  }
                >
                  {sync.state === "busy" ? "Syncing…" : "Resync library"}
                </Button>
              )}
            </Box>
          </Panel>
        </Box>

        <AccountLibrary
          linked={linked}
          games={data?.games ?? []}
          total={
            data?.totalGames ?? (data ? data.gameCount * LIBRARY_PAGE_SIZE : 0)
          }
          libraryGames={libraryGames}
          maxPlaytime={data?.maxPlaytimeForever ?? 0}
          page={page}
          onPageChange={setPage}
          search={search}
          onSearchChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          sort={sort}
          onSortChange={(s) => {
            setSort(s);
            setPage(1);
          }}
          loading={libraryLoading}
          error={profile.status === "error" ? profile.message : null}
          onRetry={() => setReload((r) => r + 1)}
        />
      </Box>
    </Box>
  );
};

export default Account;
