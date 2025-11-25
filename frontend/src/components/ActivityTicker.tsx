import * as React from "react";
import { useEffect, useState, useContext } from "react";
import moment from "moment";
import {
  Typography,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Avatar,
  Paper,
  Skeleton,
  Grid,
  Fade,
} from "@mui/material";
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

export default function ActivityTicker(props: ActivityTickerProps) {
  const { signOut } = useContext(UserDispatchContext);
  const userDetails = useContext(UserContext);
  const token = userDetails?.token;

  const [events, setEvents] = useState<ActivityTickerEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [fadeIn, setFadeIn] = useState(false);

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
          setFadeIn(true);
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

  if (!props.responded) {
    return null;
  }

  return (
    <Grid container spacing={2}>
      <Grid size={12}>
        <Typography component="h3" variant="h6" color="primary" gutterBottom>
          Recent Activity
        </Typography>
      </Grid>
      {loading ? (
        <Grid size={12}>
          <Paper elevation={1} sx={{ p: 2 }}>
            {Array.from(Array(3)).map((_, i) => (
              <Skeleton key={i} variant="text" height={60} animation="wave" />
            ))}
          </Paper>
        </Grid>
      ) : events.length === 0 ? (
        <Grid size={12}>
          <Paper elevation={1} sx={{ p: 2 }}>
            <Typography variant="body2" color="text.secondary">
              No recent activity yet. Be the first to suggest a game or update
              your RSVP!
            </Typography>
          </Paper>
        </Grid>
      ) : (
        <Grid size={12}>
          <Paper
            elevation={1}
            sx={{ maxHeight: 400, overflow: "auto" }}
            aria-label="Recent activity feed"
          >
            <List>
              {events.map((event, index) => (
                <Fade in={fadeIn} timeout={300 + index * 100} key={event.id}>
                  <ListItem dense={true}>
                    <ListItemAvatar>
                      {event.userAvatarUrl ? (
                        <Avatar
                          alt={event.userHandle || "User"}
                          src={event.userAvatarUrl}
                        />
                      ) : (
                        <Avatar>{event.icon}</Avatar>
                      )}
                    </ListItemAvatar>
                    <ListItemText
                      primary={event.message}
                      secondary={moment(event.timestamp).fromNow()}
                    />
                  </ListItem>
                </Fade>
              ))}
            </List>
          </Paper>
        </Grid>
      )}
    </Grid>
  );
}
