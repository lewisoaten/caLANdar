import * as React from "react";
import { useEffect, useState, useContext, useCallback } from "react";
import {
  Box,
  Button,
  IconButton,
  Skeleton,
  Tab,
  Tabs,
  Tooltip,
  Typography,
} from "@mui/material";
import ArrowBackSharp from "@mui/icons-material/ArrowBackSharp";
import EditNoteSharp from "@mui/icons-material/EditNoteSharp";
import GroupSharp from "@mui/icons-material/GroupSharp";
import EventSeatSharp from "@mui/icons-material/EventSeatSharp";
import CampaignSharp from "@mui/icons-material/CampaignSharp";
import AddSharp from "@mui/icons-material/AddSharp";
import EditSharp from "@mui/icons-material/EditSharp";
import MeetingRoomSharp from "@mui/icons-material/MeetingRoomSharp";
import {
  Link as RouterLink,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useSnackbar } from "notistack";
import { UserContext, UserDispatchContext } from "../UserProvider";
import { dateParser } from "../utils";
import { EventData, defaultEventData, Room, Seat } from "../types/events";
import InvitationSeatManagementTable, {
  ConfirmDialog,
} from "./InvitationSeatManagementTable";
import EventsAdminDialog from "./EventsAdminDialog";
import SendEmailDialog from "./SendEmailDialog";
import EventSeatingConfig from "./EventSeatingConfig";
import SeatOccupancyAdmin from "./SeatOccupancyAdmin";
import { EmptyState, Tag, colors, fonts, hairline } from "./hl";

export const MANAGE_TABS = [
  { id: "details", label: "Details", icon: <EditNoteSharp /> },
  { id: "roster", label: "Roster", icon: <GroupSharp /> },
  { id: "seating", label: "Seating", icon: <EventSeatSharp /> },
  { id: "broadcast", label: "Broadcast", icon: <CampaignSharp /> },
] as const;

export type ManageTab = (typeof MANAGE_TABS)[number]["id"];

/** Tab from the `?tab=` search param (defaults to Details). */
export function tabFromParam(value: string | null): ManageTab {
  return (MANAGE_TABS.find((t) => t.id === value)?.id ??
    "details") as ManageTab;
}

/** Route of the room editor for an event. */
export const roomEditorPath = (eventId: number | string) =>
  `/admin/events/${eventId}/rooms`;

