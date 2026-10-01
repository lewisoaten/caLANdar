import * as React from "react";
import {
  useEffect,
  useState,
  useContext,
  Dispatch,
  SetStateAction,
} from "react";
import moment from "moment";
import {
  Box,
  Button,
  LinearProgress,
  Skeleton,
  Typography,
} from "@mui/material";
import ChevronRightSharp from "@mui/icons-material/ChevronRightSharp";
import EventBusySharp from "@mui/icons-material/EventBusySharp";
import { Link as RouterLink } from "react-router-dom";
import { UserContext, UserDispatchContext } from "../UserProvider";
import { dateParser } from "../utils";
import { EventData } from "../types/events";
import {
  EmptyState,
  FilterChips,
  HlPagination,
  SearchField,
  colors,
  fonts,
  hairline,
  srOnly,
  tint,
} from "./hl";

// ---------------------------------------------------------------------------
// Types and pure helpers (exported for tests)
// ---------------------------------------------------------------------------

/** Status derived by the API: `ended` once over, `draft` until invites go out. */
export type AdminEventStatus = "live" | "draft" | "ended";
export type StatusFilter = "all" | AdminEventStatus;

export interface RsvpTotals {
  invited: number;
  yes: number;
  maybe: number;
  no: number;
  pending: number;
}

/** A row of `GET /events?as_admin=true` (the event plus derived fields). */
export type AdminEventData = EventData & {
  status?: AdminEventStatus;
  rsvp?: RsvpTotals;
};

export interface StatusCounts {
  all: number;
  live: number;
  draft: number;
  ended: number;
}

export const STATUS_FILTERS: ReadonlyArray<{
  id: StatusFilter;
  label: string;
}> = [
  { id: "all", label: "All" },
  { id: "live", label: "Live" },
  { id: "draft", label: "Draft" },
  { id: "ended", label: "Ended" },
];

/**
 * Compact date range in the design's style: `16 → 18 OCT 2026`,
 * `30 OCT → 01 NOV 2026`, `30 DEC 2026 → 02 JAN 2027`, or `06 JUN 2026` for a
 * single day.
 */
export function formatEventDates(
  begin: moment.MomentInput,
  end: moment.MomentInput,
): string {
  const b = moment(begin).locale("en");
  const e = moment(end).locale("en");
  if (!b.isValid()) return "";
  const full = (m: moment.Moment) => m.format("DD MMM YYYY").toUpperCase();
  if (!e.isValid() || b.isSame(e, "day")) return full(b);
  if (b.isSame(e, "month"))
    return `${b.format("DD")} → ${full(e)}`.toUpperCase();
  if (b.isSame(e, "year"))
    return `${b.format("DD MMM")} → ${full(e)}`.toUpperCase();
  return `${full(b)} → ${full(e)}`;
}

/** Widths (percent of invited) of the yes / maybe / no bar segments. */
export function rsvpSegments(r: RsvpTotals | undefined) {
  if (!r || r.invited <= 0) return { yes: 0, maybe: 0, no: 0 };
  const pct = (n: number) =>
    Math.max(0, Math.min(100, (Math.max(0, n) / r.invited) * 100));
  return { yes: pct(r.yes), maybe: pct(r.maybe), no: pct(r.no) };
}

/** Text alternative for the RSVP bar: `5 IN · 1 MAYBE · 1 OUT · 1 PENDING`. */
export function rsvpSummary(r: RsvpTotals | undefined): string {
  if (!r) return "";
  if (r.invited <= 0) return "NO INVITES SENT";
  return `${r.yes} IN · ${r.maybe} MAYBE · ${r.no} OUT · ${r.pending} PENDING`;
}

/** The API's status, or a best guess from the dates when it is missing. */
export function eventStatusOf(
  e: AdminEventData,
  now: moment.Moment = moment(),
): AdminEventStatus {
  if (e.status) return e.status;
  if (moment(e.timeEnd).isSameOrBefore(now)) return "ended";
  if (e.rsvp && e.rsvp.invited === 0) return "draft";
  return "live";
}

