import * as React from "react";
import { useEffect, useState, useContext, useRef } from "react";
import moment from "moment";
import {
  Typography,
  Avatar,
  Paper,
  Box,
  Skeleton,
  Grid,
  Chip,
} from "@mui/material";
import { keyframes } from "@mui/system";
import { UserContext, UserDispatchContext } from "../UserProvider";

interface ActivityTickerEvent {
  id: number;
  timestamp: string;
  message: string;
  icon: string;
  eventType: string;
  userHandle?: string;
  userAvatarUrl?: string;
}

interface ActivityTickerProps {
  event_id: number;
  responded: number;
}

// Define scrolling animation
const scroll = keyframes`
  0% {
    transform: translateX(0);
  }
  100% {
    transform: translateX(-50%);
  }
`;

export default function ActivityTicker(props: ActivityTickerProps) {
  const { signOut } = useContext(UserDispatchContext);
  const userDetails = useContext(UserContext);
  const token = userDetails?.token;

  const [events, setEvents] = useState<ActivityTickerEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);

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
        if (data && data.events) {
          setEvents(data.events);
          setLoading(false);
        }
      })
      .catch((error) => {
        console.error("Error fetching activity ticker:", error);
        setLoading(false);
      });
  };

  useEffect(() => {
    if (!props.responded) {
      setLoading(false);
      return;
    }

    // Initial fetch
    fetchTickerEvents();

    // Poll every 30 seconds
    const interval = setInterval(fetchTickerEvents, 30000);

    return () => clearInterval(interval);
  }, [props.event_id, props.responded]);

  // Cycle through events every 5 seconds
  useEffect(() => {
    if (events.length > 0) {
      const cycleInterval = setInterval(() => {
        setCurrentIndex((prev) => (prev + 1) % events.length);
      }, 5000);
      return () => clearInterval(cycleInterval);
    }
  }, [events.length]);

  if (!props.responded) {
    return null;
  }

  if (loading) {
    return (
      <Grid container spacing={2}>
        <Grid size={12}>
          <Paper
            elevation={2}
            sx={{
              p: 1.5,
              background: "linear-gradient(90deg, #1e3a8a 0%, #1e40af 100%)",
              borderLeft: "4px solid #3b82f6",
            }}
          >
            <Skeleton variant="text" width="60%" height={30} />
          </Paper>
        </Grid>
      </Grid>
    );
  }

  if (events.length === 0) {
    return (
      <Grid container spacing={2}>
        <Grid size={12}>
          <Paper
            elevation={2}
            sx={{
              p: 1.5,
              background: "linear-gradient(90deg, #1e3a8a 0%, #1e40af 100%)",
              borderLeft: "4px solid #3b82f6",
            }}
          >
            <Typography
              variant="body2"
              sx={{
                color: "#fff",
                fontWeight: 600,
                textAlign: "center",
              }}
            >
              📢 No recent activity yet. Be the first to suggest a game or
              update your RSVP!
            </Typography>
          </Paper>
        </Grid>
      </Grid>
    );
  }

  // Create duplicated events for seamless scrolling
  const duplicatedEvents = [...events, ...events];

  return (
    <Grid container spacing={2}>
      <Grid size={12}>
        <Paper
          elevation={2}
          sx={{
            background: "linear-gradient(90deg, #1e3a8a 0%, #1e40af 100%)",
            borderLeft: "4px solid #3b82f6",
            overflow: "hidden",
            position: "relative",
          }}
          aria-label="Recent activity news ticker"
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              animation: `${scroll} ${events.length * 8}s linear infinite`,
              "&:hover": {
                animationPlayState: "paused",
              },
            }}
          >
            {duplicatedEvents.map((event, index) => (
              <Box
                key={`${event.id}-${index}`}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                  px: 3,
                  py: 1.5,
                  minWidth: "fit-content",
                  whiteSpace: "nowrap",
                }}
              >
                {event.userAvatarUrl ? (
                  <Avatar
                    alt={event.userHandle || "User"}
                    src={event.userAvatarUrl}
                    sx={{ width: 28, height: 28 }}
                  />
                ) : (
                  <Typography sx={{ fontSize: "1.5rem" }}>
                    {event.icon}
                  </Typography>
                )}
                <Typography
                  sx={{
                    color: "#fff",
                    fontWeight: 500,
                    fontSize: "0.95rem",
                  }}
                >
                  {event.message}
                </Typography>
                <Chip
                  label={moment(event.timestamp).fromNow()}
                  size="small"
                  sx={{
                    backgroundColor: "rgba(255, 255, 255, 0.2)",
                    color: "#fff",
                    fontWeight: 500,
                    fontSize: "0.75rem",
                  }}
                />
                <Typography
                  sx={{ color: "rgba(255, 255, 255, 0.4)", px: 2 }}
                >
                  •
                </Typography>
              </Box>
            ))}
          </Box>
        </Paper>
      </Grid>
    </Grid>
  );
}