/** Seating tab: the event's rooms with seat counts, linking to the editor. */
function RoomsPanel({ eventId }: { eventId: number }) {
  const { signOut } = useContext(UserDispatchContext);
  const token = useContext(UserContext)?.token;
  const headingId = React.useId();
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [seats, setSeats] = useState<Seat[]>([]);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!eventId || !token) return;
    const controller = new AbortController();
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: "Bearer " + token,
    };
    const get = <T,>(url: string) =>
      fetch(url, { headers, signal: controller.signal }).then((r) => {
        if (r.status === 401) {
          signOut();
          throw new Error("Unauthorized");
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text().then((t) => JSON.parse(t, dateParser) as T);
      });
    Promise.all([
      get<Room[]>(`/api/events/${eventId}/rooms?as_admin=true`),
      get<Seat[]>(`/api/events/${eventId}/seats?as_admin=true`),
    ])
      .then(([r, s]) => {
        setRooms(
          [...r].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id),
        );
        setSeats(s);
      })
      .catch((e) => {
        if (controller.signal.aborted) return;
        console.error("Error loading rooms:", e);
        setError(true);
      });
    return () => controller.abort();
  }, [eventId, token, signOut, retry]);

  const editor = roomEditorPath(eventId);

  return (
    <Box
      component="section"
      aria-labelledby={headingId}
      sx={{
        border: `1px solid ${hairline.panel}`,
        backgroundColor: colors.surface,
        minWidth: 0,
      }}
    >
      <Box
        sx={{
          p: "14px 20px",
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          borderBottom: `1px solid ${hairline.soft}`,
        }}
      >
        <Typography
          component="h2"
          id={headingId}
          sx={{
            m: 0,
            flex: 1,
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          Rooms
        </Typography>
        <Button
          component={RouterLink}
          to={editor}
          variant="outlined"
          size="small"
          startIcon={<AddSharp />}
        >
          Add room
        </Button>
      </Box>
      {error ? (
        <Box
          role="alert"
          sx={{
            p: "16px 20px",
            display: "flex",
            gap: 1.5,
            alignItems: "center",
            flexWrap: "wrap",
            color: colors.pinkText,
          }}
        >
          Couldn&apos;t load the rooms.
          <Button
            size="small"
            variant="outlined"
            onClick={() => {
              setError(false);
              setRetry((n) => n + 1);
            }}
          >
            Retry
          </Button>
        </Box>
      ) : rooms === null ? (
        <Box aria-hidden="true" sx={{ p: "14px 20px" }}>
          <Skeleton width="50%" />
          <Skeleton width="70%" />
        </Box>
      ) : rooms.length === 0 ? (
        <EmptyState
          icon={<MeetingRoomSharp />}
          title="No rooms yet"
          description="Draw the floor plan so attendees can pick a seat."
          action={
            <Button
              component={RouterLink}
              to={editor}
              variant="contained"
              size="small"
            >
              Edit floor plan
            </Button>
          }
        />
      ) : (
        <Box component="ul" sx={{ m: 0, p: 0 }}>
          {rooms.map((room, i) => {
            const count = seats.filter((s) => s.roomId === room.id).length;
            return (
              <Box
                component="li"
                key={room.id}
                sx={{
                  listStyle: "none",
                  display: "flex",
                  alignItems: "center",
                  gap: "14px",
                  p: "14px 20px",
                  borderBottom: `1px solid ${hairline.faint}`,
                }}
              >
                <Box
                  component="span"
                  aria-hidden="true"
                  sx={{
                    fontFamily: fonts.mono,
                    fontSize: 12,
                    color: colors.textDim,
                  }}
                >
                  RM-{String(i + 1).padStart(2, "0")}
                </Box>
                <Box
                  sx={{
                    flex: 1,
                    minWidth: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: "2px",
                  }}
                >
                  <Typography
                    component="span"
                    sx={{
                      fontSize: 16,
                      fontWeight: 600,
                      overflowWrap: "anywhere",
                    }}
                  >
                    {room.name}
                  </Typography>
                  {room.description && (
                    <Typography
                      component="span"
                      sx={{ fontSize: 13, color: colors.textMuted }}
                    >
                      {room.description}
                    </Typography>
                  )}
                </Box>
                <Box
                  component="span"
                  sx={{
                    fontFamily: fonts.mono,
                    fontSize: 12,
                    color: colors.cyan,
                    whiteSpace: "nowrap",
                  }}
                >
                  {count} {count === 1 ? "SEAT" : "SEATS"}
                </Box>
                <Tooltip title="Edit floor plan">
                  <IconButton
                    component={RouterLink}
                    to={editor}
                    aria-label={`Edit ${room.name} floor plan`}
                    sx={{
                      width: 44,
                      height: 44,
                      border: `1px solid ${hairline.control}`,
                      color: colors.textMuted,
                      "&:hover": {
                        color: colors.cyan,
                        borderColor: colors.cyan,
                      },
                      "& svg": { fontSize: 18 },
                    }}
                  >
                    <EditSharp />
                  </IconButton>
                </Tooltip>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}

const EventManagement = () => {
  const { signOut } = useContext(UserDispatchContext);
  const userDetails = useContext(UserContext);
  const token = userDetails?.token;
  const { enqueueSnackbar } = useSnackbar();
  const [event, setEvent] = useState(defaultEventData);
  const [loadState, setLoadState] = useState<
    "loading" | "ready" | "missing" | "error"
  >("loading");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [occupancyKey, setOccupancyKey] = useState(0);
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = tabFromParam(searchParams.get("tab"));
  const uid = React.useId();

  const navigate = useNavigate();
  const { id } = useParams();

  const updateEvent = useCallback(() => {
    fetch(`/api/events/${id}?as_admin=true`, {
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
        else if (response.status === 404) setLoadState("missing");
        else throw new Error(`HTTP ${response.status}`);
      })
      .then((data) => {
        if (data) {
          setEvent(data);
          setLoadState("ready");
        }
      })
      .catch((error) => {
        console.error("Error loading event:", error);
        setLoadState("error");
      });
  }, [id, token, signOut]);

  useEffect(() => {
    updateEvent();
  }, [updateEvent]);

  const handleClose = (value?: EventData) => {
    // If value is set, then refresh event with details
    if (value) {
      enqueueSnackbar("Event saved", { variant: "success" });
      updateEvent();
    }
  };

  const deleteEvent = () => {
    setDeleting(true);
    fetch(`/api/events/${id}?as_admin=true`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: "Bearer " + token,
      },
    })
      .then((response) => {
        if (response.status === 401) signOut();
        else if (response.status === 204) {
          enqueueSnackbar(`Deleted “${event.title}”`, { variant: "success" });
          navigate("/admin/events");
        } else {
          throw new Error("Unable to delete event");
        }
      })
      .catch((error) => {
        console.error(error);
        enqueueSnackbar("Unable to delete event", { variant: "error" });
      })
      .finally(() => {
        setDeleting(false);
        setConfirmDelete(false);
      });
  };

  const selectTab = (next: ManageTab) => {
    const params = new URLSearchParams(searchParams);
    if (next === "details") params.delete("tab");
    else params.set("tab", next);
    setSearchParams(params, { replace: true });
  };

  const backLink = (
    <Button
      component={RouterLink}
      to="/admin/events"
      variant="text"
      color="inherit"
      startIcon={<ArrowBackSharp />}
      sx={{
        alignSelf: "flex-start",
        minHeight: 44,
        px: 0,
        fontFamily: fonts.mono,
        fontSize: 12,
        fontWeight: 400,
        letterSpacing: "0.14em",
        color: colors.textMuted,
        "&:hover": { color: colors.cyan, backgroundColor: "transparent" },
      }}
    >
      All events
    </Button>
  );

  if (loadState === "missing" || loadState === "error") {
    return (
      <>
        {backLink}
        <Typography variant="h1" component="h1">
          {loadState === "missing" ? "Event not found" : "Event unavailable"}
        </Typography>
        <EmptyState
          variant="panel"
          title={
            loadState === "missing"
              ? "This event doesn't exist"
              : "Couldn't load this event"
          }
          description={
            loadState === "missing"
              ? "It may have been deleted. Pick another one from the list."
              : "Check your connection and try again."
          }
          action={
            loadState === "error" ? (
              <Button variant="outlined" onClick={updateEvent}>
                Retry
              </Button>
            ) : undefined
          }
        />
      </>
    );
  }

  const ready = loadState === "ready";
  const panelId = (t: ManageTab) => `${uid}-panel-${t}`;
  const tabId = (t: ManageTab) => `${uid}-tab-${t}`;
  const panelProps = (t: ManageTab) => ({
    role: "tabpanel",
    id: panelId(t),
    "aria-labelledby": tabId(t),
    hidden: tab !== t,
  });

  return (
    <React.Fragment>
      <Box sx={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {backLink}
        <Box
          sx={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "flex-end",
            gap: "12px 20px",
          }}
        >
          <Typography
            variant="h1"
            component="h1"
            sx={{
              fontSize: "clamp(30px,4vw,46px)",
              overflowWrap: "anywhere",
              minWidth: 0,
            }}
          >
            {ready ? event.title : <Skeleton width={320} />}
          </Typography>
          <Tag tone="amber">Admin mode</Tag>
        </Box>
      </Box>

      <Tabs
        value={tab}
        onChange={(_e, v: ManageTab) => selectTab(v)}
        aria-label="Event settings"
        variant="scrollable"
        // Phones can't fit every tab: show arrows (dimmed at either end) so
        // the off-screen ones, like Broadcast, are discoverable.
        scrollButtons="auto"
        allowScrollButtonsMobile
        sx={{
          borderBottom: `1px solid ${hairline.chrome}`,
          "& .MuiTabs-scrollButtons": {
            width: 36,
            flex: "none",
            color: colors.cyan,
            "&.Mui-disabled": { opacity: 0.25 },
          },
        }}
      >
        {MANAGE_TABS.map((t) => (
          <Tab
            key={t.id}
            value={t.id}
            id={tabId(t.id)}
            aria-controls={panelId(t.id)}
            label={t.label}
            icon={t.icon}
            iconPosition="start"
            sx={{
              px: { xs: "12px", md: "18px" },
              fontSize: 14,
              letterSpacing: "0.12em",
              gap: 1,
              "& svg": { fontSize: 19 },
            }}
          />
        ))}
      </Tabs>

      <Box {...panelProps("details")}>
        {ready ? (
          <EventsAdminDialog
            variant="inline"
            open={true}
            event={event}
            onClose={handleClose}
            onDelete={() => setConfirmDelete(true)}
          />
        ) : (
          <Skeleton variant="rectangular" height={420} />
        )}
      </Box>

      <Box {...panelProps("roster")}>
        {ready && tab === "roster" && (
          <InvitationSeatManagementTable event={event} as_admin={true} />
        )}
      </Box>

      <Box {...panelProps("seating")}>
        {ready && tab === "seating" && (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: "clamp(16px,2vw,24px)",
            }}
          >
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(min(100%, 340px), 1fr))",
                gap: "clamp(16px,2vw,24px)",
                alignItems: "start",
              }}
            >
              <EventSeatingConfig
                eventId={event.id}
                onSaved={() => setOccupancyKey((k) => k + 1)}
              />
              <RoomsPanel eventId={event.id} />
            </Box>
            <SeatOccupancyAdmin
              eventId={event.id}
              refreshTrigger={occupancyKey}
            />
          </Box>
        )}
      </Box>

      <Box {...panelProps("broadcast")}>
        {ready && (
          <SendEmailDialog
            variant="inline"
            open={tab === "broadcast"}
            onClose={() => undefined}
            event={event}
          />
        )}
      </Box>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete event?"
        confirmLabel={deleting ? "Deleting…" : "Delete event"}
        busy={deleting}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={deleteEvent}
      >
        Delete <strong>{event.title}</strong> and everything attached to it?
        This can&apos;t be undone.
      </ConfirmDialog>
    </React.Fragment>
  );
};

export default EventManagement;
