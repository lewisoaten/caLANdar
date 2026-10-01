import * as React from "react";
import moment from "moment";
import { useCallback, useEffect, useState, useContext } from "react";
import { Link as RouterLink, useParams } from "react-router-dom";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Skeleton from "@mui/material/Skeleton";
import Typography from "@mui/material/Typography";
import EventBusySharp from "@mui/icons-material/EventBusySharp";
import ErrorOutlineSharp from "@mui/icons-material/ErrorOutlineSharp";
import { UserContext, UserDispatchContext } from "../UserProvider";
import { dateParser } from "../utils";
import { EventData, defaultEventData } from "../types/events";
import { InvitationData, defaultInvitationData } from "../types/invitations";
import EventGameSuggestions from "./EventGameSuggestions";
import EventAttendeeList from "./EventAttendeeList";
import { RSVPWizard, RSVPSummary } from "./RSVPWizard";
import {
  Countdown,
  EmptyState,
  Tag,
  chamfer,
  colors,
  fonts,
  srOnly,
  tint,
  useNow,
} from "./hl";
import {
  eventPhase,
  formatEventId,
  formatEventRange,
  splitTitleAccent,
} from "./lobbyModel";

type LoadState = "loading" | "ready" | "notFound" | "error";

const heroFrame = {
  position: "relative",
  overflow: "hidden",
  border: `1px solid ${tint("cyan", 0.22)}`,
  minHeight: "clamp(340px, 42vw, 440px)",
  display: "flex",
  flexDirection: "column",
  justifyContent: "flex-end",
  clipPath: chamfer(28, "tr-bl"),
} as const;

