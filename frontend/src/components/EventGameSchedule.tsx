import * as React from "react";
import { useEffect, useState, useContext, useCallback } from "react";
import { useParams } from "react-router-dom";
import { Calendar, momentLocalizer, View, Navigate } from "react-big-calendar";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";
import TimeGrid from "react-big-calendar/lib/TimeGrid";
import { useSnackbar } from "notistack";
import moment from "moment";
import "moment/locale/en-gb"; // British English locale
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";
import {
  Box,
  Typography,
  Paper,
  Skeleton,
  Container,
  styled,
  alpha,
  Fab,
  Drawer,
  List,
  ListItemButton,
  Divider,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Switch,
  FormControlLabel,
} from "@mui/material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { TimePicker } from "@mui/x-date-pickers/TimePicker";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterMoment } from "@mui/x-date-pickers/AdapterMoment";
import {
  Add as AddIcon,
  SportsEsports as GameIcon,
  Close as CloseIcon,
  Refresh as RefreshIcon,
} from "@mui/icons-material";
import { useTheme } from "@mui/material/styles";
import { UserContext, UserDispatchContext } from "../UserProvider";
import { dateParser } from "../utils";
import {
  GameScheduleEntry,
  CalendarEvent,
  toCalendarEvents,
} from "../types/game_schedule";
import { EventData } from "../types/events";
import { GameSuggestion } from "../types/game_suggestions";

// Set moment to use British locale
moment.locale("en-gb");

const localizer = momentLocalizer(moment);
// Type the DragAndDropCalendar with our CalendarEvent type
const DragAndDropCalendar = withDragAndDrop<CalendarEvent, object>(Calendar);

// Clickable game suggestion item
interface GameSuggestionItemProps {
  game: GameSuggestion;
  onClick: (game: GameSuggestion) => void;
}

const GameSuggestionItem: React.FC<GameSuggestionItemProps> = ({
  game,
  onClick,
}) => {
  return (
    <ListItemButton
      onClick={() => onClick(game)}
      sx={{
        p: 1.5,
        borderRadius: 1,
        border: "1px solid",
        borderColor: "divider",
        mb: 1,
        "&:hover": {
          borderColor: "primary.main",
        },
        display: "flex",
        alignItems: "center",
        gap: 1.5,
      }}
    >
      <GameIcon fontSize="small" color="primary" />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" noWrap>
          {game.name}
        </Typography>
        {game.votes > 0 && (
          <Chip
            label={`${game.votes} vote${game.votes !== 1 ? "s" : ""}`}
            size="small"
            color="primary"
            sx={{ mt: 0.5, height: 20, fontSize: "0.7rem" }}
          />
        )}
      </Box>
    </ListItemButton>
  );
};

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
    borderLeft: `3px solid ${theme.palette.primary.light}`,
    color: theme.palette.primary.contrastText,
    borderRadius: theme.shape.borderRadius,
    padding: theme.spacing(0.5),
    fontSize: "0.875rem",
    fontWeight: theme.typography.fontWeightMedium,
    boxShadow: `0px 2px 8px ${alpha(theme.palette.primary.main, 0.3)}`,
    overflow: "hidden", // Ensure background image stays within border radius
    "&:hover": {
      boxShadow: `0px 4px 12px ${alpha(theme.palette.primary.main, 0.5)}`,
    },
  },
  // Suggested games - visually distinct from pinned games
  "& .rbc-event.suggested": {
    opacity: 0.7,
    borderLeft: `3px dashed ${theme.palette.grey[400]}`,
    "&:hover": {
      opacity: 0.85,
    },
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

// Custom event component with delete button
interface CustomEventProps {
  event: CalendarEvent;
  isAdmin: boolean;
  onDelete: (scheduleId: number) => void;
}

const CustomEvent: React.FC<CustomEventProps> = ({
  event,
  isAdmin,
  onDelete,
}) => {
  const [showDelete, setShowDelete] = useState(false);

  return (
    <Box
      onMouseEnter={() => setShowDelete(true)}
      onMouseLeave={() => setShowDelete(false)}
      sx={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        height: "100%",
        px: 0.5,
      }}
    >
      <Typography
        variant="caption"
        noWrap
        sx={{
          flex: 1,
          fontWeight: 600,
        }}
      >
        {event.title}
      </Typography>
      {isAdmin && showDelete && (
        <IconButton
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(event.resource.id);
          }}
          sx={{
            p: 0.25,
            ml: 0.5,
            bgcolor: "error.main",
            color: "white",
            "&:hover": {
              bgcolor: "error.dark",
            },
          }}
        >
          <CloseIcon sx={{ fontSize: 14 }} />
        </IconButton>
      )}
    </Box>
  );
};

