import * as React from "react";
import { useEffect, useState, useContext } from "react";
import moment from "moment";
import {
  Typography,
  Avatar,
  Paper,
  Box,
  Slide,
  Chip,
  CircularProgress,
  IconButton,
} from "@mui/material";
import {
  Celebration,
  HowToReg,
  SportsEsports,
  ThumbUp,
  EventSeat,
  Pause,
  PlayArrow,
} from "@mui/icons-material";
import { UserContext, UserDispatchContext } from "../UserProvider";

interface ActivityTickerEvent {
  id: number;
  timestamp: string;
  message: string;
  icon: string;
  eventType: string;
  userHandle?: string;
  userAvatarUrl?: string;
  gameId?: number;
}

interface ActivityTickerProps {
  event_id: number;
  responded: number;
}

export default function ActivityTicker(props: ActivityTickerProps) {
  const { signOut } = useContext(UserDispatchContext);
  const userDetails = useContext(UserContext);
  const token = userDetails?.token;

  const [activeEvents, setActiveEvents] = useState<ActivityTickerEvent[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [progress, setProgress] = useState(0);

  const activeEventsRef = React.useRef<ActivityTickerEvent[]>([]);
  const nextEventsRef = React.useRef<ActivityTickerEvent[]>([]);

  useEffect(() => {
    activeEventsRef.current = activeEvents;
  }, [activeEvents]);

  const fetchTickerEvents = () => {
    fetch(`/api/events/${props.event_id}/activity-ticker`, {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: "Bearer " + token,
      },
    })
      .then((response) => {
        if (response.status === 401) signOut();
        else if (response.ok) return response.json();
      })
      .then((data) => {
        if (data && data.events && data.events.length > 0) {
          if (activeEventsRef.current.length === 0) {
            setActiveEvents(data.events);
          } else {
            nextEventsRef.current = data.events;
          }
        }
      })
      .catch((error) => {
        console.error("Error fetching activity ticker:", error);
      });
  };

  useEffect(() => {
    if (!props.responded) {
      return;
    }

    // Initial fetch
    fetchTickerEvents();

    // Poll every 30 seconds
    const interval = setInterval(fetchTickerEvents, 30000);

    return () => clearInterval(interval);
  }, [props.event_id, props.responded]);

  useEffect(() => {
    if (activeEvents.length > 0 && visible) {
      if (isPaused || isHovered) {
        return;
      }

      const step = 100;
      const duration = 8000;
      const increment = (step / duration) * 100;

      const timer = setInterval(() => {
        setProgress((prev) => {
          const next = prev + increment;
          if (next >= 100) {
            setVisible(false);
            return 0;
          }
          return next;
        });
      }, step);

      return () => clearInterval(timer);
    }
  }, [activeEvents.length, visible, currentIndex, isPaused, isHovered]);

  const handleExited = () => {
    setProgress(0);
    let nextIndex = currentIndex + 1;
    if (nextIndex >= activeEvents.length) {
      if (nextEventsRef.current.length > 0) {
        setActiveEvents(nextEventsRef.current);
        nextEventsRef.current = [];
        nextIndex = 0;
      } else {
        nextIndex = 0;
      }
    }
    setCurrentIndex(nextIndex);
    setVisible(true);
  };

  if (!props.responded || activeEvents.length === 0) {
    return null;
  }

  const event = activeEvents[currentIndex];

  const getIcon = (type: string) => {
    switch (type) {
      case "event_create":
        return <Celebration sx={{ fontSize: 40, color: "#60a5fa" }} />;
      case "rsvp":
        return <HowToReg sx={{ fontSize: 40, color: "#4ade80" }} />;
      case "game_suggestion":
        return <SportsEsports sx={{ fontSize: 40, color: "#f472b6" }} />;
      case "game_vote":
        return <ThumbUp sx={{ fontSize: 40, color: "#fbbf24" }} />;
      case "seat_reservation":
        return <EventSeat sx={{ fontSize: 40, color: "#a78bfa" }} />;
      default:
        return <Celebration sx={{ fontSize: 40, color: "#60a5fa" }} />;
    }
  };

  return (
    <Box
      sx={{
        position: "fixed",
        bottom: 0,
        left: { sm: "240px", xs: 0 },
        right: 0,
        zIndex: 1300,
        pointerEvents: "none",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <Paper
        elevation={6}
        sx={{
          pointerEvents: "auto",
          background: event.gameId
            ? `linear-gradient(to right, rgba(15, 23, 42, 0.98), rgba(15, 23, 42, 0.9)), url(https://steamcdn-a.akamaihd.net/steam/apps/${event.gameId}/page_bg_generated.jpg)`
            : "rgba(15, 23, 42, 0.95)",
          backgroundSize: "cover",
          backgroundPosition: "center",
          backdropFilter: "blur(12px)",
          borderTop: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          px: 3,
          py: 1.5,
          width: "100%",
          minHeight: "72px",
          boxShadow: "0 -4px 32px rgba(0, 0, 0, 0.4)",
          overflow: "hidden",
          transition: "background 0.5s ease-in-out",
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <Slide
          direction="up"
          in={visible}
          onExited={handleExited}
          mountOnEnter
          unmountOnExit
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 2,
              width: "100%",
              maxWidth: "1200px",
            }}
          >
            {/* Big Icon */}
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: 60,
              }}
            >
              {getIcon(event.eventType)}
            </Box>

            {/* Content */}
            <Box sx={{ display: "flex", flexDirection: "column", flexGrow: 1 }}>
              <Typography
                variant="caption"
                sx={{
                  color: "#94a3b8",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  lineHeight: 1,
                  mb: 0.5,
                }}
              >
                {event.eventType.replace(/_/g, " ")}
              </Typography>
              <Typography
                sx={{
                  color: "#f8fafc",
                  fontWeight: 600,
                  fontSize: "1rem",
                  lineHeight: 1.2,
                }}
              >
                {event.message}
              </Typography>
            </Box>

            {/* User Avatar */}
            {event.userAvatarUrl ? (
              <Avatar
                alt={event.userHandle || "User"}
                src={event.userAvatarUrl}
                sx={{ width: 32, height: 32, border: "2px solid #334155" }}
              />
            ) : (
              <Avatar
                sx={{
                  width: 32,
                  height: 32,
                  bgcolor: "#334155",
                  fontSize: "0.8rem",
                }}
              >
                {event.userHandle?.charAt(0) || "?"}
              </Avatar>
            )}

            <Chip
              label={moment(event.timestamp).fromNow()}
              size="small"
              sx={{
                backgroundColor: "rgba(255, 255, 255, 0.1)",
                color: "#cbd5e1",
                fontWeight: 500,
                fontSize: "0.75rem",
                height: 24,
              }}
            />

            <Box sx={{ position: "relative", display: "inline-flex", ml: 1 }}>
              <CircularProgress
                variant="determinate"
                value={progress}
                size={28}
                thickness={5}
                sx={{
                  color: isPaused
                    ? "#ef4444"
                    : isHovered
                      ? "#f59e0b"
                      : "#3b82f6",
                  transition: "color 0.3s ease",
                }}
              />
              <Box
                sx={{
                  top: 0,
                  left: 0,
                  bottom: 0,
                  right: 0,
                  position: "absolute",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <IconButton
                  size="small"
                  onClick={() => setIsPaused(!isPaused)}
                  sx={{
                    padding: 0,
                    minWidth: 0,
                    color: "#fff",
                    "&:hover": {
                      backgroundColor: "rgba(255,255,255,0.1)",
                    },
                  }}
                >
                  {isPaused ? (
                    <PlayArrow sx={{ fontSize: 16 }} />
                  ) : (
                    <Pause sx={{ fontSize: 16 }} />
                  )}
                </IconButton>
              </Box>
            </Box>
          </Box>
        </Slide>
      </Paper>
    </Box>
  );
}
