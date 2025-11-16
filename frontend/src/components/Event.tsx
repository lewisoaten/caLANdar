import * as React from "react";
import moment from "moment";
import { useEffect, useState, useContext } from "react";
import { createPortal } from "react-dom";
import { Container, Paper, Typography, Grid, Box, alpha } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { UserContext, UserDispatchContext } from "../UserProvider";
import { useParams } from "react-router-dom";
import { dateParser } from "../utils";
import { EventData, defaultEventData } from "../types/events";
import {
  InvitationData,
  defaultInvitationData,
  RSVP,
} from "../types/invitations";
import InvitationResponse from "./InvitationResponse";
import EventGameSuggestions from "./EventGameSuggestions";
import EventAttendeeList from "./EventAttendeeList";
import SeatSelector from "./SeatSelector";

const Event = () => {
  const { signOut } = useContext(UserDispatchContext);
  const userDetails = useContext(UserContext);
  const token = userDetails?.token;
  const email = userDetails?.email;
  const [event, setEvent] = useState(defaultEventData);
  const [loaded, setLoaded] = useState(false);
  const [responded, setResponded] = useState(0);
  const [invitation, setInvitation] = useState(defaultInvitationData);
  const theme = useTheme();

  const { id } = useParams();

  useEffect(() => {
    fetch(`/api/events/${id}`, {
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
            .then((data) => JSON.parse(data, dateParser) as EventData);
      })
      .then((data) => {
        if (data) {
          setEvent(data);
          setLoaded(true);
        }
      });
  }, []);

  // Fetch invitation data for attendance buckets
  useEffect(() => {
    if (!id || !token || !email) return;

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
      });
  }, [id, token, email, responded, signOut]);

  // Cleanup: Reset Dashboard background when component unmounts
  useEffect(() => {
    // Make Dashboard's main area transparent to show background
    const mainElement = document.querySelector("main");
    if (mainElement instanceof HTMLElement) {
      const originalBackground = mainElement.style.background;
      mainElement.style.background = "transparent";

      return () => {
        // Restore original background on unmount
        mainElement.style.background = originalBackground;
      };
    }
  }, []);

  // Construct image URL (use default if none is provided)
  const eventImageUrl = event.image
    ? `data:image/jpeg;base64,${event.image}`
    : "/static/lan_party_image.jpg";

  // Check if user prefers reduced motion (reactive to changes)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (e: MediaQueryListEvent) =>
      setPrefersReducedMotion(e.matches);
    // Set initial value in case it changed since mount
    setPrefersReducedMotion(mediaQuery.matches);
    mediaQuery.addEventListener("change", handler);
    return () => {
      mediaQuery.removeEventListener("change", handler);
    };
  }, []);

  // Preload the background image for performance
  useEffect(() => {
    const img = new Image();
    img.src = eventImageUrl;
  }, [eventImageUrl]);

  // Frosted glass styles - extracted to avoid duplication
  const frostedGlassSx = {
    backdropFilter: "blur(12px)",
    backgroundColor: alpha(theme.palette.background.paper, 0.4),
    backgroundImage: "none !important", // Override theme gradient
    border: `1px solid ${alpha(theme.palette.primary.main, 0.5)}`,
    boxShadow: `0 0 24px -4px ${alpha(theme.palette.primary.main, 0.3)}`,
    color: theme.palette.text.primary,
    transition: prefersReducedMotion ? "none" : "all 0.3s ease-in-out",
    "&:hover": {
      border: `1px solid ${alpha(theme.palette.primary.main, 0.7)}`,
      boxShadow: `0 0 32px -2px ${alpha(theme.palette.primary.main, 0.4)}`,
    },
    "&:focus-within": {
      outline: `2px solid ${alpha(theme.palette.secondary.main, 0.8)}`,
      outlineOffset: "2px",
    },
  };

  return (
    <>
      {/* Portal background layers to document body so they appear behind Dashboard */}
      {createPortal(
        <>
          {/* Background image positioned at top, fading to solid color */}
          <Box
            sx={{
              position: "fixed",
              top: 0,
              left: { xs: 0, sm: 240 },
              right: 0,
              height: "100%", // Image occupies full viewport
              backgroundImage: `url("${eventImageUrl}")`,
              backgroundSize: "contain", // Show full image without extreme zoom
              backgroundPosition: "center top",
              backgroundRepeat: "no-repeat",
              filter: "blur(1px) saturate(1.05) brightness(0.9)",
              zIndex: -2,
              imageRendering: "auto",
            }}
            role="presentation"
            aria-hidden="true"
          />

          {/* Gradient overlay fading from image to solid background */}
          <Box
            sx={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: `linear-gradient(to bottom, ${alpha("#000", 0.5)} 0%, ${alpha("#000", 0.75)} 30%, ${alpha(theme.palette.background.default, 0.95)} 50%, ${theme.palette.background.default} 70%)`,
              zIndex: -1,
            }}
            role="presentation"
            aria-hidden="true"
          />
        </>,
        document.body,
      )}

      {/* Main content with frosted glass panels */}
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4, position: "relative" }}>
        <Grid container spacing={3}>
          {/* Hero/Info Panel */}
          <Grid size={{ xs: 12, md: 12, lg: 12 }}>
            <Paper
              sx={{
                ...frostedGlassSx,
                p: 3,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <Grid container spacing={2}>
                <Grid size={6}>
                  <Typography
                    component="h2"
                    variant="h4"
                    sx={{
                      color: theme.palette.text.secondary,
                      fontWeight: 700,
                    }}
                    gutterBottom
                  >
                    {event.title}
                  </Typography>
                </Grid>
                <Grid size={6}>
                  <Paper
                    variant="outlined"
                    sx={{
                      backdropFilter: "blur(8px)",
                      backgroundColor: alpha(
                        theme.palette.background.paper,
                        0.3,
                      ),
                      backgroundImage: "none !important", // Override theme gradient
                      border: `1px solid ${alpha(theme.palette.secondary.main, 0.4)}`,
                      boxShadow: `0 0 16px -4px ${alpha(theme.palette.secondary.main, 0.2)}`,
                    }}
                  >
                    <Typography
                      component="h3"
                      variant="h6"
                      display="block"
                      align="center"
                      sx={{
                        color: theme.palette.secondary.main,
                        fontWeight: 600,
                      }}
                      gutterBottom
                    >
                      Gaming {event.timeBegin.fromNow()}!
                    </Typography>
                  </Paper>
                </Grid>
                <Grid size={12}>
                  <Typography
                    variant="body1"
                    gutterBottom
                    sx={{
                      whiteSpace: "pre-wrap",
                      color: theme.palette.text.primary,
                      lineHeight: 1.7,
                    }}
                  >
                    {event.description}
                  </Typography>
                </Grid>
                <Grid size={12}>
                  {loaded && (
                    <InvitationResponse
                      event={event}
                      setResponded={setResponded}
                      disabled={event.timeEnd.isSameOrBefore(moment())}
                    />
                  )}
                </Grid>
              </Grid>
            </Paper>
          </Grid>

          {/* Attendees Panel */}
          <Grid size={{ xs: 12, md: 6, lg: 6 }}>
            <Paper
              sx={{
                ...frostedGlassSx,
                p: 3,
                display: "flex",
                flexDirection: "column",
                minHeight: "300px",
              }}
            >
              {loaded && (
                <EventAttendeeList event_id={event.id} responded={responded} />
              )}
            </Paper>
          </Grid>

          {/* Game Suggestions Panel */}
          <Grid size={{ xs: 12, md: 6, lg: 6 }}>
            <Paper
              sx={{
                ...frostedGlassSx,
                p: 3,
                display: "flex",
                flexDirection: "column",
                minHeight: "300px",
              }}
            >
              {loaded && (
                <EventGameSuggestions
                  event_id={event.id}
                  responded={responded}
                  disabled={event.timeEnd.isSameOrBefore(moment())}
                />
              )}
            </Paper>
          </Grid>

          {/* Seat Selection Panel */}
          {loaded && invitation.response && invitation.response !== RSVP.no && (
            <Grid size={{ xs: 12, md: 12, lg: 12 }}>
              <Paper
                sx={{
                  ...frostedGlassSx,
                  p: 3,
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <SeatSelector
                  eventId={event.id}
                  attendanceBuckets={invitation.attendance}
                  disabled={event.timeEnd.isSameOrBefore(moment())}
                  onReservationChange={() => setResponded((prev) => prev + 1)}
                />
              </Paper>
            </Grid>
          )}
        </Grid>
      </Container>
    </>
  );
};

export default Event;
