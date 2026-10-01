import * as React from "react";
import { useContext, useEffect, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import LinearProgress from "@mui/material/LinearProgress";
import PersonSearchSharp from "@mui/icons-material/PersonSearchSharp";
import ManageSearchSharp from "@mui/icons-material/ManageSearchSharp";
import ErrorOutlineSharp from "@mui/icons-material/ErrorOutlineSharp";
import moment from "moment";
import { UserContext, UserDispatchContext } from "../UserProvider";
import {
  EmptyState,
  FilterChips,
  HlPagination,
  PageHeader,
  SearchField,
  UserAvatar,
  colors,
  useNow,
  fonts,
  hairline,
  tones,
} from "./hl";
import { AdminSelect } from "./AdminSelect";
import {
  AUDIT_RANGES,
  type AuditRange,
  auditTone,
  buildAuditChips,
  formatAuditTime,
  rangeToFromTimestamp,
  useDebouncedValue,
} from "./adminListUtils";

export interface AuditLogEntry {
  id: number;
  timestamp: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  /** Gravatar of `userId`; null for system entries. */
  avatarUrl?: string | null;
}

interface AuditLogsResponse {
  logs: AuditLogEntry[];
  totalCount: number;
  limit: number;
  offset: number;
}

export const AUDIT_PAGE_SIZE = 12;

/** Query string for `GET /api/audit-logs` (admin). `page` is 1-based. */
export function buildAuditQuery(q: {
  page: number;
  userSearch: string;
  entityTypes: string[];
  fromTimestamp: string | null;
}): string {
  const params = new URLSearchParams({
    as_admin: "true",
    limit: String(AUDIT_PAGE_SIZE),
    offset: String((q.page - 1) * AUDIT_PAGE_SIZE),
  });
  const search = q.userSearch.trim();
  if (search) params.set("user_search", search);
  if (q.entityTypes.length) params.set("entity_types", q.entityTypes.join(","));
  if (q.fromTimestamp) params.set("from_timestamp", q.fromTimestamp);
  return params.toString();
}

export const getActionDescription = (log: AuditLogEntry): string => {
  const parts = log.action.split(".");
  const entity = parts[0];
  const action = parts[1];

  let description = "";

  switch (entity) {
    case "auth":
      description = "User logged in";
      break;
    case "event":
      if (action === "create") {
        const title = (log.metadata?.title as string) || "Unknown";
        description = `Created event "${title}"`;
      } else if (action === "update") {
        const title = (log.metadata?.title as string) || "Unknown";
        description = `Updated event "${title}"`;
      } else if (action === "delete") {
        description = `Deleted event`;
      }
      break;
    case "event_seating_config":
      if (action === "update") {
        const hasSeating = log.metadata?.has_seating as boolean;
        const allowUnspecified = log.metadata
          ?.allow_unspecified_seat as boolean;
        const label = log.metadata?.unspecified_seat_label as string;
        description = `Updated seating config: seating ${
          hasSeating ? "enabled" : "disabled"
        }`;
        if (hasSeating && allowUnspecified) {
          description += `, unspecified seat allowed (${label})`;
        }
      }
      break;
    case "invitation":
      if (action === "create") {
        const email = (log.metadata?.invited_email as string) || "unknown";
        description = `Created invitation for ${email}`;
      } else if (action === "delete") {
        const email = (log.metadata?.deleted_email as string) || "unknown";
        description = `Deleted invitation for ${email}`;
      }
      break;
    case "rsvp":
      if (action === "update") {
        const response = (log.metadata?.response as string) || "Unknown";
        const attendance = (log.metadata?.attendance as string) || "none";
        const handle = (log.metadata?.handle as string) || "N/A";
        const seatCleared = log.metadata?.seat_cleared as boolean;
        const isAdminUpdate = log.metadata?.admin_update as boolean;
        const targetEmail = log.metadata?.target_email as string;

        const parts = [`${response}`];
        if (attendance !== "none") {
          parts.push(attendance);
        }
        if (handle !== "N/A") {
          parts.push(`handle: ${handle}`);
        }

        let baseDescription = `Updated RSVP: ${parts.join(", ")}`;
        if (isAdminUpdate && targetEmail) {
          baseDescription = `Admin updated RSVP for ${targetEmail}: ${parts.join(
            ", ",
          )}`;
        }
        if (seatCleared) {
          baseDescription += " (seat cleared)";
        }
        description = baseDescription;
      }
      break;
    case "game_suggestion":
      if (action === "create") {
        const gameName = log.metadata?.game_name as string | undefined;
        const gameId = (log.metadata?.game_id as string) || "Unknown";
        const comment = log.metadata?.comment as string | undefined;
        const gameDisplay = gameName || `game (ID: ${gameId})`;
        const commentDisplay = comment ? ` - "${comment}"` : "";
        description = `Suggested game: ${gameDisplay}${commentDisplay}`;
      }
      break;
    case "game_vote":
      if (action === "update") {
        const gameName = log.metadata?.game_name as string | undefined;
        const gameId = (log.metadata?.game_id as string) || "Unknown";
        const vote = (log.metadata?.vote as string) || "Unknown";
        const gameDisplay = gameName || `game (ID: ${gameId})`;
        description = `Voted ${vote} on ${gameDisplay}`;
      }
      break;
    case "email":
      if (action === "send") {
        const emailType = log.metadata?.email_type as string | undefined;
        const recipientEmail = log.metadata?.recipient_email as
          string | undefined;
        const recipientCount = log.metadata?.recipient_count as
          number | undefined;
        const subject = log.metadata?.subject as string | undefined;

        if (emailType === "invitation_resend") {
          description = `Resent invitation email to ${recipientEmail}`;
        } else if (emailType === "custom") {
          description = `Sent custom email to ${recipientCount} recipients: "${subject}"`;
        } else {
          description = `Sent email`;
        }
      }
      break;
    case "room":
      if (action === "create") {
        const name = (log.metadata?.name as string) || "Unknown";
        description = `Created room: ${name}`;
      } else if (action === "update") {
        const name = (log.metadata?.name as string) || "Unknown";
        description = `Updated room: ${name}`;
      } else if (action === "delete") {
        description = `Deleted room`;
      } else if (action === "layout_update") {
        description = `Updated room layout`;
      }
      break;
    case "seat":
      if (action === "create") {
        const label = (log.metadata?.label as string) || "Unknown";
        description = `Created seat: ${label}`;
      } else if (action === "update") {
        const label = (log.metadata?.label as string) || "Unknown";
        description = `Updated seat: ${label}`;
      } else if (action === "delete") {
        description = `Deleted seat`;
      }
      break;
    case "seat_reservation":
      if (action === "create") {
        const seat = (log.metadata?.seat as string) || "unknown seat";
        const attendance = (log.metadata?.attendance as string) || "none";
        description = `Reserved seat: ${seat} (${attendance})`;
      } else if (action === "update") {
        const seat = (log.metadata?.seat as string) || "unknown seat";
        const attendance = (log.metadata?.attendance as string) || "none";
        description = `Updated seat reservation: ${seat} (${attendance})`;
      }
      break;
    case "profile":
      if (action === "update") {
        description = `Updated profile`;
      } else if (action === "games_refresh") {
        const gamesCount = (log.metadata?.games_count as number) || "Unknown";
        description = `Refreshed games library (${gamesCount} games)`;
      }
      break;
    case "steam_games":
      if (action === "update") {
        const added = log.metadata?.games_added as number | undefined;
        description =
          typeof added === "number"
            ? `Updated Steam games database (+${added} games)`
            : `Updated Steam games database`;
      }
      break;
    default:
      description = log.action;
  }

  // A known entity with an action this list doesn't describe yet.
  return description || log.action;
};

export const getEntityTypeName = (entityType: string): string => {
  const entityTypeMap: Record<string, string> = {
    auth: "Authentication",
    event: "Event",
    event_seating_config: "Event Seating Config",
    invitation: "Invitation",
    email: "Email",
    rsvp: "RSVP",
    seat_reservation: "Seat Reservation",
    room: "Room",
    seat: "Seat",
    game_suggestion: "Game Suggestion",
    game_vote: "Game Vote",
    profile: "Profile",
    steam_games: "Steam Games",
  };

  return entityTypeMap[entityType] || entityType;
};

interface FetchResult {
  key: string;
  data?: AuditLogsResponse;
  error?: string;
}

function AuditRow({ log, now }: { log: AuditLogEntry; now: number }) {
  const tone = tones[auditTone(log.entityType)];
  const who = log.userId || "System";
  return (
    <Box
      component="li"
      sx={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "baseline",
        gap: "6px 16px",
        p: "12px 20px",
        borderBottom: `1px solid ${hairline.faint}`,
        "&:last-of-type": { borderBottom: 0 },
      }}
    >
      <Box
        component="time"
        dateTime={log.timestamp}
        title={moment(log.timestamp).format("YYYY-MM-DD HH:mm:ss")}
        sx={{
          minWidth: 118,
          flex: "none",
          fontSize: 12,
          color: colors.textDim,
        }}
      >
        {formatAuditTime(log.timestamp, now)}
      </Box>
      <Box
        component="span"
        sx={{
          minWidth: 150,
          width: { md: 200 },
          flex: "none",
          maxWidth: "100%",
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          overflowWrap: "anywhere",
          color: tone.fg,
        }}
      >
        {log.action}
      </Box>
      <Box
        component="span"
        sx={{
          flex: "1 1 260px",
          minWidth: 0,
          fontFamily: fonts.ui,
          fontSize: 14,
          lineHeight: 1.45,
          color: colors.text,
          overflowWrap: "anywhere",
        }}
      >
        {getActionDescription(log)}
        {log.entityId && (
          <Box
            component="span"
            sx={{
              ml: 1,
              fontFamily: fonts.mono,
              fontSize: 11,
              color: colors.textDim,
              whiteSpace: "nowrap",
            }}
          >
            {getEntityTypeName(log.entityType)} #{log.entityId}
          </Box>
        )}
      </Box>
      <Box
        component="span"
        sx={{
          flex: "none",
          maxWidth: "100%",
          display: "flex",
          alignItems: "center",
          gap: 1,
          fontSize: 12,
          color: colors.textMuted,
          alignSelf: "center",
          minWidth: 0,
        }}
      >
        <UserAvatar
          name={log.userId ?? null}
          src={log.avatarUrl ?? null}
          size={22}
        />
        <Box
          component="span"
          title={who}
          sx={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {who}
        </Box>
      </Box>
    </Box>
  );
}

const AuditLog = () => {
  const { token, isAdmin } = useContext(UserContext);
  const { signOut } = useContext(UserDispatchContext);

  const [page, setPage] = useState(1);
  const [searchText, setSearchText] = useState("");
  const [range, setRange] = useState<{ id: AuditRange; from: string | null }>(
    () => ({ id: "7", from: rangeToFromTimestamp("7") }),
  );
  const [chipId, setChipId] = useState("all");
  const [presentTypes, setPresentTypes] = useState<string[] | null>(null);
  const [reload, setReload] = useState(0);
  const [result, setResult] = useState<FetchResult | null>(null);
  const now = useNow(60_000);
  const listTop = useRef<HTMLElement>(null);

  const userSearch = useDebouncedValue(searchText, 400, () => setPage(1));
  const chips = buildAuditChips(presentTypes);
  const chip = chips.find((c) => c.id === chipId) ?? chips[0];
  const query = buildAuditQuery({
    page,
    userSearch,
    entityTypes: chip.types,
    fromTimestamp: range.from,
  });
  const key = `${query}#${reload}`;

  // Entity types present in the log, for the chips.
  useEffect(() => {
    if (!token || !isAdmin) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(
          "/api/audit-logs/entity-types?as_admin=true",
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!response.ok) return;
        const types = (await response.json()) as unknown;
        if (!cancelled && Array.isArray(types)) {
          setPresentTypes(types.filter((t) => typeof t === "string"));
        }
      } catch (error) {
        // Chips fall back to the full set of groups.
        console.error("Couldn't load audit entity types", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, isAdmin]);

  useEffect(() => {
    if (!token || !isAdmin) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/audit-logs?${query}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cancelled) return;
        if (response.status === 401) {
          signOut();
          return;
        }
        if (!response.ok) {
          throw new Error(
            `Failed to fetch audit logs: ${response.statusText || response.status}`,
          );
        }
        const data = (await response.json()) as AuditLogsResponse;
        if (!cancelled) setResult({ key, data });
      } catch (err) {
        if (!cancelled)
          setResult((r) => ({
            ...r,
            key,
            error: err instanceof Error ? err.message : "An error occurred",
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
  const logs = data?.logs ?? [];
  const total = data?.totalCount ?? 0;
  const filtersActive =
    chip.id !== "all" || range.id !== "all" || userSearch.trim() !== "";

  const goToPage = (p: number) => {
    setPage(p);
    listTop.current?.scrollIntoView?.({ block: "start" });
  };

  return (
    <>
      <PageHeader kicker="Admin" kickerTone="amber" title="Audit log" />

      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "10px",
        }}
      >
        <SearchField
          value={searchText}
          onChange={setSearchText}
          label="Filter by user email"
          icon={<PersonSearchSharp aria-hidden="true" />}
          sx={{ flex: "1 1 260px", maxWidth: 420 }}
        />
        <AdminSelect<AuditRange>
          label="When"
          ariaLabel="Time range"
          value={range.id}
          options={AUDIT_RANGES}
          onChange={(id) => {
            setRange({ id, from: rangeToFromTimestamp(id) });
            setPage(1);
          }}
        />
      </Box>

      <FilterChips
        label="Entity type"
        value={chip.id}
        onChange={(id) => {
          setChipId(id);
          setPage(1);
        }}
        options={chips.map((c) => ({ id: c.id, label: c.label }))}
        sx={{ "& > *": { minHeight: 48 } }}
      />

      <Box
        component="section"
        ref={listTop}
        aria-label="Log entries"
        aria-busy={loading || undefined}
        sx={{
          position: "relative",
          border: `1px solid ${hairline.panel}`,
          backgroundColor: colors.surface,
          fontFamily: fonts.mono,
          scrollMarginTop: 80,
        }}
      >
        {loading && data && (
          <LinearProgress
            aria-label="Loading log entries"
            sx={{ position: "absolute", top: 0, left: 0, right: 0, height: 2 }}
          />
        )}
        {error ? (
          <EmptyState
            icon={<ErrorOutlineSharp />}
            title="Couldn't load the audit log"
            description={error}
            action={
              <Button
                variant="outlined"
                onClick={() => setReload((n) => n + 1)}
              >
                Try again
              </Button>
            }
            sx={{ fontFamily: fonts.ui }}
          />
        ) : !data ? (
          <Box
            role="status"
            sx={{
              p: 5,
              display: "flex",
              flexDirection: "column",
              gap: 2,
              textAlign: "center",
              fontFamily: fonts.ui,
              color: colors.textMuted,
            }}
          >
            Loading audit log…
            <LinearProgress aria-hidden="true" />
          </Box>
        ) : logs.length === 0 ? (
          <EmptyState
            icon={<ManageSearchSharp />}
            title={
              filtersActive
                ? "No entries match those filters."
                : "No audit logs found"
            }
            action={
              filtersActive ? (
                <Button
                  variant="outlined"
                  onClick={() => {
                    setSearchText("");
                    setChipId("all");
                    setRange({ id: "all", from: null });
                    setPage(1);
                  }}
                >
                  Show everything
                </Button>
              ) : undefined
            }
            sx={{ fontFamily: fonts.ui }}
          />
        ) : (
          <Box
            component="ol"
            sx={{
              listStyle: "none",
              m: 0,
              p: 0,
              opacity: loading ? 0.6 : 1,
              transition: "opacity .15s",
            }}
          >
            {logs.map((log) => (
              <AuditRow key={log.id} log={log} now={now} />
            ))}
          </Box>
        )}
        {data && total > 0 && (
          <Box sx={{ borderTop: `1px solid ${hairline.soft}`, p: "12px 20px" }}>
            <HlPagination
              label="Audit log pages"
              page={page}
              pageSize={AUDIT_PAGE_SIZE}
              total={total}
              onChange={goToPage}
            />
          </Box>
        )}
      </Box>
    </>
  );
};

export default AuditLog;
