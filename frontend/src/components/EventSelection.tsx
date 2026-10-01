import * as React from "react";
import { useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Skeleton from "@mui/material/Skeleton";
import Typography from "@mui/material/Typography";
import ArrowForwardSharp from "@mui/icons-material/ArrowForwardSharp";
import EventBusySharp from "@mui/icons-material/EventBusySharp";
import ErrorOutlineSharp from "@mui/icons-material/ErrorOutlineSharp";
import { dateParser } from "../utils";
import { UserContext, UserDispatchContext } from "../UserProvider";
import type { EventData, PaginatedEventsResponse } from "../types/events";
import type { RSVP } from "../types/invitations";
import EventCard from "./EventCard";
import {
  EmptyState,
  HlPagination,
  PageHeader,
  Tag,
  chamfer,
  colors,
  fonts,
  hairline,
  srOnly,
  tint,
} from "./hl";
import {
  EVENT_FILTERS,
  emptyCopy,
  eventImageSrc,
  eventPhase,
  featuredStatus,
  formatFeaturedRange,
  formatSquadSummary,
  pickActiveEvent,
  summariseSquad,
  type AttendeeLite,
  type EventFilter,
  myRsvpOf,
  type MyRsvp,
  type SquadSummary,
} from "./eventListModel";

const PAGE_SIZE = 20;

const jsonHeaders = (token: string) => ({
  "Content-Type": "application/json",
  Accept: "application/json",
  Authorization: "Bearer " + token,
});

/** An event in the user list, with the viewer's own RSVP (API §4a). */
type ListedEvent = EventData & { myResponse?: RSVP | null };

interface ListResult {
  key: string;
  events: ListedEvent[];
  total: number;
  error: boolean;
}

/** Filter tabs (Upcoming / Past / All): automatic activation, arrow keys. */
function FilterTabs({
  value,
  onChange,
  panelId,
}: {
  value: EventFilter;
  onChange: (f: EventFilter) => void;
  panelId: string;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    const n = EVENT_FILTERS.length;
    let next: number | null = null;
    if (e.key === "ArrowRight") next = (index + 1) % n;
    else if (e.key === "ArrowLeft") next = (index - 1 + n) % n;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = n - 1;
    if (next == null) return;
    e.preventDefault();
    refs.current[next]?.focus();
    onChange(EVENT_FILTERS[next].id);
  };
  return (
    <Box
      role="tablist"
      aria-label="Filter events"
      sx={{
        display: "flex",
        width: { xs: "100%", md: "auto" },
        border: `1px solid ${hairline.control}`,
        backgroundColor: "rgba(12,15,24,0.8)",
      }}
    >
      {EVENT_FILTERS.map((f, i) => {
        const selected = f.id === value;
        return (
          <Box
            key={f.id}
            component="button"
            type="button"
            role="tab"
            id={`${panelId}-tab-${f.id}`}
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            ref={(el: HTMLButtonElement | null) => {
              refs.current[i] = el;
            }}
            onClick={() => onChange(f.id)}
            onKeyDown={(e: React.KeyboardEvent) => onKeyDown(e, i)}
            sx={{
              flex: { xs: 1, md: "none" },
              minHeight: 44,
              px: "18px",
              border: 0,
              backgroundColor: selected ? colors.cyan : "transparent",
              color: selected ? colors.ink : colors.textMuted,
              fontFamily: fonts.ui,
              fontWeight: 600,
              fontSize: 13,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              cursor: "pointer",
              "&:hover": selected
                ? undefined
                : { color: colors.text, backgroundColor: tint("cyan", 0.06) },
              "&:focus-visible": {
                outline: `2px solid ${colors.cyan}`,
                outlineOffset: 2,
                position: "relative",
                zIndex: 1,
              },
            }}
          >
            {f.label}
          </Box>
        );
      })}
    </Box>
  );
}

/** Large "next up" card for the live / next upcoming event. */
function FeaturedEvent({
  event,
  rsvp,
  squad,
  now,
}: {
  event: EventData;
  rsvp: MyRsvp;
  squad: SquadSummary | null;
  now: number;
}) {
  const id = useId();
  const live = eventPhase(event.timeBegin, event.timeEnd, now) === "live";
  const status = featuredStatus(rsvp);
  return (
    <Box
      component={RouterLink}
      to={`/events/${event.id}`}
      aria-labelledby={`${id}-title ${id}-when ${id}-status ${id}-cta`}
      aria-describedby={event.description ? `${id}-desc` : undefined}
      sx={{
        position: "relative",
        overflow: "hidden",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))",
        p: 0,
        border: `1px solid ${tint("cyan", 0.3)}`,
        backgroundColor: colors.surface,
        color: colors.text,
        textDecoration: "none",
        clipPath: chamfer(24, "tr-bl"),
        transition: "border-color .15s",
        "&:hover": { borderColor: colors.cyan },
        "&:hover .hl-featured-cta": { color: colors.text },
        // clip-path would cut an outside outline, and the image would cover
        // an inset one: draw the ring as an overlay above everything.
        "&:focus-visible": { outline: "none" },
        "&:focus-visible::after": {
          content: '""',
          position: "absolute",
          inset: 3,
          border: `2px solid ${colors.cyan}`,
          clipPath: chamfer(22, "tr-bl"),
          pointerEvents: "none",
          zIndex: 2,
        },
      }}
    >
      <Box
        sx={{
          position: "relative",
          minHeight: 240,
          backgroundColor: colors.surface2,
        }}
      >
        <Box
          component="img"
          src={eventImageSrc(event.image)}
          alt=""
          sx={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
        <Box
          aria-hidden="true"
          sx={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(90deg,rgba(6,7,11,0) 40%,rgba(12,15,24,0.95) 100%),linear-gradient(0deg,rgba(12,15,24,0.7),transparent 50%)",
          }}
        />
        <Tag
          tone="lime"
          variant="solid"
          dot="pulse"
          sx={{
            position: "absolute",
            top: 16,
            left: 16,
            height: 28,
            px: "12px",
            letterSpacing: "0.16em",
          }}
        >
          {live ? "Live now" : "Next up"}
        </Tag>
      </Box>
      <Box
        sx={{
          p: "clamp(20px,3vw,36px)",
          display: "flex",
          flexDirection: "column",
          gap: "14px",
          justifyContent: "center",
          minWidth: 0,
        }}
      >
        <Box
          component="span"
          id={`${id}-when`}
          sx={{
            fontFamily: fonts.mono,
            fontSize: 12,
            letterSpacing: "0.14em",
            color: colors.cyan,
          }}
        >
          {formatFeaturedRange(event.timeBegin, event.timeEnd)}
        </Box>
        <Typography
          id={`${id}-title`}
          component="h2"
          sx={{
            m: 0,
            fontSize: "clamp(28px,3.4vw,42px)",
            fontWeight: 700,
            textTransform: "uppercase",
            lineHeight: 1,
            overflowWrap: "anywhere",
          }}
        >
          {event.title}
        </Typography>
        {event.description && (
          <Typography
            id={`${id}-desc`}
            component="p"
            sx={{
              m: 0,
              fontSize: 15,
              lineHeight: 1.6,
              color: colors.textMuted,
              maxWidth: "52ch",
              whiteSpace: "pre-line",
              overflowWrap: "anywhere",
              display: "-webkit-box",
              WebkitLineClamp: 4,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {event.description}
          </Typography>
        )}
        <Box
          sx={{
            display: "flex",
            flexWrap: "wrap",
            gap: "10px",
            alignItems: "center",
            pt: "4px",
          }}
        >
          <Box component="span" id={`${id}-status`}>
            {status.label ? (
              <Tag
                tone={status.tone}
                sx={{ fontSize: 12, px: "10px", py: "6px" }}
              >
                {status.label}
              </Tag>
            ) : (
              <Skeleton
                variant="rectangular"
                width={96}
                height={28}
                aria-hidden="true"
                sx={{ bgcolor: tint("cyan", 0.08) }}
              />
            )}
          </Box>
          {squad && (
            <Box
              component="span"
              sx={{
                fontFamily: fonts.mono,
                fontSize: 12,
                letterSpacing: "0.12em",
                color: colors.textMuted,
              }}
            >
              {formatSquadSummary(squad)}
            </Box>
          )}
          <Box
            component="span"
            id={`${id}-cta`}
            className="hl-featured-cta"
            sx={{
              ml: "auto",
              display: "inline-flex",
              alignItems: "center",
              gap: 1,
              fontWeight: 700,
              fontSize: 14,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: colors.cyan,
              transition: "color .15s",
            }}
          >
            {status.cta}
            <ArrowForwardSharp aria-hidden="true" sx={{ fontSize: 20 }} />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

const cardGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 300px), 1fr))",
  gap: "clamp(14px,1.8vw,20px)",
  listStyle: "none",
  m: 0,
  p: 0,
} as const;