// Type definition for React Big Calendar toolbar props
interface ToolbarProps {
  label: string;
}

// Custom toolbar that shows only the label (no navigation or view buttons)
const CustomToolbar: React.FC<ToolbarProps> = ({ label }) => {
  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        mb: 2,
        p: 1,
      }}
    >
      <Typography variant="h6">{label}</Typography>
    </Box>
  );
};

export default function EventGameSchedule() {
  const { id } = useParams<{ id: string }>();
  const { signOut } = useContext(UserDispatchContext);
  const userDetails = useContext(UserContext);
  const token = userDetails?.token;
  const isAdmin = userDetails?.isAdmin || false;
  const theme = useTheme();
  const { enqueueSnackbar } = useSnackbar();

  // Event state
  const [eventData, setEventData] = useState<EventData | null>(null);
  const [eventLoading, setEventLoading] = useState(true);

  // Custom EventWeek view factory - creates view with eventData in closure
  const createEventWeekView = useCallback(() => {
    // Create a custom week class that defines the range
    class CustomEventWeek extends React.Component<{ localizer: unknown }> {
      static range(
        date: Date,
        {
          localizer,
        }: {
          localizer: {
            startOf: (date: Date, unit: string) => Date;
            endOf: (date: Date, unit: string) => Date;
          };
        },
      ) {
        if (!eventData) {
          // Fallback to default week behavior
          const start = localizer.startOf(date, "week");
          const end = localizer.endOf(date, "week");
          return localizer.range(start, end);
        }

        // Use event's timeBegin and timeEnd to determine range
        const start = moment(eventData.timeBegin).startOf("day").toDate();
        const end = moment(eventData.timeEnd).startOf("day").toDate();
        return localizer.range(start, end);
      }

      static navigate(date: Date, action: Navigate) {
        // Don't allow navigation outside event bounds
        if (!eventData) {
          return date;
        }

        const eventStart = moment(eventData.timeBegin).startOf("day");
        // eventEnd is calculated but not used in this function
        const _eventEnd = moment(eventData.timeEnd).startOf("day");

        switch (action) {
          case Navigate.PREVIOUS:
            return eventStart.toDate();
          case Navigate.NEXT:
            return eventStart.toDate();
          default:
            return date;
        }
      }

      static title(
        date: Date,
        {
          localizer,
        }: { localizer: { format: (date: Date, format: string) => string } },
      ) {
        if (!eventData) {
          return localizer.format(date, "MMMM YYYY");
        }
        const start = moment(eventData.timeBegin);
        const end = moment(eventData.timeEnd);
        return `${start.format("MMM D")} - ${end.format("MMM D, YYYY")}`;
      }

      render() {
        const { date, localizer, ...props } = this.props;
        const range = CustomEventWeek.range(date, { localizer });

        return (
          <TimeGrid
            {...props}
            range={range}
            eventOffset={15}
            localizer={localizer}
          />
        );
      }
    }

    return CustomEventWeek;
  }, [eventData]);

  // Schedule state
  const [schedule, setSchedule] = useState<GameScheduleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("week");
  const [currentDate, setCurrentDate] = useState<Date>(new Date());

  // Ref for calendar container to handle manual scrolling
  const calendarRef = React.useRef<HTMLDivElement>(null);

  // Game suggestions state
  const [gameSuggestions, setGameSuggestions] = useState<GameSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);

  // Show/hide suggested games toggle
  const [showSuggestions, setShowSuggestions] = useState<boolean>(true);

  // Add game dialog state
  const [addGameDialogOpen, setAddGameDialogOpen] = useState(false);
  const [selectedGame, setSelectedGame] = useState<GameSuggestion | null>(null);
  const [selectedDateTime, setSelectedDateTime] =
    useState<moment.Moment | null>(null);
  const [duration, setDuration] = useState<number>(120);

  // Pin suggestion dialog state
  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [gameToPin, setGameToPin] = useState<CalendarEvent | null>(null);

  // Refresh function to reload schedule
  const refreshSchedule = useCallback(() => {
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
  }, [eventData, token, signOut]);

  // Handle event drop (drag to new time)
  const handleEventDrop = useCallback(
    async ({
      event,
      start,
      end,
    }: {
      event: CalendarEvent;
      start: string | Date;
      end: string | Date;
    }) => {
      if (!isAdmin || !token || !eventData) return;

      const scheduleEntry = event.resource;
      const startDate = start instanceof Date ? start : new Date(start);
      const endDate = end instanceof Date ? end : new Date(end);
      const durationMinutes = Math.round(
        (endDate.getTime() - startDate.getTime()) / 60000,
      );

      // Check if the game would end beyond the event end time
      const startMoment = moment(startDate);
      const endMoment = moment(endDate);

      if (endMoment.isAfter(eventData.timeEnd)) {
        enqueueSnackbar(
          `Cannot move game: it would end at ${endMoment.format(
            "DD/MM/YYYY HH:mm",
          )} which is after the event ends`,
          { variant: "error" },
        );
        refreshSchedule(); // Refresh to reset the visual position
        return;
      }

      if (startMoment.isBefore(eventData.timeBegin)) {
        enqueueSnackbar(
          `Cannot move game: it would start before the event begins`,
          { variant: "error" },
        );
        refreshSchedule(); // Refresh to reset the visual position
        return;
      }

      try {
        const response = await fetch(
          `/api/events/${eventData.id}/game_schedule/${scheduleEntry.id}?as_admin=true`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              Authorization: "Bearer " + token,
            },
            body: JSON.stringify({
              gameId: scheduleEntry.gameId,
              startTime: startDate.toISOString(),
              durationMinutes,
            }),
          },
        );

        if (response.status === 401) {
          signOut();
          return;
        }

        if (!response.ok) {
          const errorText = await response.text();
          console.error("Failed to update schedule:", errorText);
          if (errorText.toLowerCase().includes("overlap")) {
            enqueueSnackbar(
              "Cannot move game: it would overlap with another scheduled game",
              {
                variant: "error",
              },
            );
          } else {
            enqueueSnackbar("Failed to update game schedule", {
              variant: "error",
            });
          }
          return;
        }

        // Refresh schedule after successful update
        refreshSchedule();
        enqueueSnackbar("Game schedule updated successfully", {
          variant: "success",
        });
      } catch (error) {
        console.error("Error updating game schedule:", error);
        enqueueSnackbar("An error occurred while updating the schedule", {
          variant: "error",
        });
      }
    },
    [isAdmin, token, eventData, signOut, refreshSchedule, enqueueSnackbar],
  );

  // Handle event resize
  const handleEventResize = useCallback(
    async ({
      event,
      start,
      end,
    }: {
      event: CalendarEvent;
      start: string | Date;
      end: string | Date;
    }) => {
      if (!isAdmin || !token || !eventData) return;

      const scheduleEntry = event.resource;
      const startDate = start instanceof Date ? start : new Date(start);
      const endDate = end instanceof Date ? end : new Date(end);
      const durationMinutes = Math.round(
        (endDate.getTime() - startDate.getTime()) / 60000,
      );

      // Check if the game would end beyond the event end time
      const startMoment = moment(startDate);
      const endMoment = moment(endDate);

      if (endMoment.isAfter(eventData.timeEnd)) {
        enqueueSnackbar(
          `Cannot resize game: it would end at ${endMoment.format(
            "DD/MM/YYYY HH:mm",
          )} which is after the event ends`,
          { variant: "error" },
        );
        refreshSchedule(); // Refresh to reset the visual size
        return;
      }

      if (startMoment.isBefore(eventData.timeBegin)) {
        enqueueSnackbar(
          `Cannot resize game: it would start before the event begins`,
          { variant: "error" },
        );
        refreshSchedule(); // Refresh to reset the visual size
        return;
      }

      try {
        const response = await fetch(
          `/api/events/${eventData.id}/game_schedule/${scheduleEntry.id}?as_admin=true`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              Authorization: "Bearer " + token,
            },
            body: JSON.stringify({
              gameId: scheduleEntry.gameId,
              startTime: startDate.toISOString(),
              durationMinutes,
            }),
          },
        );

        if (response.status === 401) {
          signOut();
          return;
        }

        if (!response.ok) {
          const errorText = await response.text();
          console.error("Failed to resize schedule:", errorText);
          if (errorText.toLowerCase().includes("overlap")) {
            enqueueSnackbar(
              "Cannot resize game: it would overlap with another scheduled game",
              {
                variant: "error",
              },
            );
          } else {
            enqueueSnackbar("Failed to resize game schedule", {
              variant: "error",
            });
          }
          return;
        }

        // Refresh schedule after successful update
        refreshSchedule();
        enqueueSnackbar("Game duration updated successfully", {
          variant: "success",
        });
      } catch (error) {
        console.error("Error resizing game schedule:", error);
        enqueueSnackbar("An error occurred while resizing the schedule", {
          variant: "error",
        });
      }
    },
    [isAdmin, token, eventData, signOut, refreshSchedule, enqueueSnackbar],
  );

  // Handle clicking on a game suggestion
  const handleGameClick = useCallback(
    (game: GameSuggestion) => {
      setSelectedGame(game);
      // Set default datetime to event start date at 18:00
      if (eventData) {
        const defaultDateTime = eventData.timeBegin
          .clone()
          .hours(18)
          .minutes(0);
        setSelectedDateTime(defaultDateTime);
      }
      setAddGameDialogOpen(true);
    },
    [eventData],
  );

  // Handle adding a game from the dialog
  const handleAddGame = useCallback(async () => {
    if (!isAdmin || !token || !eventData || !selectedGame || !selectedDateTime)
      return;

    // Check if the game would end beyond the event end time
    const gameEndTime = selectedDateTime.clone().add(duration, "minutes");
    if (gameEndTime.isAfter(eventData.timeEnd)) {
      enqueueSnackbar(
        `Cannot add game: it would end at ${gameEndTime.format(
          "DD/MM/YYYY HH:mm",
        )} which is after the event ends at ${eventData.timeEnd.format(
          "DD/MM/YYYY HH:mm",
        )}`,
        { variant: "error" },
      );
      return;
    }

    // Check if the game would start before the event start time
    if (selectedDateTime.isBefore(eventData.timeBegin)) {
      enqueueSnackbar(
        `Cannot add game: it would start before the event begins at ${eventData.timeBegin.format(
          "DD/MM/YYYY HH:mm",
        )}`,
        { variant: "error" },
      );
      return;
    }

    try {
      const response = await fetch(
        `/api/events/${eventData.id}/game_schedule?as_admin=true`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: "Bearer " + token,
          },
          body: JSON.stringify({
            gameId: selectedGame.appid,
            startTime: selectedDateTime.toISOString(),
            durationMinutes: duration,
          }),
        },
      );

      if (response.status === 401) {
        signOut();
        return;
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Failed to create schedule:", errorText);
        if (errorText.toLowerCase().includes("overlap")) {
          enqueueSnackbar(
            "Cannot add game: it would overlap with another scheduled game",
            {
              variant: "error",
            },
          );
        } else {
          enqueueSnackbar("Failed to add game to schedule", {
            variant: "error",
          });
        }
        return;
      }

      // Refresh schedule after successful creation
      refreshSchedule();
      setAddGameDialogOpen(false);
      setFabOpen(false);
      enqueueSnackbar(`${selectedGame.name} added to schedule successfully`, {
        variant: "success",
      });
    } catch (error) {
      console.error("Error creating game schedule:", error);
      enqueueSnackbar("An error occurred while adding the game", {
        variant: "error",
      });
    }
  }, [
    isAdmin,
    token,
    eventData,
    selectedGame,
    selectedDateTime,
    duration,
    signOut,
    refreshSchedule,
    enqueueSnackbar,
  ]);

  // Handle deleting a schedule entry
  const handleDelete = useCallback(
    async (scheduleId: number) => {
      if (!isAdmin || !token || !eventData) return;

      if (
        !window.confirm(
          "Are you sure you want to remove this game from the schedule?",
        )
      ) {
        return;
      }

      try {
        const response = await fetch(
          `/api/events/${eventData.id}/game_schedule/${scheduleId}?as_admin=true`,
          {
            method: "DELETE",
            headers: {
              Authorization: "Bearer " + token,
            },
          },
        );

        if (response.status === 401) {
          signOut();
          return;
        }

        if (!response.ok) {
          const errorText = await response.text();
          console.error("Failed to delete schedule:", errorText);
          enqueueSnackbar("Failed to remove game from schedule", {
            variant: "error",
          });
          return;
        }

        // Refresh schedule after successful deletion
        refreshSchedule();
        enqueueSnackbar("Game removed from schedule successfully", {
          variant: "success",
        });
      } catch (error) {
        console.error("Error deleting game schedule:", error);
        enqueueSnackbar("An error occurred while removing the game", {
          variant: "error",
        });
      }
    },
    [isAdmin, token, eventData, signOut, refreshSchedule, enqueueSnackbar],
  );

  // Handle recalculating suggested schedule
  const handleRecalculate = useCallback(async () => {
    if (!isAdmin || !token || !eventData) return;

    setIsRecalculating(true);
    try {
      const response = await fetch(
        `/api/events/${eventData.id}/game_schedule/recalculate?as_admin=true`,
        {
          method: "POST",
          headers: {
            Authorization: "Bearer " + token,
          },
        },
      );

      if (response.status === 401) {
        signOut();
        return;
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Failed to recalculate schedule:", errorText);
        enqueueSnackbar("Failed to recalculate suggested schedule", {
          variant: "error",
        });
        return;
      }

      // Refresh schedule to show new suggestions
      refreshSchedule();
      enqueueSnackbar("Schedule recalculated successfully", {
        variant: "success",
      });
    } catch (error) {
      console.error("Error recalculating schedule:", error);
      enqueueSnackbar("An error occurred while recalculating", {
        variant: "error",
      });
    } finally {
      setIsRecalculating(false);
    }
  }, [isAdmin, token, eventData, signOut, refreshSchedule, enqueueSnackbar]);

  // Handle clicking on a suggested game to pin it
  const handleSelectEvent = useCallback(
    (event: CalendarEvent) => {
      // Only allow pinning for admins and suggested games
      if (!isAdmin || !event.resource.isSuggested) return;

      setGameToPin(event);
      setPinDialogOpen(true);
    },
    [isAdmin],
  );

  // Handle confirming the pin action
  const handleConfirmPin = useCallback(async () => {
    if (!gameToPin || !token || !eventData) return;

    setPinDialogOpen(false);

    try {
      const response = await fetch(
        `/api/events/${eventData.id}/game_schedule/pin?as_admin=true`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + token,
          },
          body: JSON.stringify({
            gameId: gameToPin.resource.gameId,
            startTime: gameToPin.start.toISOString(),
            durationMinutes: gameToPin.resource.durationMinutes,
          }),
        },
      );

      if (response.status === 401) {
        signOut();
        return;
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Failed to pin game:", errorText);
        enqueueSnackbar("Failed to pin game to schedule", {
          variant: "error",
        });
        return;
      }

      // Refresh schedule to show the pinned game
      refreshSchedule();
      enqueueSnackbar(`${gameToPin.title} has been pinned to the schedule`, {
        variant: "success",
      });
    } catch (error) {
      console.error("Error pinning game:", error);
      enqueueSnackbar("An error occurred while pinning the game", {
        variant: "error",
      });
    } finally {
      setGameToPin(null);
    }
  }, [gameToPin, token, eventData, signOut, refreshSchedule, enqueueSnackbar]);

  // Custom slot styling to highlight event duration
  const slotPropGetter = useCallback(
    (date: Date) => {
      if (!eventData) return {};

      const slotTime = moment(date);
      const eventStart = moment(eventData.timeBegin);
      const eventEnd = moment(eventData.timeEnd);

      // Check if this slot is within the event period
      // Slot must start within the event (>= start and < end)
      const isWithinEvent =
        slotTime.isSameOrAfter(eventStart) && slotTime.isBefore(eventEnd);

      if (isWithinEvent) {
        return {
          style: {
            backgroundColor: alpha(theme.palette.success.light, 0.12),
            borderLeft: `3px solid ${theme.palette.success.main}`,
            borderRight: `1px solid ${alpha(theme.palette.success.main, 0.3)}`,
          },
        };
      }

      return {};
    },
    [eventData, theme],
  );

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
    refreshSchedule();
  }, [refreshSchedule]);

  // Set current date to event start when event loads
  useEffect(() => {
    if (eventData) {
      setCurrentDate(eventData.timeBegin.toDate());
    }
  }, [eventData]);

  // Custom week range: show only the days from event start to end
  // We'll use a custom view component that gets eventData from closure
  const customViews = React.useMemo(
    () => ({
      week: createEventWeekView(),
    }),
    [createEventWeekView],
  );

  // Manual scroll to time (workaround for scrollToTime not working with custom views)
  useEffect(() => {
    if (!calendarRef.current || !eventData || view !== "week") return;

    const scrollContainer = calendarRef.current.querySelector(
      ".rbc-time-content",
    ) as HTMLElement;
    if (!scrollContainer) return;

    const now = moment();
    const eventStart = moment(eventData.timeBegin);
    const eventEnd = moment(eventData.timeEnd);

    let targetTime: moment.Moment;

    // Rule 1: If now is before event start, scroll to event start
    if (now.isBefore(eventStart)) {
      targetTime = eventStart;
    }
    // Rule 3: If now is after event end, scroll to event end
    else if (now.isAfter(eventEnd)) {
      targetTime = eventEnd;
    }
    // Rule 2: If now is during the event, scroll to current time
    else {
      targetTime = now;
    }

    // Calculate scroll position (1px per minute)
    const targetHour = targetTime.hours();
    const targetMinutes = targetTime.minutes();
    const scrollPosition = (targetHour * 60 + targetMinutes) * 1;

    // Small delay to ensure calendar is fully rendered
    setTimeout(() => {
      scrollContainer.scrollTop = scrollPosition;
    }, 100);
  }, [eventData, view, schedule]);

  // Fetch game suggestions for the event
  useEffect(() => {
    if (!eventData || !token || !isAdmin) return;

    setSuggestionsLoading(true);
    fetch(`/api/events/${eventData.id}/suggested_games`, {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: "Bearer " + token,
      },
    })
      .then((response) => {
        if (response.status === 401) signOut();
        if (!response.ok) {
          setSuggestionsLoading(false);
          return;
        }
        return response
          .text()
          .then(
            (data) => JSON.parse(data, dateParser) as Array<GameSuggestion>,
          );
      })
      .then((data) => {
        if (data) {
          setGameSuggestions(data);
        }
        setSuggestionsLoading(false);
      })
      .catch((error) => {
        console.error("Error fetching game suggestions:", error);
        setSuggestionsLoading(false);
      });
  }, [eventData, token, isAdmin, signOut]);

  // Show loading state while event data is being fetched
  if (eventLoading || !eventData) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Skeleton variant="rectangular" height={600} />
      </Container>
    );
  }

  // Calculate min and max times for the calendar
  // For react-big-calendar day/week views, min/max represent the time range to display each day
  // We'll show a full 24-hour range, or restrict to reasonable gaming hours
  const minTime = new Date();
  minTime.setHours(0, 0, 0, 0); // Start at midnight

  const maxTime = new Date();
  maxTime.setHours(23, 59, 59, 999); // End at 11:59 PM

  // Convert schedule entries to calendar events
  const allEvents: CalendarEvent[] = toCalendarEvents(schedule);

  // Filter events based on showSuggestions toggle
  const events = showSuggestions
    ? allEvents
    : allEvents.filter((e) => !e.resource.isSuggested);

  // Custom event styling based on pinned/suggested status
  const eventStyleGetter = (event: CalendarEvent) => {
    const entry = event.resource;
    const steamAppId = entry.gameId;
    const steamBannerUrl = `https://cdn.akamai.steamstatic.com/steam/apps/${steamAppId}/header.jpg`;

    // Create gradient overlay to theme color with fade from top to bottom
    const gradientOverlay = entry.isSuggested
      ? `linear-gradient(to bottom, ${alpha(
          theme.palette.grey[500],
          0.85,
        )} 0%, ${alpha(theme.palette.grey[500], 0.6)} 50%, ${alpha(
          theme.palette.grey[500],
          0.95,
        )} 100%)`
      : `linear-gradient(to bottom, ${alpha(
          theme.palette.primary.main,
          0.95,
        )} 0%, ${alpha(theme.palette.primary.main, 0.7)} 50%, ${alpha(
          theme.palette.primary.main,
          0.98,
        )} 100%)`;

    return {
      className: entry.isSuggested ? "suggested" : "",
      style: {
        backgroundImage: `${gradientOverlay}, url(${steamBannerUrl})`,
        backgroundSize: "100% auto",
        backgroundPosition: "top center",
        backgroundRepeat: "no-repeat",
      },
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
        <Box>
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              mb: 1,
            }}
          >
            <Typography variant="h4">Game Schedule</Typography>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={showSuggestions}
                    onChange={(e) => setShowSuggestions(e.target.checked)}
                    size="small"
                  />
                }
                label="Show suggested games"
                sx={{ mr: 0 }}
              />
              {isAdmin && (
                <Button
                  variant="outlined"
                  startIcon={<RefreshIcon />}
                  onClick={handleRecalculate}
                  disabled={isRecalculating}
                  size="small"
                >
                  {isRecalculating
                    ? "Recalculating..."
                    : "Recalculate Schedule"}
                </Button>
              )}
            </Box>
          </Box>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
            {schedule.length === 0 && isAdmin
              ? "Click games in the menu to add them to the schedule"
              : "View the schedule of games for this event"}
          </Typography>
        </Box>

        <StyledCalendarWrapper
          ref={calendarRef}
          sx={{ height: "calc(100vh - 280px)", minHeight: 600 }}
        >
          <DragAndDropCalendar
            localizer={localizer}
            events={events}
            startAccessor="start"
            endAccessor="end"
            style={{ height: "100%" }}
            view={view}
            onView={(newView) => setView(newView)}
            date={currentDate}
            onNavigate={(date) => setCurrentDate(date)}
            views={customViews}
            showMultiDayTimes={true}
            formats={{
              timeGutterFormat: "HH:mm",
              eventTimeRangeFormat: ({ start, end }, culture, localizer) =>
                localizer?.format(start, "HH:mm", culture) +
                " - " +
                localizer?.format(end, "HH:mm", culture),
              agendaTimeRangeFormat: ({ start, end }, culture, localizer) =>
                localizer?.format(start, "HH:mm", culture) +
                " - " +
                localizer?.format(end, "HH:mm", culture),
              dayHeaderFormat: "ddd DD/MM",
              dayRangeHeaderFormat: ({ start, end }, culture, localizer) =>
                localizer?.format(start, "DD MMM", culture) +
                " - " +
                localizer?.format(end, "DD MMM", culture),
            }}
            min={minTime}
            max={maxTime}
            step={30} // 30-minute intervals
            timeslots={2} // Show :00 and :30
            eventPropGetter={eventStyleGetter}
            slotPropGetter={slotPropGetter}
            tooltipAccessor={(event: CalendarEvent) =>
              `${event.title} - ${event.resource.durationMinutes} minutes`
            }
            // Click handler for suggested games (pinning)
            onSelectEvent={handleSelectEvent}
            // Drag-and-drop props (only enabled for admins)
            draggableAccessor={() => isAdmin}
            resizable={isAdmin}
            onEventDrop={handleEventDrop}
            onEventResize={handleEventResize}
            // Custom event component with delete button
            components={{
              event: (props: { event: CalendarEvent }) => (
                <CustomEvent
                  event={props.event}
                  isAdmin={isAdmin}
                  onDelete={handleDelete}
                />
              ),
              toolbar: CustomToolbar,
            }}
          />
        </StyledCalendarWrapper>
      </Paper>

      {/* FAB and drawer with game suggestions (admin only) */}
      {isAdmin && (
        <>
          <Fab
            color="primary"
            aria-label="add game"
            onClick={() => setFabOpen(true)}
            sx={{
              position: "fixed",
              bottom: 16,
              right: 16,
            }}
          >
            <AddIcon />
          </Fab>

          <Drawer
            anchor="right"
            open={fabOpen}
            onClose={() => setFabOpen(false)}
            sx={{
              "& .MuiDrawer-paper": {
                width: 350,
                p: 2,
              },
            }}
          >
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                mb: 2,
              }}
            >
              <Typography variant="h6">Drag Games to Schedule</Typography>
              <IconButton onClick={() => setFabOpen(false)} size="small">
                <CloseIcon />
              </IconButton>
            </Box>
            <Divider sx={{ mb: 2 }} />

            {suggestionsLoading ? (
              <Box sx={{ p: 2 }}>
                <Skeleton variant="rectangular" height={60} sx={{ mb: 1 }} />
                <Skeleton variant="rectangular" height={60} sx={{ mb: 1 }} />
                <Skeleton variant="rectangular" height={60} />
              </Box>
            ) : gameSuggestions.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                No game suggestions available. Add games to the event first.
              </Typography>
            ) : (
              <List sx={{ p: 0 }}>
                {gameSuggestions
                  .sort((a, b) => b.votes - a.votes) // Sort by votes descending
                  .map((game) => (
                    <GameSuggestionItem
                      key={game.appid}
                      game={game}
                      onClick={handleGameClick}
                    />
                  ))}
              </List>
            )}

            <Divider sx={{ my: 2 }} />
            <Typography variant="caption" color="text.secondary">
              Click on a game to add it to the schedule.
            </Typography>
          </Drawer>

          {/* Add game dialog */}
          <Dialog
            open={addGameDialogOpen}
            onClose={() => setAddGameDialogOpen(false)}
            maxWidth="sm"
            fullWidth
          >
            <DialogTitle>Add {selectedGame?.name} to Schedule</DialogTitle>
            <DialogContent>
              <LocalizationProvider
                dateAdapter={AdapterMoment}
                adapterLocale="en-gb"
              >
                <Box
                  sx={{
                    pt: 2,
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                  }}
                >
                  <DatePicker
                    label="Date"
                    value={selectedDateTime}
                    onChange={(newValue) => setSelectedDateTime(newValue)}
                    minDate={eventData?.timeBegin}
                    maxDate={eventData?.timeEnd}
                    format="DD/MM/YYYY"
                    slotProps={{
                      textField: {
                        fullWidth: true,
                        variant: "outlined",
                      },
                    }}
                  />
                  <TimePicker
                    label="Start Time"
                    value={selectedDateTime}
                    onChange={(newValue) => setSelectedDateTime(newValue)}
                    ampm={false}
                    format="HH:mm"
                    slotProps={{
                      textField: {
                        fullWidth: true,
                        variant: "outlined",
                      },
                    }}
                  />
                  <TextField
                    label="Duration"
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                    select
                    fullWidth
                  >
                    <MenuItem value={30}>30 minutes</MenuItem>
                    <MenuItem value={60}>1 hour</MenuItem>
                    <MenuItem value={90}>1.5 hours</MenuItem>
                    <MenuItem value={120}>2 hours</MenuItem>
                    <MenuItem value={180}>3 hours</MenuItem>
                    <MenuItem value={240}>4 hours</MenuItem>
                  </TextField>
                </Box>
              </LocalizationProvider>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setAddGameDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleAddGame}
                variant="contained"
                color="primary"
              >
                Add to Schedule
              </Button>
            </DialogActions>
          </Dialog>

          {/* Pin Suggestion Dialog */}
          <Dialog
            open={pinDialogOpen}
            onClose={() => setPinDialogOpen(false)}
            maxWidth="sm"
            fullWidth
          >
            <DialogTitle>Pin Game to Schedule</DialogTitle>
            <DialogContent>
              <Typography>
                Do you want to pin <strong>{gameToPin?.title}</strong> to the
                schedule at{" "}
                <strong>
                  {gameToPin?.start
                    ? moment(gameToPin.start).format("DD/MM/YYYY HH:mm")
                    : ""}
                </strong>
                ?
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                This will convert the suggested game into a manually scheduled
                (pinned) game that won&apos;t change when the schedule is
                recalculated.
              </Typography>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setPinDialogOpen(false)}>Cancel</Button>
              <Button
                onClick={handleConfirmPin}
                variant="contained"
                color="primary"
              >
                Pin Game
              </Button>
            </DialogActions>
          </Dialog>
        </>
      )}
    </Container>
  );
}
