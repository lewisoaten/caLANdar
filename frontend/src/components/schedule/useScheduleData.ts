import * as React from "react";
import { dateParser } from "../../utils";
import { EventData } from "../../types/events";
import { GameScheduleEntry } from "../../types/game_schedule";
import { GameSuggestion } from "../../types/game_suggestions";
import { InvitationLiteData } from "../../types/invitations";

export type LoadState = "loading" | "ready" | "error";

const parse = <T>(text: string): T => JSON.parse(text, dateParser) as T;

/**
 * Loads everything the schedule page needs: the event, its schedule (pinned
 * plus the scheduler's live suggestions), the vote list and attendance.
 *
 * Background refreshes (after a move, pin, add...) keep the current data on
 * screen; only the first load shows a skeleton.
 */
export function useScheduleData(
  id: string | undefined,
  token: string | undefined,
  signOut: () => void,
) {
  const [event, setEvent] = React.useState<EventData | null>(null);
  const [eventState, setEventState] = React.useState<LoadState>("loading");
  const [schedule, setSchedule] = React.useState<GameScheduleEntry[]>([]);
  const [scheduleState, setScheduleState] =
    React.useState<LoadState>("loading");
  const [suggestions, setSuggestions] = React.useState<GameSuggestion[]>([]);
  const [suggestionsState, setSuggestionsState] =
    React.useState<LoadState>("loading");
  const [invitations, setInvitations] = React.useState<InvitationLiteData[]>(
    [],
  );
  const scheduleReq = React.useRef(0);

  const headers = React.useMemo(
    () => ({
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: "Bearer " + token,
    }),
    [token],
  );

  const get = React.useCallback(
    async <T>(url: string): Promise<T | undefined> => {
      const response = await fetch(url, { headers });
      if (response.status === 401) {
        signOut();
        return undefined;
      }
      if (!response.ok) throw new Error(`${url}: ${response.status}`);
      return parse<T>(await response.text());
    },
    [headers, signOut],
  );

  const fetchEvent = React.useCallback(() => {
    if (!id || !token) return;
    get<EventData>(`/api/events/${id}`)
      .then((data) => {
        if (data) {
          setEvent(data);
          setEventState("ready");
        }
      })
      .catch((error) => {
        console.error("Error fetching event:", error);
        setEventState("error");
      });
  }, [id, token, get]);

  React.useEffect(fetchEvent, [fetchEvent]);

  const reloadEvent = React.useCallback(() => {
    setEventState("loading");
    fetchEvent();
  }, [fetchEvent]);

  const eventId = event?.id;

  const fetchSchedule = React.useCallback(
    (options: { background?: boolean } = {}) => {
      if (!eventId || !token) return Promise.resolve();
      const req = ++scheduleReq.current;
      return get<GameScheduleEntry[]>(`/api/events/${eventId}/game_schedule`)
        .then((data) => {
          if (req !== scheduleReq.current) return;
          if (data) setSchedule(data);
          setScheduleState("ready");
        })
        .catch((error) => {
          if (req !== scheduleReq.current) return;
          console.error("Error fetching game schedule:", error);
          // Keep what is on screen after a failed background refresh.
          if (!options.background) setScheduleState("error");
        });
    },
    [eventId, token, get],
  );

  const refreshSuggestions = React.useCallback(() => {
    if (!eventId || !token) return Promise.resolve();
    return get<GameSuggestion[]>(`/api/events/${eventId}/suggested_games`)
      .then((data) => {
        if (data) setSuggestions(data);
        setSuggestionsState("ready");
      })
      .catch((error) => {
        console.error("Error fetching game suggestions:", error);
        setSuggestionsState("error");
      });
  }, [eventId, token, get]);

  React.useEffect(() => {
    void fetchSchedule();
  }, [fetchSchedule]);

  /** Reload the schedule; `background` keeps the current data on screen. */
  const refreshSchedule = React.useCallback(
    (options: { background?: boolean } = {}) => {
      if (!options.background) setScheduleState("loading");
      return fetchSchedule(options);
    },
    [fetchSchedule],
  );

  React.useEffect(() => {
    if (!eventId || !token) return;
    refreshSuggestions();
    get<InvitationLiteData[]>(`/api/events/${eventId}/invitations`)
      .then((data) => data && setInvitations(data))
      .catch((error) => console.error("Error fetching invitations:", error));
  }, [eventId, token, get, refreshSuggestions]);

  return {
    event,
    eventState,
    reloadEvent,
    schedule,
    setSchedule,
    scheduleState,
    refreshSchedule,
    suggestions,
    suggestionsState,
    refreshSuggestions,
    invitations,
    headers,
  };
}

export default useScheduleData;
