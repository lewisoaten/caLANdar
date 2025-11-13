import * as React from "react";
import moment from "moment";
import { useEffect, useState, useContext } from "react";
import { createPortal } from "react-dom";
import { Container, Paper, Typography, Grid, Box } from "@mui/material";
import { UserContext, UserDispatchContext } from "../UserProvider";
import { useParams } from "react-router-dom";
import { dateParser } from "../utils";
import { EventData, defaultEventData } from "../types/events";
import InvitationResponse from "./InvitationResponse";
import EventGameSuggestions from "./EventGameSuggestions";
import EventAttendeeList from "./EventAttendeeList";

const Event = () => {
  const { signOut } = useContext(UserDispatchContext);
  const userDetails = useContext(UserContext);
  const token = userDetails?.token;
  const [event, setEvent] = useState(defaultEventData);
  const [loaded, setLoaded] = useState(false);
  const [responded, setResponded] = useState(false);

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

  // Check if user prefers reduced motion
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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
              left: 0,
              right: 0,
              height: "70vh", // Image occupies top portion only
              backgroundImage: `url("${eventImageUrl}")`,
              backgroundSize: "contain", // Show full image without extreme zoom
              backgroundPosition: "center top",
              backgroundRepeat: "no-repeat",
              filter: "blur(8px) saturate(1.05) brightness(0.9)",
              zIndex: -2,
              // Preload the image for performance
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
              background:
                "linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.75) 30%, rgba(22,22,26,0.95) 50%, #16161a 70%)",
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
                p: 3,
                display: "flex",
                flexDirection: "column",
                // Frosted glass effect - use !important to override theme defaults
                backdropFilter: "blur(12px) !important",
                backgroundColor: "rgba(35, 41, 70, 0.4) !important",
                backgroundImage: "none !important", // Override theme gradient
                border: "1px solid rgba(95, 39, 221, 0.5) !important",
                boxShadow: "0 0 24px -4px rgba(95, 39, 221, 0.3) !important",
                // Accessibility: high contrast text
                color: "#ffffff",
                // Smooth transitions (disabled if user prefers reduced motion)
                transition: prefersReducedMotion
                  ? "none"
                  : "all 0.3s ease-in-out",
                "&:hover": {
                  border: "1px solid rgba(95, 39, 221, 0.7) !important",
                  boxShadow: "0 0 32px -2px rgba(95, 39, 221, 0.4) !important",
                },
                // Ensure keyboard focus is visible
                "&:focus-within": {
                  outline: "2px solid rgba(8, 247, 254, 0.8)",
                  outlineOffset: "2px",
                },
              }}
            >
              <Grid container spacing={2}>
                <Grid size={6}>
                  <Typography
                    component="h2"
                    variant="h4"
                    sx={{
                      color: "#d0d7f7",
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
                      backdropFilter: "blur(8px) !important",
                      backgroundColor: "rgba(35, 41, 70, 0.3) !important",
                      backgroundImage: "none !important", // Override theme gradient
                      border: "1px solid rgba(8, 247, 254, 0.4) !important",
                      boxShadow:
                        "0 0 16px -4px rgba(8, 247, 254, 0.2) !important",
                    }}
                  >
                    <Typography
                      component="h3"
                      variant="h6"
                      display="block"
                      align="center"
                      sx={{
                        color: "#08F7FE",
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
                      color: "#ffffff",
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
                p: 3,
                display: "flex",
                flexDirection: "column",
                minHeight: "300px",
                // Frosted glass effect - use !important to override theme defaults
                backdropFilter: "blur(12px) !important",
                backgroundColor: "rgba(35, 41, 70, 0.4) !important",
                backgroundImage: "none !important", // Override theme gradient
                border: "1px solid rgba(95, 39, 221, 0.5) !important",
                boxShadow: "0 0 24px -4px rgba(95, 39, 221, 0.3) !important",
                color: "#ffffff",
                transition: prefersReducedMotion
                  ? "none"
                  : "all 0.3s ease-in-out",
                "&:hover": {
                  border: "1px solid rgba(95, 39, 221, 0.7) !important",
                  boxShadow: "0 0 32px -2px rgba(95, 39, 221, 0.4) !important",
                },
                "&:focus-within": {
                  outline: "2px solid rgba(8, 247, 254, 0.8)",
                  outlineOffset: "2px",
                },
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
                p: 3,
                display: "flex",
                flexDirection: "column",
                minHeight: "300px",
                // Frosted glass effect - use !important to override theme defaults
                backdropFilter: "blur(12px) !important",
                backgroundColor: "rgba(35, 41, 70, 0.4) !important",
                backgroundImage: "none !important", // Override theme gradient
                border: "1px solid rgba(95, 39, 221, 0.5) !important",
                boxShadow: "0 0 24px -4px rgba(95, 39, 221, 0.3) !important",
                color: "#ffffff",
                transition: prefersReducedMotion
                  ? "none"
                  : "all 0.3s ease-in-out",
                "&:hover": {
                  border: "1px solid rgba(95, 39, 221, 0.7) !important",
                  boxShadow: "0 0 32px -2px rgba(95, 39, 221, 0.4) !important",
                },
                "&:focus-within": {
                  outline: "2px solid rgba(8, 247, 254, 0.8)",
                  outlineOffset: "2px",
                },
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
        </Grid>
      </Container>
    </>
  );
};

export default Event;
