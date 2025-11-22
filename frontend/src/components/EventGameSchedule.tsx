import * as React from "react";
import { useEffect, useState, useContext } from "react";
import { useParams, useLocation } from "react-router-dom";
import { Calendar, momentLocalizer, View } from "react-big-calendar";
import moment from "moment";
import "react-big-calendar/lib/css/react-big-calendar.css";
import {
  Box,
  Typography,
  Paper,
  Skeleton,
  Container,
  styled,
  alpha,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { UserContext, UserDispatchContext } from "../UserProvider";
import { dateParser } from "../utils";
import {
  GameScheduleEntry,
  CalendarEvent,
  toCalendarEvents,
} from "../types/game_schedule";
import { EventData } from "../types/events";

const localizer = momentLocalizer(moment);

// Styled calendar wrapper to apply MUI theme
const StyledCalendarWrapper = styled(Box)(({ theme }) => ({
  "& .rbc-calendar": {
    fontFamily: theme.typography.fontFamily,
    color: theme.palette.text.primary,
    backgroundColor: "transparent",
  },
  "& .rbc-header": {
    padding: theme.spacing(1),
    fontWeight: theme.typography.h6.fontWeight,
    color: theme.palette.text.secondary,
    borderBottom: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
    backgroundColor: "transparent",
  },
  "& .rbc-time-view": {
    border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
    backgroundColor: "transparent",
  },
  "& .rbc-time-header-content": {
    borderLeft: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
  },
  "& .rbc-time-content": {
    borderTop: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
  },
  "& .rbc-time-slot": {
    borderTop: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
  },
  "& .rbc-timeslot-group": {
    borderLeft: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
    minHeight: "60px",
  },
  "& .rbc-day-slot": {
    "& .rbc-time-slot": {
      borderTop: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
    },
  },
  "& .rbc-current-time-indicator": {
    backgroundColor: theme.palette.secondary.main,
    height: "2px",
  },
  "& .rbc-today": {
    backgroundColor: alpha(theme.palette.primary.main, 0.05),
  },
  // Event styling - pinned games
  "& .rbc-event": {
    backgroundColor: alpha(theme.palette.primary.main, 0.8),
    borderLeft: `3px solid ${theme.palette.primary.light}`,
    color: theme.palette.primary.contrastText,
    borderRadius: theme.shape.borderRadius,
    padding: theme.spacing(0.5),
    fontSize: "0.875rem",
    fontWeight: theme.typography.fontWeightMedium,
    boxShadow: `0px 2px 8px ${alpha(theme.palette.primary.main, 0.3)}`,
    "&:hover": {
      backgroundColor: alpha(theme.palette.primary.main, 0.9),
      boxShadow: `0px 4px 12px ${alpha(theme.palette.primary.main, 0.5)}`,
    },
  },
  // Suggested games (will be styled differently in Slice 3)
  "& .rbc-event.suggested": {
    opacity: 0.5,
    backgroundColor: alpha(theme.palette.info.main, 0.6),
    borderLeft: `3px dashed ${theme.palette.info.light}`,
  },
  "& .rbc-event-label": {
    fontSize: "0.75rem",
  },
  "& .rbc-event-content": {
    whiteSpace: "normal",
    wordBreak: "break-word",
  },
  "& .rbc-toolbar": {
    padding: theme.spacing(2),
    marginBottom: theme.spacing(2),
    "& button": {
      color: theme.palette.text.primary,
      border: `1px solid ${alpha(theme.palette.primary.main, 0.3)}`,
      borderRadius: theme.shape.borderRadius,
      padding: theme.spacing(0.75, 1.5),
      margin: theme.spacing(0, 0.5),
      backgroundColor: alpha(theme.palette.background.paper, 0.6),
      fontWeight: theme.typography.fontWeightMedium,
      transition: "all 0.3s ease",
      "&:hover": {
        backgroundColor: alpha(theme.palette.primary.main, 0.2),
        borderColor: theme.palette.primary.main,
      },
      "&:active, &.rbc-active": {
        backgroundColor: alpha(theme.palette.primary.main, 0.4),
        borderColor: theme.palette.primary.main,
        color: theme.palette.primary.contrastText,
      },
    },
  },
  "& .rbc-toolbar-label": {
    fontWeight: theme.typography.h6.fontWeight,
    fontSize: "1.25rem",
    color: theme.palette.text.secondary,
  },
  // Agenda view styling
  "& .rbc-agenda-view": {
    "& table": {
      borderColor: alpha(theme.palette.primary.main, 0.2),
    },
    "& .rbc-agenda-date-cell, & .rbc-agenda-time-cell": {
      padding: theme.spacing(1),
      fontWeight: theme.typography.fontWeightMedium,
    },
    "& .rbc-agenda-event-cell": {
      padding: theme.spacing(1),
    },
  },
}));

export default function EventGameSchedule() {
  const { id } = useParams<{ id: string }>();
  const { signOut } = useContext(UserDispatchContext);
  const userDetails = useContext(UserContext);
  const token = userDetails?.token;
  const theme = useTheme();

  // Event state
  const [eventData, setEventData] = useState<EventData | null>(null);
  const [eventLoading, setEventLoading] = useState(true);

  // Schedule state
  const [schedule, setSchedule] = useState<GameScheduleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("day");

  // Fetch event data
  useEffect(() => {
    if (!id || !token) return;

    setEventLoading(true);
    fetch(`/api/events/${id}`, {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: "Bearer " + token,
      },
    })
      .then((response) => {
        if (response.status === 401) signOut();
        if (!response.ok) {
          setEventLoading(false);
          return;
        }
        return response.json();
      })
      .then((data) => {
        if (data) {
          // Parse dates using JSON.parse with dateParser
          const timeBegin = dateParser("timeBegin", data.timeBegin);
          const timeEnd = dateParser("timeEnd", data.timeEnd);
          const parsedEvent: EventData = {
            ...data,
            timeBegin,
            timeEnd,
          };
          setEventData(parsedEvent);
        }
        setEventLoading(false);
      })
      .catch((error) => {
        console.error("Error fetching event:", error);
        setEventLoading(false);
      });
  }, [id, token, signOut]);

  // Fetch schedule data
  useEffect(() => {
    if (!eventData || !token) return;

    setLoading(true);
    fetch(`/api/events/${eventData.id}/game_schedule`, {
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
            .then(
              (data) =>
                JSON.parse(data, dateParser) as Array<GameScheduleEntry>,
            );
      })
      .then((data) => {
        if (data) {
          setSchedule(data);
        }
        setLoading(false);
      })
      .catch((error) => {
        console.error("Error fetching game schedule:", error);
        setLoading(false);
      });
  }, [eventData?.id, token, signOut]);

  // Show loading state while event data is being fetched
  if (eventLoading || !eventData) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Skeleton variant="rectangular" height={600} />
      </Container>
    );
  }

  // Calculate min and max times for the calendar based on event duration
  const minTime = eventData.timeBegin.toDate();
  const maxTime = eventData.timeEnd.toDate();

  // Convert schedule entries to calendar events
  const events: CalendarEvent[] = toCalendarEvents(schedule);

  // Custom event styling based on pinned/suggested status
  const eventStyleGetter = (event: CalendarEvent) => {
    const entry = event.resource;
    return {
      className: entry.isSuggested ? "suggested" : "",
    };
  };

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Skeleton variant="rectangular" height={600} />
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Paper sx={{ p: 3 }}>
        <Typography variant="h4" gutterBottom>
          Game Schedule
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
          View the schedule of games for this event
        </Typography>

        {schedule.length === 0 ? (
          <Box
            sx={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              minHeight: "400px",
            }}
          >
            <Typography variant="body1" color="text.secondary">
              No games scheduled yet. Admins can add games to the schedule.
            </Typography>
          </Box>
        ) : (
          <StyledCalendarWrapper>
            <Calendar
              localizer={localizer}
              events={events}
              startAccessor="start"
              endAccessor="end"
              style={{ height: 600 }}
              view={view}
              onView={(newView) => setView(newView)}
              views={["day", "agenda"]}
              min={minTime}
              max={maxTime}
              defaultDate={eventData.timeBegin.toDate()}
              step={30} // 30-minute intervals
              timeslots={2} // Show :00 and :30
              eventPropGetter={eventStyleGetter}
              tooltipAccessor={(event: CalendarEvent) =>
                `${event.title} - ${event.resource.durationMinutes} minutes`
              }
            />
          </StyledCalendarWrapper>
        )}
      </Paper>
    </Container>
  );
}
