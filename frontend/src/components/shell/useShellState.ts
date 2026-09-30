import { useContext, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { UserContext, UserDispatchContext } from "../../UserProvider";
import { dateParser } from "../../utils";
import type { EventData, PaginatedEventsResponse } from "../../types/events";
import { RSVP } from "../../types/invitations";
import {
  buildBreadcrumb,
  isEventSection,
  parseRoute,
  pickActiveEvent,
  type Crumb,
  type ShellRoute,
} from "./navModel";

export interface ShellAccess {
  /** The invitation for the active event is still loading. */
  loading: boolean;
  /** RSVP'd Yes or Maybe: may open Games / Seat map / Schedule. */
  attending: boolean;
  /** Has answered the invitation at all (drives the live ticker). */
  responded: boolean;
}

export interface ShellState {
  route: ShellRoute;
  loggedIn: boolean;
  isAdmin: boolean;
  email: string;
  /** Callsign from the active event's invitation, if any. */
  handle: string | null;
  avatarUrl: string | null;
  /** Event featured in the sidebar card: the one being viewed, else the live/next one. */
  activeEvent: EventData | null;
  access: ShellAccess;
  /** Breadcrumb segments for the top bar. */
  breadcrumb: Crumb[];
  signOut: () => void;
}

const jsonHeaders = (token: string) => ({
  "Content-Type": "application/json",
  Accept: "application/json",
  Authorization: `Bearer ${token}`,
});

const NO_ACCESS: ShellAccess = {
  loading: false,
  attending: false,
  responded: false,
};

/**
 * Everything the shell needs: route, user, the featured event and whether the
 * user may open its RSVP-gated pages. Refetches the invitation whenever a
 * `calandar:rsvp-updated` window event fires (dispatched by the RSVP wizard).
 *
 * Pass `enabled: false` to skip all fetching (when a parent already owns it).
 */
export function useShellState({ enabled = true } = {}): ShellState {
  const { loggedIn, isAdmin, token, email } = useContext(UserContext);
  const { signOut } = useContext(UserDispatchContext);
  const location = useLocation();
  const route = useMemo(
    () => parseRoute(location.pathname),
    [location.pathname],
  );

  const [rsvpVersion, setRsvpVersion] = useState(0);
  useEffect(() => {
    const onRsvp = () => setRsvpVersion((v) => v + 1);
    window.addEventListener("calandar:rsvp-updated", onRsvp);
    return () => window.removeEventListener("calandar:rsvp-updated", onRsvp);
  }, []);

  const active = enabled && loggedIn && Boolean(token);
  const viewedEventId =
    route.eventId &&
    (isEventSection(route.section) || route.section === "adminEvent")
      ? route.eventId
      : null;
  // Admin event pages are read with as_admin (the admin may not be invited).
  const viewedAsAdmin = route.section === "adminEvent" && isAdmin;

  // The event being viewed (for the breadcrumb and sidebar card).
  // Results are stored with the key they were fetched for and derived below,
  // so a stale result is simply ignored instead of being reset in an effect.
  const [viewedState, setViewed] = useState<{
    key: string;
    data: EventData | null;
  } | null>(null);
  const viewedKey = `${viewedEventId}:${viewedAsAdmin}`;
  useEffect(() => {
    if (!active || !viewedEventId) return;
    const controller = new AbortController();
    fetch(
      `/api/events/${viewedEventId}${viewedAsAdmin ? "?as_admin=true" : ""}`,
      { headers: jsonHeaders(token), signal: controller.signal },
    )
      .then((response) => {
        if (response.status === 401) {
          signOut();
          return null;
        }
        return response.ok ? response.text() : null;
      })
      .then((text) => {
        setViewed({
          key: viewedKey,
          data: text ? (JSON.parse(text, dateParser) as EventData) : null,
        });
      })
      .catch((error) => {
        if (error?.name !== "AbortError")
          setViewed({ key: viewedKey, data: null });
      });
    return () => controller.abort();
  }, [active, viewedEventId, viewedAsAdmin, viewedKey, token, signOut]);
  const viewed =
    active && viewedEventId && viewedState?.key === viewedKey
      ? viewedState.data
      : null;

  // The live / next upcoming event the user is invited to.
  const [nextState, setNext] = useState<EventData | null>(null);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    fetch(`/api/events?page=1&limit=50&filter=upcoming`, {
      headers: jsonHeaders(token),
      signal: controller.signal,
    })
      .then((response) => {
        if (response.status === 401) {
          signOut();
          return null;
        }
        return response.ok ? response.text() : null;
      })
      .then((text) => {
        if (!text) return setNext(null);
        const data = JSON.parse(text, dateParser) as PaginatedEventsResponse;
        setNext(pickActiveEvent(data.events ?? [], Date.now()));
      })
      .catch((error) => {
        if (error?.name !== "AbortError") setNext(null);
      });
    return () => controller.abort();
  }, [active, token, signOut]);
  const next = active ? nextState : null;

  const activeEvent =
    (isEventSection(route.section) ? viewed : null) ?? next ?? null;
  const activeEventId = activeEvent?.id ?? null;

  // The user's invitation to the active event: RSVP gate + callsign/avatar.
  const [invite, setInvite] = useState<{
    eventId: number | null;
    access: ShellAccess;
    handle: string | null;
    avatarUrl: string | null;
  }>({ eventId: null, access: NO_ACCESS, handle: null, avatarUrl: null });

  useEffect(() => {
    if (!active || activeEventId == null || !email) return;
    const controller = new AbortController();
    fetch(
      `/api/events/${activeEventId}/invitations/${encodeURIComponent(email)}`,
      { headers: jsonHeaders(token), signal: controller.signal },
    )
      .then((response) => {
        if (response.status === 401) {
          signOut();
          throw new Error("Unauthorized");
        }
        if (!response.ok) throw new Error("Unable to load invitation");
        return response.json() as Promise<{
          response: RSVP | null;
          handle: string | null;
          avatarUrl: string | null;
        }>;
      })
      .then((data) => {
        setInvite({
          eventId: activeEventId,
          handle: data.handle || null,
          avatarUrl: data.avatarUrl || null,
          access: {
            loading: false,
            attending:
              data.response === RSVP.yes || data.response === RSVP.maybe,
            responded: data.response != null,
          },
        });
      })
      .catch((error) => {
        if (error?.name === "AbortError") return;
        setInvite({
          eventId: activeEventId,
          access: NO_ACCESS,
          handle: null,
          avatarUrl: null,
        });
      });
    return () => controller.abort();
  }, [active, activeEventId, email, token, signOut, rsvpVersion]);

  const eventTitle = viewed?.title ?? null;
  const inviteCurrent = active && invite.eventId === activeEventId;

  return {
    route,
    loggedIn,
    isAdmin,
    email,
    handle: inviteCurrent ? invite.handle : null,
    avatarUrl: inviteCurrent ? invite.avatarUrl : null,
    activeEvent,
    access: inviteCurrent
      ? invite.access
      : { ...NO_ACCESS, loading: active && activeEventId != null },
    breadcrumb: buildBreadcrumb(route, eventTitle),
    signOut,
  };
}

export default useShellState;
