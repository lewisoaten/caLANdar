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

const PAST_TENSE: Record<string, string> = {
  create: "created",
  update: "updated",
  delete: "deleted",
  send: "sent",
  refresh: "refreshed",
  login: "logged in",
  logout: "logged out",
};

const ENTITY_WORDS: Record<string, string> = {
  auth: "sign-in",
  event_seating_config: "seating config",
  rsvp: "RSVP",
  steam_games: "Steam games",
};

/** `game_suggestion` → `game suggestion` (lower case, for running text). */
const entityWords = (entity: string) =>
  ENTITY_WORDS[entity] ?? entity.replace(/_/g, " ");

/**
 * Human text for any `entity.action` code, for actions without a dedicated
 * description: `room.background_update` → "Room background updated",
 * `game_suggestion.update_comment` → "Game suggestion comment updated",
 * `seat.teleport` → "Seat teleport".
 */
export function humanizeAction(code: string): string {
  const [entity = "", action = ""] = code.split(".");
  const words = action.split("_").filter(Boolean);
  const verbAt = words.findIndex((w) => w in PAST_TENSE);
  const subject = [entityWords(entity)];
  let verb = "";
  words.forEach((w, i) => {
    if (i === verbAt) verb = PAST_TENSE[w];
    else subject.push(w.replace(/-/g, " "));
  });
  const text = [...subject, verb].filter(Boolean).join(" ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : code;
}

const formatBytes = (n: unknown): string | null => {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

const countOf = (n: unknown, unit: string): string | null =>
  typeof n === "number" ? `${n} ${unit}${n === 1 ? "" : "s"}` : null;

/** A non-empty string from metadata, or undefined. */
const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim()
    ? v.trim()
    : typeof v === "number"
      ? String(v)
      : undefined;

/** `"Label: detail"` when there is a detail, else just `"Label"`. */
const withDetail = (label: string, detail: string | undefined, sep = ": ") =>
  detail ? `${label}${sep}${detail}` : label;

/**
 * Human text for an audit entry. Parts the server didn't record are left out
 * rather than shown as "Unknown".
 */
export const getActionDescription = (log: AuditLogEntry): string => {
  const [entity, action] = log.action.split(".");
  const m = log.metadata ?? {};
  let description = "";

  switch (entity) {
    case "auth":
      description = "User logged in";
      break;
    case "event": {
      const title = str(m.title);
      const quoted = title ? `"${title}"` : undefined;
      if (action === "create")
        description = withDetail("Created event", quoted, " ");
      else if (action === "update")
        description = withDetail("Updated event", quoted, " ");
      else if (action === "delete") description = "Deleted event";
      break;
    }
    case "event_seating_config":
      if (action === "update") {
        if (typeof m.has_seating !== "boolean") {
          description = "Updated seating config";
          break;
        }
        description = `Updated seating config: seating ${
          m.has_seating ? "enabled" : "disabled"
        }`;
        if (m.has_seating && m.allow_unspecified_seat === true) {
          const label = str(m.unspecified_seat_label);
          description += withDetail(
            ", unspecified seat allowed",
            label && `(${label})`,
            " ",
          );
        }
      }
      break;
    case "invitation":
      if (action === "create")
        description = withDetail(
          "Created invitation",
          str(m.invited_email),
          " for ",
        );
      else if (action === "delete")
        description = withDetail(
          "Deleted invitation",
          str(m.deleted_email),
          " for ",
        );
      break;
    case "rsvp":
      if (action === "update") {
        const attendance = str(m.attendance);
        const handle = str(m.handle);
        const details = [
          str(m.response),
          attendance && attendance !== "none" ? attendance : undefined,
          handle && handle !== "N/A" ? `handle: ${handle}` : undefined,
        ].filter(Boolean);
        const target = str(m.target_email);
        const base =
          m.admin_update === true && target
            ? `Admin updated RSVP for ${target}`
            : "Updated RSVP";
        description = withDetail(base, details.join(", ") || undefined);
        if (m.seat_cleared === true) description += " (seat cleared)";
      }
      break;
    case "game_suggestion": {
      const game = str(m.game_name);
      const comment = str(m.comment);
      if (action === "create") {
        description = `Suggested ${game ?? "a game"}${
          comment ? ` - "${comment}"` : ""
        }`;
      } else if (action === "update_comment") {
        description = `Updated suggestion comment${game ? ` on ${game}` : ""}${
          comment ? `: "${comment}"` : ""
        }`;
      }
      break;
    }
    case "game_vote":
      if (action === "update") {
        const vote = str(m.vote);
        const game = str(m.game_name) ?? "a game";
        description = vote ? `Voted ${vote} on ${game}` : `Voted on ${game}`;
      }
      break;
    case "email":
      if (action === "send") {
        const type = str(m.email_type);
        if (type === "invitation_resend") {
          description = withDetail(
            "Resent invitation email",
            str(m.recipient_email),
            " to ",
          );
        } else if (type === "custom") {
          const count = countOf(m.recipient_count, "recipient");
          const subject = str(m.subject);
          description = `Sent custom email${count ? ` to ${count}` : ""}${
            subject ? `: "${subject}"` : ""
          }`;
        } else {
          description = "Sent email";
        }
      }
      break;
    case "room":
      if (action === "create")
        description = withDetail("Created room", str(m.name));
      else if (action === "update")
        description = withDetail("Updated room", str(m.name));
      else if (action === "delete") description = "Deleted room";
      else if (action === "layout_update") {
        const released = Array.isArray(m.reservations_released)
          ? m.reservations_released.length
          : 0;
        const details = [
          countOf(m.rooms, "room"),
          countOf(m.seats, "seat"),
          released ? `${countOf(released, "reservation")} released` : null,
        ].filter(Boolean);
        description = details.length
          ? `Saved room layout (${details.join(", ")})`
          : "Saved room layout";
      } else if (action === "background_update") {
        const type = str(m.content_type)?.split("/")[1]?.toUpperCase();
        const details = [type, formatBytes(m.bytes)].filter(Boolean);
        description = details.length
          ? `Uploaded room background (${details.join(", ")})`
          : "Uploaded room background";
      } else if (action === "background_delete") {
        description = "Removed room background";
      }
      break;
    case "seat":
      if (action === "create")
        description = withDetail("Created seat", str(m.label));
      else if (action === "update")
        description = withDetail("Updated seat", str(m.label));
      else if (action === "delete") description = "Deleted seat";
      break;
    case "seat_reservation": {
      const seat = str(m.seat);
      const attendance = str(m.attendance);
      const tail =
        attendance && attendance !== "none" ? ` (${attendance})` : "";
      if (action === "create")
        description = `${seat ? `Reserved seat: ${seat}` : "Reserved a seat"}${tail}`;
      else if (action === "update")
        description = `${withDetail("Updated seat reservation", seat)}${tail}`;
      break;
    }
    case "profile":
      if (action === "update") description = "Updated profile";
      else if (action === "games_refresh") {
        const count = countOf(m.games_count, "game");
        description = withDetail(
          "Refreshed games library",
          count ? `(${count})` : undefined,
          " ",
        );
      }
      break;
    case "steam_games":
      if (action === "update") {
        const added = m.games_added;
        description =
          typeof added === "number"
            ? `Updated Steam games database (+${added} games)`
            : `Updated Steam games database`;
      }
      break;
    default:
      break;
  }

  // Anything this list doesn't describe yet still reads as words.
  return description || humanizeAction(log.action);
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

/**
 * What the entry's `entityId` actually identifies. Many entries are keyed by
 * their event (`rsvp` → "2" is event 2, not RSVP 2) or by
 * `"{eventId}-{appid}"` / `"{eventId}-{email}"`; label those for what they
 * are. Null when there is nothing useful to show.
 */
export const getEntityRef = (log: AuditLogEntry): string | null => {
  const id = log.entityId?.trim();
  if (!id) return null;
  const isNum = /^\d+$/.test(id);
  const [, action] = log.action.split(".");
  const pair = /^(\d+)-(.+)$/.exec(id);
  switch (log.entityType) {
    case "event":
    case "rsvp":
    case "seat_reservation":
    case "event_seating_config":
    case "email":
      return isNum ? `Event #${id}` : null;
    case "room":
      if (action === "layout_update") return isNum ? `Event #${id}` : null;
      return isNum ? `Room #${id}` : null;
    case "seat":
      return isNum ? `Seat #${id}` : null;
    case "game_suggestion":
    case "game_vote":
      if (isNum) return `Event #${id}`;
      if (pair && /^\d+$/.test(pair[2]))
        return `Event #${pair[1]} · Steam app ${pair[2]}`;
      return null;
    case "invitation":
      if (isNum) return `Event #${id}`;
      return pair ? `Event #${pair[1]}` : null;
    case "profile":
      return /^\d{17}$/.test(id) ? `Steam ID ${id}` : null;
    default:
      return `${getEntityTypeName(log.entityType)} #${id}`;
  }
};

interface FetchResult {
  key: string;
  data?: AuditLogsResponse;
  error?: string;
}

function AuditRow({ log, now }: { log: AuditLogEntry; now: number }) {
  const tone = tones[auditTone(log.entityType)];
  const who = log.userId || "System";
  const entityRef = getEntityRef(log);
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
        {entityRef && (
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
            {entityRef}
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
            overflowWrap: "anywhere",
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