function LobbyHero({ event }: { event: EventData }) {
  const now = useNow(1000);
  const phase = eventPhase(event.timeBegin, event.timeEnd, now);
  const { head, accent } = splitTitleAccent(event.title);
  const imageUrl = event.image
    ? `data:image/jpeg;base64,${event.image}`
    : "/static/lan_party_image.jpg";

  return (
    <Box component="section" aria-labelledby="lobby-title" sx={heroFrame}>
      <Box
        aria-hidden="true"
        sx={{
          position: "absolute",
          inset: 0,
          backgroundImage: `url("${imageUrl}")`,
          backgroundSize: "cover",
          backgroundPosition: "center 30%",
          filter: "saturate(1.2) contrast(1.05)",
        }}
      />
      <Box
        aria-hidden="true"
        sx={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(180deg,rgba(6,7,11,0.25) 0%,rgba(6,7,11,0.7) 45%,${colors.bg} 100%),linear-gradient(90deg,rgba(6,7,11,0.85) 0%,rgba(6,7,11,0) 70%)`,
        }}
      />
      <Box
        aria-hidden="true"
        sx={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "repeating-linear-gradient(0deg,rgba(255,255,255,0.025) 0 1px,transparent 1px 3px)",
        }}
      />
      <Box
        sx={{
          position: "relative",
          p: "clamp(20px, 3.5vw, 44px)",
          display: "flex",
          flexDirection: "column",
          gap: "18px",
        }}
      >
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
          <Tag
            variant="solid"
            sx={{ height: 26, py: 0, px: "10px", letterSpacing: "0.14em" }}
          >
            {formatEventId(event.id)}
          </Tag>
          <Tag
            tone="neutral"
            sx={{
              height: 26,
              py: 0,
              px: "10px",
              color: colors.text,
              borderColor: tint("text", 0.3),
              backgroundColor: "rgba(6,7,11,0.5)",
              fontWeight: 400,
            }}
          >
            {formatEventRange(event.timeBegin, event.timeEnd)}
          </Tag>
          {phase === "live" && (
            <Tag tone="lime" dot="pulse" sx={{ height: 26, py: 0 }}>
              Live now
            </Tag>
          )}
          {phase === "ended" && (
            <Tag tone="neutral" sx={{ height: 26, py: 0 }}>
              Ended
            </Tag>
          )}
        </Box>
        <Typography
          id="lobby-title"
          variant="h1"
          sx={{
            m: 0,
            fontSize: "clamp(38px, 6.4vw, 80px)",
            lineHeight: 0.92,
            letterSpacing: "-0.01em",
            textWrap: "balance",
            maxWidth: "14ch",
            overflowWrap: "anywhere",
          }}
        >
          {head}
          {accent && (
            <>
              {" "}
              <Box component="span" sx={{ color: colors.cyan }}>
                {accent}
              </Box>
            </>
          )}
        </Typography>
        {event.description && (
          <Typography
            component="p"
            sx={{
              m: 0,
              maxWidth: "62ch",
              fontSize: "clamp(15px, 1.4vw, 17px)",
              lineHeight: 1.6,
              color: colors.text2,
              whiteSpace: "pre-wrap",
              textWrap: "pretty",
            }}
          >
            {event.description}
          </Typography>
        )}
        {phase === "upcoming" && (
          <Countdown
            target={event.timeBegin}
            now={now}
            label="Time until doors open"
          />
        )}
        {phase === "live" && (
          <Typography
            component="p"
            sx={{
              m: 0,
              fontFamily: fonts.mono,
              fontSize: 13,
              letterSpacing: "0.12em",
              color: colors.textMuted,
            }}
          >
            ENDS IN{" "}
            <Countdown
              target={event.timeEnd}
              now={now}
              variant="inline"
              label="Time until the event ends"
            />
          </Typography>
        )}
      </Box>
    </Box>
  );
}

function LobbySkeleton() {
  return (
    <Box
      role="status"
      aria-label="Loading event"
      sx={{ display: "flex", flexDirection: "column", gap: 3 }}
    >
      <Box sx={{ ...heroFrame, p: "clamp(20px, 3.5vw, 44px)", gap: 2 }}>
        <Skeleton variant="rectangular" width={260} height={26} />
        <Skeleton variant="rectangular" width="60%" height={72} />
        <Skeleton variant="text" width="80%" />
        <Skeleton variant="rectangular" width={380} height={70} />
      </Box>
      <Skeleton variant="rectangular" height={140} />
    </Box>
  );
}

const Event = () => {
  const { signOut } = useContext(UserDispatchContext);
  const userDetails = useContext(UserContext);
  const token = userDetails?.token;
  const email = userDetails?.email;
  const [event, setEvent] = useState(defaultEventData);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [reloadKey, setReloadKey] = useState(0);
  const [savedCount, setSavedCount] = useState(0);
  const [invitation, setInvitation] = useState(defaultInvitationData);
  const [invitationLoaded, setInvitationLoaded] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);

  const { id } = useParams();
  const loaded = loadState === "ready";

  // Non-zero once the viewer has responded (unlocks attendees/suggestions);
  // bumps after every save so those lists refetch.
  const responded = (invitation.response ? 1 : 0) + savedCount;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/events/${id}`, {
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
        if (response.status === 404 || response.status === 403) {
          if (!cancelled) setLoadState("notFound");
          return undefined;
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response
          .text()
          .then((data) => JSON.parse(data, dateParser) as EventData);
      })
      .then((data) => {
        if (data && !cancelled) {
          setEvent(data);
          setLoadState("ready");
        }
      })
      .catch((error) => {
        console.error("Error fetching event:", error);
        if (!cancelled) setLoadState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [id, token, reloadKey, signOut]);

  // Fetch invitation data for attendance buckets
  useEffect(() => {
    if (!id || !token || !email) return;

    const fetchInvitation = () => {
      fetch(`/api/events/${id}/invitations/${encodeURIComponent(email)}`, {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: "Bearer " + token,
        },
      })
        .then((response) => {
          if (response.status === 401) signOut();
          else if (response.ok)
            return response
              .text()
              .then((data) => JSON.parse(data, dateParser) as InvitationData);
        })
        .then((data) => {
          if (data) {
            setInvitation(data);
          }
        })
        .catch((error) => {
          console.error("Error fetching invitation:", error);
        })
        .finally(() => setInvitationLoaded(true));
    };

    fetchInvitation();

    // Also listen for RSVP updates to refresh immediately
    const handleRsvpUpdate = () => {
      fetchInvitation();
    };

    window.addEventListener("calandar:rsvp-updated", handleRsvpUpdate);
    return () => {
      window.removeEventListener("calandar:rsvp-updated", handleRsvpUpdate);
    };
  }, [id, token, email, responded, signOut]);

  const openWizard = useCallback(() => setWizardOpen(true), []);

  if (loadState === "loading") return <LobbySkeleton />;

  if (loadState === "notFound" || loadState === "error") {
    const notFound = loadState === "notFound";
    return (
      <>
        <Typography variant="h1" sx={srOnly}>
          {notFound ? "Event not found" : "Event unavailable"}
        </Typography>
        <EmptyState
          variant="panel"
          icon={notFound ? <EventBusySharp /> : <ErrorOutlineSharp />}
          kicker={notFound ? "404" : "CONNECTION LOST"}
          title={notFound ? "Event not found" : "Couldn't load this event"}
          description={
            notFound
              ? "It may have been removed, or you haven't been invited to it."
              : "Check your connection and try again."
          }
          action={
            notFound ? (
              <Button variant="outlined" component={RouterLink} to="/events">
                Back to events
              </Button>
            ) : (
              <Button
                variant="outlined"
                onClick={() => {
                  setLoadState("loading");
                  setReloadKey((k) => k + 1);
                }}
              >
                Retry
              </Button>
            )
          }
        />
      </>
    );
  }

  const ended = event.timeEnd.isSameOrBefore(moment());

  return (
    <>
      <LobbyHero event={event} />

      {invitationLoaded ? (
        <RSVPSummary
          invitation={invitation}
          event={event}
          onEdit={openWizard}
          disabled={ended}
        />
      ) : (
        <Skeleton
          variant="rectangular"
          height={140}
          aria-label="Loading your RSVP"
        />
      )}

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(min(100%, 440px), 1fr))",
          gap: "clamp(16px, 2vw, 24px)",
          alignItems: "start",
        }}
      >
        <EventAttendeeList
          event_id={event.id}
          responded={responded}
          timeBegin={event.timeBegin}
          timeEnd={event.timeEnd}
          selfHandle={invitation.response ? invitation.handle : null}
        />
        <EventGameSuggestions
          event_id={event.id}
          responded={responded}
          disabled={ended}
        />
      </Box>

      {/* The live activity ticker is rendered by the app shell (Dashboard). */}

      {loaded && (
        <RSVPWizard
          open={wizardOpen}
          onClose={() => setWizardOpen(false)}
          event={event}
          initialData={invitation}
          onSaved={() => {
            setSavedCount((prev) => prev + 1);
          }}
        />
      )}
    </>
  );
};

export default Event;
