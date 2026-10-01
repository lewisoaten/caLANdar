import * as React from "react";
import { useEffect, useState, useContext } from "react";
import moment from "moment";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Skeleton from "@mui/material/Skeleton";
import GroupsSharp from "@mui/icons-material/GroupsSharp";
import LockSharp from "@mui/icons-material/LockSharp";
import { UserContext, UserDispatchContext } from "../UserProvider";
import { dateParser } from "../utils";
import { InvitationLiteData, RsvpCounts } from "../types/invitations";
import { displayCallsign } from "../utils/callsign";
import {
  EmptyState,
  Panel,
  Tag,
  UserAvatar,
  colors,
  fonts,
  hairline,
  srOnly,
  tint,
} from "./hl";
import AttendanceStrip from "./AttendanceStrip";
import {
  RSVP_STATUS,
  rsvpState,
  squadSeatText,
  summariseSquad,
  type SquadSeating,
} from "./lobbyModel";

interface EventAttendeListProps {
  event_id: number;
  responded: number;
  /** Event window, for the per-attendee attendance strips. */
  timeBegin?: moment.Moment;
  timeEnd?: moment.Moment;
  /** The viewer's callsign, to mark their own row. */
  selfHandle?: string | null;
}

type SeatingInfo = SquadSeating;

type Status = "loading" | "ready" | "error";