/** Query string for the events list request. */
export function buildEventsQuery(opts: {
  asAdmin: boolean;
  page: number;
  limit: number;
  filter: "all" | "upcoming" | "past";
  search?: string;
  status?: StatusFilter;
}): string {
  const q = new URLSearchParams({
    as_admin: String(opts.asAdmin),
    page: String(opts.page),
    limit: String(opts.limit),
    filter: opts.filter,
  });
  const search = opts.search?.trim();
  if (search) q.set("search", search);
  if (opts.status && opts.status !== "all") q.set("status", opts.status);
  return q.toString();
}

const STATUS_STYLE: Record<AdminEventStatus, { label: string; color: string }> =
  {
    live: { label: "LIVE RSVPS", color: colors.lime },
    draft: { label: "DRAFT", color: colors.amber },
    ended: { label: "ENDED", color: colors.textDim },
  };

/** Debounce a changing value (search box). */
function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

// ---------------------------------------------------------------------------
// Row pieces
// ---------------------------------------------------------------------------

/** Stack the table into rows once the panel is narrower than this. */
const STACK_BELOW = 720;
const stacked = `@container hlEvents (max-width: ${STACK_BELOW}px)`;
const GRID = "minmax(0,2.2fr) 90px minmax(0,1.4fr) 110px 120px";

const mono = { fontFamily: fonts.mono } as const;

function RsvpBar({ rsvp }: { rsvp?: RsvpTotals }) {
  const seg = rsvpSegments(rsvp);
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <Box
        aria-hidden="true"
        sx={{
          display: "flex",
          height: 6,
          backgroundColor: tint("neutral", 0.1),
          overflow: "hidden",
        }}
      >
        <Box sx={{ width: `${seg.yes}%`, backgroundColor: colors.lime }} />
        <Box sx={{ width: `${seg.maybe}%`, backgroundColor: colors.amber }} />
        <Box sx={{ width: `${seg.no}%`, backgroundColor: colors.pink }} />
      </Box>
      <Box
        component="span"
        sx={{
          ...mono,
          fontSize: 11,
          lineHeight: 1.45,
          color: colors.textMuted,
        }}
      >
        {rsvpSummary(rsvp)}
      </Box>
    </Box>
  );
}

const rowSx = {
  display: "grid",
  gridTemplateColumns: GRID,
  gap: "12px 16px",
  alignItems: "center",
  px: "20px",
  [stacked]: {
    display: "flex",
    flexWrap: "wrap",
  },
} as const;

function EventRow({
  event,
  showRsvp,
}: {
  event: AdminEventData;
  showRsvp: boolean;
}) {
  const status = eventStatusOf(event);
  const st = STATUS_STYLE[status];
  const invited = event.rsvp?.invited;
  return (
    <Box
      role="row"
      sx={{
        ...rowSx,
        py: "16px",
        borderBottom: `1px solid ${hairline.faint}`,
        transition: "background-color .15s",
        "&:hover": { backgroundColor: tint("cyan", 0.03) },
      }}
    >
      <Box
        role="rowheader"
        sx={{
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          gap: "4px",
          [stacked]: { flex: "1 1 100%" },
        }}
      >
        <Typography
          component="span"
          sx={{
            fontSize: 17,
            fontWeight: 600,
            lineHeight: 1.25,
            overflowWrap: "anywhere",
          }}
        >
          {event.title}
        </Typography>
        <Box
          component="span"
          sx={{ ...mono, fontSize: 12, color: colors.textMuted }}
        >
          {formatEventDates(event.timeBegin, event.timeEnd)}
        </Box>
      </Box>
      <Box
        role="cell"
        sx={{ ...mono, fontSize: 15, fontWeight: 700, color: colors.text }}
      >
        {invited === undefined ? (
          "—"
        ) : (
          <>
            {invited}
            <Box
              component="span"
              sx={{
                display: "none",
                fontWeight: 400,
                fontSize: 13,
                color: colors.textMuted,
                [stacked]: { display: "inline" },
              }}
            >
              {" "}
              invited
            </Box>
          </>
        )}
      </Box>
      <Box role="cell" sx={{ minWidth: 0, [stacked]: { flex: "1 1 160px" } }}>
        {showRsvp ? <RsvpBar rsvp={event.rsvp} /> : null}
      </Box>
      <Box
        role="cell"
        sx={{
          ...mono,
          fontSize: 11,
          letterSpacing: "0.12em",
          color: st.color,
        }}
      >
        {st.label}
      </Box>
      <Box
        role="cell"
        sx={{
          display: "flex",
          justifyContent: "flex-end",
          [stacked]: { ml: "auto" },
        }}
      >
        <Button
          component={RouterLink}
          to={`/admin/events/${event.id}`}
          variant="outlined"
          size="small"
          aria-label={`Manage ${event.title}`}
          endIcon={<ChevronRightSharp />}
          sx={{ px: 2, whiteSpace: "nowrap" }}
        >
          Manage
        </Button>
      </Box>
    </Box>
  );
}

