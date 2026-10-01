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
import { InvitationLiteData } from "../types/invitations";
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
import { RSVP_STATUS, rsvpState, summariseSquad } from "./lobbyModel";

interface EventAttendeListProps {
  event_id: number;
  responded: number;
  /** Event window, for the per-attendee attendance strips. */
  timeBegin?: moment.Moment;
  timeEnd?: moment.Moment;
  /** The viewer's callsign, to mark their own row. */
  selfHandle?: string | null;
}

interface SeatingInfo {
  hasSeating: boolean;
  allowUnspecifiedSeat: boolean;
  unspecifiedSeatLabel: string;
  labels: Map<number, string>;
}

type Status = "loading" | "ready" | "error";

export default function EventAttendeeList(props: EventAttendeListProps) {
  const { signOut } = useContext(UserDispatchContext);
  const userDetails = useContext(UserContext);
  const token = userDetails?.token;

  const [attendees, setAttendees] = useState<InvitationLiteData[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [retry, setRetry] = useState(0);
  const [seating, setSeating] = useState<SeatingInfo | null>(null);

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

  const { sorted, counts } = summariseSquad(attendees);
  const ready = !!props.responded && status === "ready";

  const counters = ready ? (
    <Box
      component="p"
      aria-label={`${counts.yes} in, ${counts.maybe} maybe, ${counts.no} out${counts.none ? `, ${counts.none} yet to reply` : ""}`}
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
    </Box>
  ) : undefined;

  const seatText = (a: InvitationLiteData): string => {
    const st = rsvpState(a.response);
    if (st === "no" || st === "none") return "—";
    if (a.seatId !== null && seating?.labels.has(a.seatId))
      return seating.labels.get(a.seatId) ?? "—";
    return seating?.allowUnspecifiedSeat ? "BYO" : "—";
  };

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
            !!props.selfHandle &&
            !!attendee.handle &&
            attendee.handle === props.selfHandle;
          const handle = attendee.handle || "Unnamed gamer";
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
              {seating?.hasSeating && (
                <Box
                  sx={{
                    flex: "none",
                    fontFamily: fonts.mono,
                    fontSize: 13,
                    fontWeight: 500,
                    color:
                      seatText(attendee) === "—" || seatText(attendee) === "BYO"
                        ? colors.textDim
                        : colors.text,
                  }}
                  title={
                    seatText(attendee) === "BYO"
                      ? seating.unspecifiedSeatLabel
                      : undefined
                  }
                >
                  <Box component="span" sx={srOnly}>
                    Seat:{" "}
                  </Box>
                  {seatText(attendee) === "—" ? (
                    <>
                      <span aria-hidden="true">—</span>
                      <Box component="span" sx={srOnly}>
                        none
                      </Box>
                    </>
                  ) : (
                    seatText(attendee)
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