export default function EventAttendeeList(props: EventAttendeListProps) {
  const { signOut } = useContext(UserDispatchContext);
  const userDetails = useContext(UserContext);
  const token = userDetails?.token;

  const [attendees, setAttendees] = useState<InvitationLiteData[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [retry, setRetry] = useState(0);
  const [seating, setSeating] = useState<SeatingInfo | null>(null);
  // Totals including guests who declined or haven't replied, whom the squad
  // list leaves out. Null until loaded (or on an API without the endpoint).
  const [rsvpCounts, setRsvpCounts] = useState<RsvpCounts | null>(null);

  const headers = React.useMemo(
    () => ({
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: "Bearer " + token,
    }),
    [token],
  );

  useEffect(() => {
    if (!props.responded) return;
    let cancelled = false;
    fetch(`/api/events/${props.event_id}/invitations`, { headers })
      .then((response) => {
        if (response.status === 401) {
          signOut();
          return undefined;
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response
          .text()
          .then(
            (data) => JSON.parse(data, dateParser) as Array<InvitationLiteData>,
          );
      })
      .then((data) => {
        if (data && !cancelled) {
          setAttendees(data);
          setStatus("ready");
        }
      })
      .catch((error) => {
        console.error("Error fetching attendees:", error);
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [props.event_id, props.responded, retry, headers, signOut]);

  useEffect(() => {
    if (!props.responded) return;
    const controller = new AbortController();
    fetch(`/api/events/${props.event_id}/rsvp_counts`, {
      headers,
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: RsvpCounts | null) => {
        if (!controller.signal.aborted) setRsvpCounts(data);
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          console.error("Error fetching RSVP counts:", error);
      });
    return () => controller.abort();
  }, [props.event_id, props.responded, headers]);

  // Seat labels for the right-hand column (only when the event has seating).
  useEffect(() => {
    if (!props.responded || !token) return;
    let cancelled = false;
    (async () => {
      try {
        const cfgRes = await fetch(
          `/api/events/${props.event_id}/seating-config`,
          { headers },
        );
        const cfg = cfgRes.ok ? await cfgRes.json() : null;
        if (!cfg?.hasSeating) {
          if (!cancelled) setSeating(null);
          return;
        }
        const seatsRes = await fetch(`/api/events/${props.event_id}/seats`, {
          headers,
        });
        const seats: Array<{ id: number; label: string }> = seatsRes.ok
          ? await seatsRes.json()
          : [];
        if (cancelled) return;
        setSeating({
          hasSeating: true,
          allowUnspecifiedSeat: Boolean(cfg.allowUnspecifiedSeat),
          unspecifiedSeatLabel: cfg.unspecifiedSeatLabel || "Unspecified Seat",
          labels: new Map(seats.map((s) => [s.id, s.label])),
        });
      } catch (error) {
        console.error("Error fetching seat labels:", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.event_id, props.responded, token, headers]);

  const { sorted, counts: listed } = summariseSquad(attendees);
  const counts = rsvpCounts
    ? { ...rsvpCounts, none: rsvpCounts.pending }
    : listed;
  const ready = !!props.responded && status === "ready";

  const counters = ready ? (
    <Box
      component="p"
      sx={{
        m: 0,
        display: "flex",
        flexWrap: "wrap",
        gap: 1.5,
        fontFamily: fonts.mono,
        fontSize: 11,
        letterSpacing: "0.12em",
      }}
    >
      <Box component="span" aria-hidden="true" sx={{ color: colors.lime }}>
        {counts.yes} IN
      </Box>
      <Box component="span" aria-hidden="true" sx={{ color: colors.amber }}>
        {counts.maybe} MAYBE
      </Box>
      <Box component="span" aria-hidden="true" sx={{ color: colors.pinkText }}>
        {counts.no} OUT
      </Box>
      {counts.none > 0 && (
        <Box
          component="span"
          aria-hidden="true"
          sx={{ color: colors.textMuted }}
        >
          {counts.none} PENDING
        </Box>
      )}
      <Box component="span" sx={srOnly}>
        {`${counts.yes} in, ${counts.maybe} maybe, ${counts.no} out${counts.none ? `, ${counts.none} yet to reply` : ""}`}
      </Box>
    </Box>
  ) : undefined;

  let body: React.ReactNode;
  if (!props.responded) {
    body = (
      <EmptyState
        icon={<LockSharp />}
        title="Squad locked"
        description="RSVP to see who's coming."
      />
    );
  } else if (status === "loading") {
    body = (
      <Box role="status" aria-label="Loading squad">
        {Array.from({ length: 4 }).map((_, i) => (
          <Box
            key={i}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.75,
              px: 2.5,
              py: 1.5,
              borderBottom: `1px solid ${hairline.faint}`,
            }}
          >
            <Skeleton variant="rectangular" width={38} height={38} />
            <Box sx={{ flex: 1 }}>
              <Skeleton width="40%" />
              <Skeleton width={160} height={8} />
            </Box>
          </Box>
        ))}
      </Box>
    );
  } else if (status === "error") {
    body = (
      <EmptyState
        title="Couldn't load the squad"
        description="Check your connection and try again."
        action={
          <Button
            variant="outlined"
            onClick={() => {
              setStatus("loading");
              setRetry((r) => r + 1);
            }}
          >
            Retry
          </Button>
        }
      />
    );
  } else if (sorted.length === 0) {
    body = (
      <EmptyState
        icon={<GroupsSharp />}
        title="No squad yet"
        description="Nobody else has been invited to this event yet."
      />
    );
  } else {
    body = (
      <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0 }}>
        {sorted.map((attendee, i) => {
          const st = rsvpState(attendee.response);
          const copy = RSVP_STATUS[st];
          const isSelf =
            attendee.isSelf ??
            (!!props.selfHandle &&
              !!attendee.handle &&
              attendee.handle === props.selfHandle);
          const handle = displayCallsign(attendee.handle);
          const seat = seating ? squadSeatText(attendee, seating) : null;
          return (
            <Box
              component="li"
              key={`${attendee.handle}-${i}`}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.75,
                px: 2.5,
                py: 1.5,
                borderBottom: `1px solid ${hairline.faint}`,
                backgroundColor: isSelf ? tint("cyan", 0.05) : undefined,
                "&:last-of-type": { borderBottom: 0 },
              }}
            >
              <UserAvatar
                name={attendee.handle}
                src={attendee.avatarUrl}
                size={38}
                sx={st === "no" ? { opacity: 0.55 } : undefined}
              />
              <Box
                sx={{
                  flex: 1,
                  minWidth: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: "5px",
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    flexWrap: "wrap",
                    minWidth: 0,
                  }}
                >
                  <Box
                    component="span"
                    sx={{
                      fontSize: 15,
                      fontWeight: 600,
                      minWidth: 0,
                      overflowWrap: "anywhere",
                    }}
                  >
                    {handle}
                    {isSelf && (
                      <Box
                        component="span"
                        sx={{ color: colors.textMuted, fontWeight: 400 }}
                      >
                        {" "}
                        (you)
                      </Box>
                    )}
                  </Box>
                  <Tag
                    tone={copy.tone === "cyan" ? "neutral" : copy.tone}
                    size="sm"
                  >
                    {copy.tag}
                  </Tag>
                </Box>
                {props.timeBegin && props.timeEnd && st !== "none" && (
                  <AttendanceStrip
                    attendance={attendee.attendance}
                    timeBegin={props.timeBegin}
                    timeEnd={props.timeEnd}
                    tone={st === "maybe" ? "amber" : "lime"}
                    off={st === "no"}
                    label={`${handle} attending`}
                  />
                )}
              </Box>
              {seat && (
                <Box
                  sx={{
                    flex: "0 1 auto",
                    // Narrow on phones so long callsigns keep their room;
                    // labels wrap between words ("Floating / no seat").
                    maxWidth: { xs: "30%", sm: "40%" },
                    textAlign: "right",
                    overflowWrap: "break-word",
                    fontFamily: fonts.mono,
                    fontSize: 13,
                    fontWeight: 500,
                    color:
                      seat.kind === "seat" ? colors.text : colors.textMuted,
                  }}
                >
                  <Box component="span" sx={srOnly}>
                    Seat:{" "}
                  </Box>
                  {seat.kind === "none" ? (
                    <>
                      <span aria-hidden="true">—</span>
                      <Box component="span" sx={srOnly}>
                        {seat.text}
                      </Box>
                    </>
                  ) : (
                    seat.text
                  )}
                </Box>
              )}
            </Box>
          );
        })}
      </Box>
    );
  }

  return (
    <Panel title="Squad" actions={counters} padding="none" bracket="none">
      {body}
    </Panel>
  );
}