function LoadingSkeleton({ featured }: { featured: boolean }) {
  const bg = { bgcolor: tint("cyan", 0.06) };
  return (
    <Box
      aria-hidden="true"
      sx={{ display: "flex", flexDirection: "column", gap: "inherit" }}
    >
      {featured && (
        <Skeleton
          variant="rectangular"
          height={300}
          sx={{ ...bg, clipPath: chamfer(24, "tr-bl") }}
        />
      )}
      <Box sx={cardGrid}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} variant="rectangular" height={210} sx={bg} />
        ))}
      </Box>
    </Box>
  );
}

const Event = () => {
  const { signOut } = useContext(UserDispatchContext);
  const userDetails = useContext(UserContext);
  const token = userDetails?.token;

  const panelId = useId();
  const [filter, setFilter] = useState<EventFilter>("upcoming");
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [now] = useState(() => Date.now());

  const handleFilter = (f: EventFilter) => {
    if (f === filter) return;
    setFilter(f);
    setPage(1); // Reset to first page when changing filter
  };

  const handlePageChange = (value: number) => {
    setPage(value);
    window.scrollTo?.(0, 0); // Scroll to top when changing pages
  };

  // Results are stored with the key they were fetched for; a result for an
  // older key simply reads as "loading", so no state is reset in the effect.
  const listKey = `${filter}:${page}:${reload}`;
  const [list, setList] = useState<ListResult | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const done = (r: Omit<ListResult, "key">) =>
      setList({ key: listKey, ...r });
    fetch(`/api/events?page=${page}&limit=${PAGE_SIZE}&filter=${filter}`, {
      headers: jsonHeaders(token),
      signal: controller.signal,
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
        if (!text) return done({ events: [], total: 0, error: false });
        // Parse the JSON with date conversion
        const data = JSON.parse(text, dateParser) as PaginatedEventsResponse;
        const events = (data.events ?? []) as ListedEvent[];
        done({
          events,
          total: data.total ?? events.length,
          error: false,
        });
      })
      .catch((error) => {
        if (error?.name === "AbortError") return;
        console.error("Error fetching events:", error);
        done({ events: [], total: 0, error: true });
      });
    return () => controller.abort();
  }, [listKey, page, filter, token, signOut]);

  const loading = list?.key !== listKey;
  const events = useMemo(
    () => (!loading && list ? list.events : []),
    [loading, list],
  );
  const featured =
    page === 1 && filter !== "past" ? pickActiveEvent(events, now) : null;
  const rest = featured ? events.filter((e) => e.id !== featured.id) : events;

  // The user's RSVP for each event comes with the list (`myResponse`).
  const rsvpFor = (id: number): MyRsvp => {
    const event = events.find((e) => e.id === id);
    return event ? myRsvpOf(event) : undefined;
  };

  // Squad size and free seats for the featured event.
  const featuredId = featured?.id ?? null;
  const [squad, setSquad] = useState<{
    id: number;
    summary: SquadSummary;
  } | null>(null);
  useEffect(() => {
    if (featuredId == null) return;
    const controller = new AbortController();
    const get = <T,>(path: string, fallback: T): Promise<T> =>
      fetch(path, { headers: jsonHeaders(token), signal: controller.signal })
        .then((r) => (r.ok ? (r.json() as Promise<T>) : fallback))
        .catch(() => fallback);
    Promise.all([
      get<AttendeeLite[] | null>(`/api/events/${featuredId}/invitations`, null),
      get<Array<{ id: number }>>(`/api/events/${featuredId}/seats`, []),
    ]).then(([attendees, seats]) => {
      if (controller.signal.aborted || !attendees) return;
      setSquad({
        id: featuredId,
        summary: summariseSquad(attendees, Array.isArray(seats) ? seats : []),
      });
    });
    return () => controller.abort();
  }, [featuredId, token]);

  const error = !loading && list?.error;
  const empty = !loading && !error && events.length === 0;
  const activeTab = EVENT_FILTERS.find((f) => f.id === filter)!;
  const copy = emptyCopy(filter);

  return (
    <>
      <PageHeader
        kicker="Your invites"
        title="Events"
        actions={
          <FilterTabs
            value={filter}
            onChange={handleFilter}
            panelId={panelId}
          />
        }
        sx={{ "& > div:last-of-type": { width: { xs: "100%", md: "auto" } } }}
      />

      <Box
        id={panelId}
        role="tabpanel"
        aria-labelledby={`${panelId}-tab-${filter}`}
        aria-busy={loading}
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: "clamp(18px,2.4vw,28px)",
        }}
      >
        <Box role="status" aria-live="polite" sx={srOnly}>
          {loading
            ? "Loading events…"
            : error
              ? ""
              : `${list?.total ?? 0} ${activeTab.label.toLowerCase()} ${
                  list?.total === 1 ? "event" : "events"
                }`}
        </Box>

        {loading ? (
          <LoadingSkeleton featured={page === 1 && filter !== "past"} />
        ) : error ? (
          <EmptyState
            variant="panel"
            icon={<ErrorOutlineSharp />}
            kicker="Connection lost"
            title="Couldn't load events"
            description="Something went wrong talking to the server. Check your connection and try again."
            action={
              <Button
                variant="outlined"
                onClick={() => setReload((r) => r + 1)}
              >
                Try again
              </Button>
            }
          />
        ) : empty ? (
          <EmptyState
            variant="panel"
            icon={<EventBusySharp />}
            title={copy.title}
            description={copy.description}
            action={
              filter !== "all" ? (
                <Button variant="outlined" onClick={() => handleFilter("all")}>
                  Show all events
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            {featured && (
              <FeaturedEvent
                event={featured}
                rsvp={rsvpFor(featured.id)}
                squad={squad?.id === featured.id ? squad.summary : null}
                now={now}
              />
            )}
            {rest.length > 0 && (
              <Box
                component="section"
                aria-label={
                  featured ? "More events" : `${activeTab.label} events`
                }
              >
                <Box component="ul" sx={cardGrid}>
                  {rest.map((event) => (
                    <Box component="li" key={event.id} sx={{ minWidth: 0 }}>
                      <EventCard
                        event={event}
                        rsvp={rsvpFor(event.id)}
                        now={now}
                      />
                    </Box>
                  ))}
                </Box>
              </Box>
            )}
            {(list?.total ?? 0) > PAGE_SIZE && (
              <HlPagination
                page={page}
                pageSize={PAGE_SIZE}
                total={list?.total ?? 0}
                onChange={handlePageChange}
                label="Event pages"
              />
            )}
          </>
        )}
      </Box>
    </>
  );
};

export default Event;