function SkeletonRows({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <Box
          key={i}
          aria-hidden="true"
          sx={{
            ...rowSx,
            py: "16px",
            borderBottom: `1px solid ${hairline.faint}`,
          }}
        >
          <Box sx={{ flex: "1 1 100%" }}>
            <Skeleton width="60%" height={24} />
            <Skeleton width="40%" height={16} />
          </Box>
          <Skeleton width={24} height={20} />
          <Box sx={{ flex: "1 1 160px" }}>
            <Skeleton height={6} variant="rectangular" />
            <Skeleton width="80%" height={16} />
          </Box>
          <Skeleton width={70} height={16} />
          <Skeleton width={110} height={44} variant="rectangular" />
        </Box>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface EventTableProps {
  /** Optional external store for the loaded page of events. */
  eventsState?: [EventData[], Dispatch<SetStateAction<EventData[]>>];
  liveEvents?: boolean;
  pastEvents?: boolean;
  asAdmin?: boolean;
  /** Rows per page (the design uses 6). */
  pageSize?: number;
  /** Bump to refetch (e.g. after creating an event). */
  refreshKey?: number;
}

/**
 * Admin events list: search, status filter chips with counts, the events
 * table (a grid on wide panels, stacked rows on narrow ones) and pagination.
 * Filtering and paging happen on the server.
 */
export default function EventTable(props: EventTableProps) {
  const { signOut } = useContext(UserDispatchContext);
  const userDetails = useContext(UserContext);
  const token = userDetails?.token;

  const ownEventsState = useState([] as EventData[]);
  const [events, setEvents] = props.eventsState ?? ownEventsState;
  const isAdmin = props.asAdmin ?? false;
  const liveEvents = props.liveEvents ?? true;
  const pastEvents = props.pastEvents ?? true;
  const pageSize = props.pageSize ?? 6;
  const refreshKey = props.refreshKey ?? 0;

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<StatusCounts | null>(null);
  const [retry, setRetry] = useState(0);
  const debouncedSearch = useDebounced(search, 300);

  let filter: "all" | "upcoming" | "past" = "all";
  if (liveEvents && !pastEvents) filter = "upcoming";
  else if (!liveEvents && pastEvents) filter = "past";

  const query = buildEventsQuery({
    asAdmin: isAdmin,
    page,
    limit: pageSize,
    filter,
    search: debouncedSearch,
    status: isAdmin ? status : "all",
  });
  // Loading/error are derived from which request last settled.
  const requestKey = `${query}|${refreshKey}|${retry}`;
  const [settled, setSettled] = useState<{
    key: string;
    error: string | null;
  } | null>(null);
  const loadedOnce = settled !== null;
  const loading = settled?.key !== requestKey;
  const error = !loading ? settled.error : null;

  useEffect(() => {
    const controller = new AbortController();

    fetch(`/api/events?${query}`, {
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: "Bearer " + token,
      },
    })
      .then((response) => {
        if (response.status === 401) {
          signOut();
          return undefined;
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.text();
      })
      .then((text) => {
        if (controller.signal.aborted) return;
        if (!text) {
          setEvents([]);
          setTotal(0);
        } else {
          const data = JSON.parse(text, dateParser);
          setEvents((data.events ?? []) as AdminEventData[]);
          setTotal(data.total ?? 0);
          setCounts(data.counts ?? null);
          // A search or delete can leave us past the last page.
          const pages = Math.max(1, data.totalPages ?? 1);
          if (page > pages) setPage(pages);
        }
        setSettled({ key: requestKey, error: null });
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.error("Error fetching events:", err);
        setSettled({
          key: requestKey,
          error: "Couldn't load events. Check your connection and try again.",
        });
      });

    return () => controller.abort();
  }, [query, requestKey, page, token, signOut, setEvents]);

  const rows = events as AdminEventData[];
  const showRsvp = rows.some((e) => e.rsvp !== undefined) || isAdmin;
  const filtered = debouncedSearch.trim() !== "" || status !== "all";

  const chipOptions = STATUS_FILTERS.map((f) => ({
    ...f,
    count: counts ? counts[f.id] : undefined,
  }));

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: "clamp(18px,2.4vw,24px)",
      }}
    >
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 1,
        }}
      >
        <SearchField
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          label="Search events"
          sx={{ flex: "1 1 260px", maxWidth: 420 }}
        />
        {isAdmin && (
          <FilterChips
            label="Status"
            options={chipOptions}
            value={status}
            onChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
          />
        )}
      </Box>

      <Box
        component="section"
        aria-label="Events"
        aria-busy={loading}
        sx={{
          position: "relative",
          containerType: "inline-size",
          containerName: "hlEvents",
          border: `1px solid ${hairline.panel}`,
          backgroundColor: colors.surface,
        }}
      >
        {loading && loadedOnce && (
          <LinearProgress
            aria-label="Loading events"
            sx={{ position: "absolute", top: 0, left: 0, right: 0, height: 2 }}
          />
        )}
        <Box
          role="table"
          aria-label="Events"
          aria-rowcount={total + 1}
          sx={{
            opacity: loading && loadedOnce ? 0.6 : 1,
            transition: "opacity .15s",
          }}
        >
          <Box role="rowgroup">
            <Box
              role="row"
              sx={{
                ...rowSx,
                py: "12px",
                borderBottom: `1px solid ${hairline.chrome}`,
                ...mono,
                fontSize: 10,
                letterSpacing: "0.18em",
                color: colors.textDim,
                [stacked]: srOnly,
              }}
            >
              <span role="columnheader">EVENT</span>
              <span role="columnheader">INVITED</span>
              <span role="columnheader">RESPONSES</span>
              <span role="columnheader">STATUS</span>
              <span role="columnheader">
                <Box component="span" sx={srOnly}>
                  Actions
                </Box>
              </span>
            </Box>
          </Box>
          <Box role="rowgroup">
            {!loadedOnce && <SkeletonRows count={3} />}
            {loadedOnce &&
              !error &&
              rows.map((e) => (
                <EventRow key={e.id} event={e} showRsvp={showRsvp} />
              ))}
          </Box>
        </Box>

        {loadedOnce && !loading && !error && rows.length === 0 && (
          <EmptyState
            icon={<EventBusySharp />}
            title={filtered ? "No events match" : "No events yet"}
            description={
              filtered
                ? "No events match those filters."
                : "Create your first LAN with the New event button."
            }
            action={
              filtered ? (
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => {
                    setSearch("");
                    setStatus("all");
                    setPage(1);
                  }}
                >
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        )}

        {error && (
          <Box
            role="alert"
            sx={{
              px: 2.5,
              py: 5,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 1.5,
              textAlign: "center",
            }}
          >
            <Typography sx={{ color: colors.pinkText, fontSize: 15 }}>
              {error}
            </Typography>
            <Button
              variant="outlined"
              size="small"
              onClick={() => setRetry((n) => n + 1)}
            >
              Retry
            </Button>
          </Box>
        )}

        <HlPagination
          page={page}
          pageSize={pageSize}
          total={total}
          onChange={setPage}
          label="Events pages"
          sx={{ px: "20px", py: "12px" }}
        />
      </Box>
    </Box>
  );
}
