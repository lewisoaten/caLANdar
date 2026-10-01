import * as React from "react";
import { useEffect, useState, useContext, useCallback, useMemo } from "react";
import { Link as RouterLink, useParams } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Tooltip,
  Typography,
} from "@mui/material";
import DeskSharp from "@mui/icons-material/DeskSharp";
import EventSeatSharp from "@mui/icons-material/EventSeatSharp";
import { UserContext, UserDispatchContext } from "../UserProvider";
import { dateParser } from "../utils";
import { Seat, EventSeatingConfig, EventData } from "../types/events";
import { InvitationData, InvitationLiteData, RSVP } from "../types/invitations";
import { getAttendanceDescription } from "../utils/attendanceDescription";
import {
  EmptyState,
  Kicker,
  PageHeader,
  Panel,
  StatCell,
  StatGrid,
  Tag,
  UserAvatar,
  bracket,
  colors,
  fonts,
  hairline,
  tint,
} from "./hl";
import {
  SeatFloorPlan,
  FloorPlanLegend,
  type DeskState,
  type FloorPlanDesk,
} from "./SeatFloorPlan";
import {
  layoutRoom,
  ownDeskLabel,
  roomCode,
  sortByCell,
  sortRooms,
  type FloorPlanRoom,
  type FloorPlanSeat,
} from "./seatFloorPlanModel";
import { useSeatReservation } from "./useSeatReservation";

const isGoing = (r: RSVP | null | undefined) =>
  r === RSVP.yes || r === RSVP.maybe;

const displayName = (inv: { handle: string | null }) => inv.handle || "Someone";

interface DeskInfo extends FloorPlanDesk {
  seat: FloorPlanSeat;
  /** Everyone booked on the desk (any time), for the "who's where" list. */
  people: InvitationLiteData[];
}

function AttendancePips({
  attendance,
  response,
  event,
}: {
  attendance: number[] | null;
  response: RSVP | null;
  event: EventData | null;
}) {
  if (!attendance || attendance.length === 0 || !event) return null;
  const text = getAttendanceDescription(
    attendance,
    event.timeBegin,
    event.timeEnd,
  );
  const on = response === RSVP.maybe ? colors.amber : colors.lime;
  return (
    <Tooltip title={text} enterDelay={200}>
      <Box
        role="img"
        aria-label={`Attending: ${text}`}
        sx={{ display: "flex", gap: "3px", flex: "none" }}
      >
        {attendance.map((bucket, index) => (
          <Box
            key={index}
            sx={{
              width: 6,
              height: 10,
              backgroundColor: bucket === 1 ? on : "transparent",
              border: `1px solid ${bucket === 1 ? on : colors.disabled}`,
            }}
          />
        ))}
      </Box>
    </Tooltip>
  );
}

const EventSeatMap: React.FC = () => {
  const { signOut } = useContext(UserDispatchContext);
  const userDetails = useContext(UserContext);
  const token = userDetails?.token;
  const email = userDetails?.email;
  const { id: eventIdParam } = useParams<{ id: string }>();
  const eventId = eventIdParam ? Number(eventIdParam) : undefined;

  const [event, setEvent] = useState<EventData | null>(null);
  const [rooms, setRooms] = useState<FloorPlanRoom[]>([]);
  const [seats, setSeats] = useState<FloorPlanSeat[]>([]);
  const [seatingConfig, setSeatingConfig] = useState<EventSeatingConfig | null>(
    null,
  );
  const [invitations, setInvitations] = useState<InvitationLiteData[]>([]);
  const [myInvitation, setMyInvitation] = useState<InvitationData | null>(null);
  // Which event the loaded data (and any error) belongs to.
  const [loadedFor, setLoadedFor] = useState<number | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const dataLoaded = eventId !== undefined && loadedFor === eventId;
  const [activeRoomId, setActiveRoomId] = useState<number | null>(null);
  const [selectedSeatId, setSelectedSeatId] = useState<number | null>(null);

  const getJson = useCallback(
    async <T,>(url: string, what: string): Promise<T> => {
      const response = await fetch(url, {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: "Bearer " + token,
        },
      });
      if (response.status === 401) {
        signOut();
        throw new Error("Unauthorized");
      }
      if (!response.ok) throw new Error(`Failed to fetch ${what}`);
      return JSON.parse(await response.text(), dateParser) as T;
    },
    [token, signOut],
  );

  const fetchInvitations = useCallback(() => {
    if (!eventId || !token) return Promise.resolve();
    return getJson<InvitationLiteData[]>(
      `/api/events/${eventId}/invitations`,
      "invitations",
    ).then((data) => setInvitations(data ?? []));
  }, [eventId, token, getJson]);

  // Load all data
  useEffect(() => {
    if (!eventId || !token) return;
    const base = `/api/events/${eventId}`;
    Promise.all([
      getJson<EventData>(base, "event").then(setEvent),
      getJson<EventSeatingConfig>(
        `${base}/seating-config`,
        "seating config",
      ).then(setSeatingConfig),
      getJson<FloorPlanRoom[]>(`${base}/rooms`, "rooms").then((data) =>
        setRooms(data ?? []),
      ),
      getJson<FloorPlanSeat[]>(`${base}/seats`, "seats").then((data) =>
        setSeats(data ?? []),
      ),
      fetchInvitations(),
    ])
      .then(() => {
        setFetchError(null);
        setLoadedFor(eventId);
      })
      .catch((error) => {
        console.error("Error loading data:", error);
        setFetchError(
          "Failed to load seat map data. Please try refreshing the page.",
        );
        setLoadedFor(eventId);
      });
  }, [eventId, token, getJson, fetchInvitations]);

  // The signed-in user's own invitation: RSVP, attendance, avatar.
  const [myInvitationLoaded, setMyInvitationLoaded] = useState(false);
  useEffect(() => {
    if (!eventId || !token || !email) return;
    let cancelled = false;
    fetch(`/api/events/${eventId}/invitations/${encodeURIComponent(email)}`, {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: "Bearer " + token,
      },
    })
      .then((response) =>
        response.ok
          ? response
              .text()
              .then((data) => JSON.parse(data, dateParser) as InvitationData)
          : null,
      )
      .then((data) => {
        if (!cancelled) setMyInvitation(data);
      })
      .catch((error) => {
        console.error("Error fetching your invitation:", error);
      })
      .finally(() => {
        if (!cancelled) setMyInvitationLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [eventId, token, email]);

  const going = isGoing(myInvitation?.response);
  const attendanceBuckets = useMemo(
    () => (going ? (myInvitation?.attendance ?? null) : null),
    [going, myInvitation],
  );
  const hasTimes = Boolean(
    attendanceBuckets && attendanceBuckets.some(Boolean),
  );

  const onReservationChange = useCallback(() => {
    setSelectedSeatId(null);
    fetchInvitations()?.catch((error) =>
      console.error("Error refreshing invitations:", error),
    );
  }, [fetchInvitations]);

  const {
    reservation,
    loaded: reservationLoaded,
    availableSeatIds,
    saving,
    reserve,
    release,
    canRelease,
  } = useSeatReservation({
    eventId,
    token,
    signOut,
    seatingConfig,
    seats,
    seatsLoaded: dataLoaded,
    attendanceBuckets: hasTimes ? attendanceBuckets : null,
    onChange: onReservationChange,
  });

  const canPick = going && hasTimes && availableSeatIds !== null;

  // The attendee list has no emails: recognise yourself by your (email-derived)
  // avatar, or by handle and seat when there is no avatar.
  const isMe = useCallback(
    (inv: InvitationLiteData) => {
      if (!myInvitation || !isGoing(myInvitation.response)) return false;
      if (myInvitation.avatarUrl && inv.avatarUrl) {
        return inv.avatarUrl === myInvitation.avatarUrl;
      }
      return (
        Boolean(inv.handle) &&
        inv.handle === myInvitation.handle &&
        inv.seatId === (reservation?.seatId ?? null)
      );
    },
    [myInvitation, reservation],
  );

  const orderedRooms = useMemo(
    () =>
      sortRooms(rooms).filter((room) =>
        seats.some((s) => s.roomId === room.id),
      ),
    [rooms, seats],
  );
  const activeRoom =
    orderedRooms.find((r) => r.id === activeRoomId) ??
    // Start on the room holding the user's seat.
    orderedRooms.find((r) =>
      seats.some((s) => s.roomId === r.id && s.id === reservation?.seatId),
    ) ??
    orderedRooms[0] ??
    null;

  const me = useMemo(
    () => ({
      name: myInvitation?.handle || email || "You",
      avatarUrl: myInvitation?.avatarUrl ?? null,
    }),
    [myInvitation, email],
  );

  const deskFor = useCallback(
    (seat: FloorPlanSeat): DeskInfo => {
      const people = invitations.filter((inv) => inv.seatId === seat.id);
      const others = people.filter((inv) => !isMe(inv));
      const mine = reservation?.seatId === seat.id;
      let state: DeskState;
      if (mine) state = "mine";
      else if (selectedSeatId === seat.id) state = "selected";
      else if (canPick) {
        state = availableSeatIds!.includes(seat.id) ? "free" : "taken";
      } else state = others.length > 0 ? "taken" : "free";
      return {
        seat,
        state,
        people,
        occupants:
          state === "mine"
            ? [me]
            : others.map((o) => ({
                name: displayName(o),
                avatarUrl: o.avatarUrl,
              })),
        disabled: !canPick || saving,
      };
    },
    [
      invitations,
      isMe,
      reservation,
      selectedSeatId,
      canPick,
      availableSeatIds,
      me,
      saving,
    ],
  );

  const desksByRoom = useMemo(() => {
    const map = new Map<number, DeskInfo[]>();
    for (const room of orderedRooms) {
      const roomSeats = seats.filter((s) => s.roomId === room.id);
      const { cells } = layoutRoom(room, roomSeats);
      map.set(
        room.id,
        sortByCell(roomSeats, cells).map((s) => deskFor(s)),
      );
    }
    return map;
  }, [orderedRooms, seats, deskFor]);

  const selectedSeat = seats.find((s) => s.id === selectedSeatId) ?? null;
  const mySeat = seats.find((s) => s.id === reservation?.seatId) ?? null;
  const roomName = (seat: Seat | null) =>
    rooms.find((r) => r.id === seat?.roomId)?.name ?? "";

  const handleDeskSelect = (seat: FloorPlanSeat) => {
    if (seat.id === reservation?.seatId) {
      setSelectedSeatId(null);
      return;
    }
    setSelectedSeatId((cur) => (cur === seat.id ? null : seat.id));
  };

  const switchRoom = (id: number) => {
    setActiveRoomId(id);
    setSelectedSeatId(null);
  };

  const tabRefs = React.useRef(new Map<number, HTMLButtonElement>());
  const onTabKeyDown = (e: React.KeyboardEvent, index: number) => {
    const last = orderedRooms.length - 1;
    const next =
      e.key === "ArrowRight"
        ? index === last
          ? 0
          : index + 1
        : e.key === "ArrowLeft"
          ? index === 0
            ? last
            : index - 1
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? last
              : null;
    if (next === null) return;
    e.preventDefault();
    const room = orderedRooms[next];
    switchRoom(room.id);
    tabRefs.current.get(room.id)?.focus();
  };

  const header = (actions?: React.ReactNode) => (
    <PageHeader kicker="FLOOR PLAN" title="Seat map" actions={actions} />
  );

  if (!dataLoaded) {
    return (
      <>
        {header()}
        <Panel aria-label="Loading seat map">
          <Box
            role="status"
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 2,
              py: 4,
            }}
          >
            <CircularProgress aria-hidden="true" />
            <Typography sx={{ color: colors.textMuted }}>
              Loading seat map…
            </Typography>
          </Box>
        </Panel>
      </>
    );
  }

  if (fetchError) {
    return (
      <>
        {header()}
        <Alert severity="error" role="alert">
          {fetchError}
        </Alert>
      </>
    );
  }

  if (!seatingConfig?.hasSeating) {
    return (
      <>
        {header()}
        <EmptyState
          variant="panel"
          icon={<EventSeatSharp />}
          kicker="NO SEATING"
          title="Seating is not enabled for this event."
          description="Just turn up and grab a spot."
          action={
            eventId ? (
              <Button
                component={RouterLink}
                to={`/events/${eventId}`}
                variant="outlined"
              >
                Back to the lobby
              </Button>
            ) : undefined
          }
        />
      </>
    );
  }

  if (!activeRoom) {
    return (
      <>
        {header()}
        <EmptyState
          variant="panel"
          icon={<EventSeatSharp />}
          kicker="NO ROOMS YET"
          title="No rooms or seats have been configured for this event yet."
          description="Check back once the organisers have laid out the room."
        />
      </>
    );
  }

  const activeDesks = desksByRoom.get(activeRoom.id) ?? [];
  const freeCount = (roomId: number) =>
    (desksByRoom.get(roomId) ?? []).filter((d) => d.state === "free").length;
  const activeIndex = orderedRooms.findIndex((r) => r.id === activeRoom.id);

  const occupiedSeats = seats.filter((s) =>
    invitations.some((inv) => inv.seatId === s.id),
  ).length;
  const ownDesk = ownDeskLabel(seatingConfig.unspecifiedSeatLabel);
  const unspecifiedInvitations = invitations.filter(
    (inv) => inv.seatId === null && isGoing(inv.response),
  );

  const tabs = (
    <Box
      role="tablist"
      aria-label="Rooms"
      sx={{
        display: "flex",
        maxWidth: "100%",
        overflowX: "auto",
        border: `1px solid ${hairline.control}`,
        backgroundColor: "rgba(12,15,24,0.8)",
      }}
    >
      {orderedRooms.map((room, i) => {
        const on = room.id === activeRoom.id;
        return (
          <Box
            key={room.id}
            component="button"
            type="button"
            role="tab"
            id={`seat-room-tab-${room.id}`}
            aria-selected={on}
            aria-controls="seat-room-panel"
            tabIndex={on ? 0 : -1}
            ref={(el: HTMLButtonElement | null) => {
              if (el) tabRefs.current.set(room.id, el);
              else tabRefs.current.delete(room.id);
            }}
            onClick={() => switchRoom(room.id)}
            onKeyDown={(e: React.KeyboardEvent) => onTabKeyDown(e, i)}
            sx={{
              flex: "none",
              minHeight: 44,
              px: "18px",
              border: 0,
              borderRadius: 0,
              backgroundColor: on ? colors.cyan : "transparent",
              color: on ? colors.ink : colors.textMuted,
              fontFamily: fonts.ui,
              fontWeight: 600,
              fontSize: 13,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 1,
              whiteSpace: "nowrap",
              "&:hover": on ? {} : { color: colors.text },
              "&:focus-visible": {
                outline: `2px solid ${colors.cyan}`,
                outlineOffset: "-4px",
                ...(on ? { outlineColor: colors.ink } : {}),
              },
            }}
          >
            {room.name}
            <Box
              component="span"
              sx={{ fontFamily: fonts.mono, fontSize: 11, opacity: 0.85 }}
            >
              {freeCount(room.id)} FREE
            </Box>
          </Box>
        );
      })}
    </Box>
  );

  // --- Status panel ---------------------------------------------------------
  let kicker: string;
  let title: string;
  let titleTone: "lime" | "cyan" = "cyan";
  let sub: React.ReactNode;
  const actions: React.ReactNode[] = [];
  const lobbyButton = (
    <Button
      key="lobby"
      component={RouterLink}
      to={`/events/${eventId}`}
      variant="outlined"
    >
      RSVP in the lobby
    </Button>
  );

  if (!myInvitationLoaded || (going && hasTimes && !reservationLoaded)) {
    kicker = "YOUR SEAT";
    title = "Checking…";
    sub = "Looking up your reservation.";
  } else if (!going) {
    kicker = "LOCKED";
    title = "RSVP first";
    sub = myInvitation
      ? "Seats open up once you RSVP yes or maybe."
      : "Only invited guests can claim a desk.";
    if (myInvitation) actions.push(lobbyButton);
  } else if (!hasTimes) {
    kicker = "LOCKED";
    title = "Set your times";
    sub = "Pick the times you'll be there in the lobby, then claim a desk.";
    actions.push(lobbyButton);
  } else if (selectedSeat) {
    kicker = "SELECTED";
    title = selectedSeat.label;
    sub = mySeat
      ? `Swap from ${mySeat.label} to ${selectedSeat.label}? Your old seat frees up for the squad.`
      : "Free for the times you're here. Claim it before someone else does.";
    if (selectedSeat.description) {
      sub = (
        <>
          {sub}
          <Box component="span" sx={{ display: "block", mt: 1 }}>
            {selectedSeat.description}
          </Box>
        </>
      );
    }
    actions.push(
      <Button
        key="claim"
        variant="contained"
        size="large"
        disabled={saving}
        onClick={() => reserve(selectedSeat.id)}
      >
        {saving
          ? "Saving…"
          : mySeat
            ? `Swap to ${selectedSeat.label}`
            : `Claim ${selectedSeat.label}`}
      </Button>,
      <Button
        key="cancel"
        variant="text"
        color="inherit"
        disabled={saving}
        onClick={() => setSelectedSeatId(null)}
      >
        Cancel
      </Button>,
    );
  } else if (reservation) {
    kicker = "YOUR SEAT";
    titleTone = "lime";
    title = mySeat ? `${mySeat.label} · ${roomName(mySeat)}` : ownDesk;
    sub = mySeat
      ? canRelease
        ? "Tap another free desk to move."
        : "This event needs everyone at a desk: tap another free desk to move."
      : "Tap a free desk on the plan to claim one instead.";
    if (canRelease) {
      actions.push(
        <Button
          key="release"
          variant="outlined"
          color="error"
          disabled={saving}
          onClick={() => release()}
        >
          {saving ? "Saving…" : "Release seat"}
        </Button>,
      );
    }
  } else {
    kicker = "NO SEAT YET";
    title = "Pick a desk";
    sub = "Tap any free desk on the plan to select it.";
  }

  const showOwnDesk =
    seatingConfig.allowUnspecifiedSeat &&
    canPick &&
    !selectedSeat &&
    !(reservation && reservation.seatId === null);
  if (showOwnDesk) {
    actions.push(
      <Button
        key="byo"
        variant="outlined"
        color="inherit"
        startIcon={<DeskSharp />}
        disabled={saving}
        onClick={() => reserve(null)}
        sx={{ justifyContent: "flex-start" }}
      >
        {ownDesk}
      </Button>,
    );
  }

  const listRowSx = {
    display: "flex",
    alignItems: "center",
    gap: 1.5,
    minHeight: 44,
    px: 2.5,
    py: 0.75,
    borderBottom: `1px solid ${hairline.faint}`,
    "&:last-of-type": { borderBottom: 0 },
  } as const;
  const labelTone: Record<DeskState, string> = {
    mine: colors.lime,
    taken: colors.violetText,
    selected: colors.cyan,
    free: colors.cyan,
  };

  return (
    <>
      {header(tabs)}
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          gap: "clamp(16px,2vw,24px)",
          alignItems: "flex-start",
        }}
      >
        <Box
          component="section"
          id="seat-room-panel"
          role="tabpanel"
          aria-labelledby={`seat-room-tab-${activeRoom.id}`}
          sx={{
            flex: "2 1 520px",
            minWidth: 0,
            position: "relative",
            border: `1px solid ${tint("cyan", 0.2)}`,
            backgroundColor: colors.surface,
            ...bracket(),
            p: "14px",
            display: "flex",
            flexDirection: "column",
            gap: 1.5,
          }}
        >
          <Box
            sx={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "space-between",
              alignItems: "baseline",
              gap: "4px 12px",
            }}
          >
            <Kicker component="h2" prefix={false}>
              {roomCode(activeIndex)} · {activeRoom.name}
            </Kicker>
            <Box
              component="span"
              sx={{
                fontFamily: fonts.mono,
                fontSize: 11,
                letterSpacing: "0.16em",
                color: colors.cyan,
              }}
            >
              {freeCount(activeRoom.id)} / {activeDesks.length} FREE
            </Box>
          </Box>
          {activeRoom.description && (
            <Typography
              sx={{ fontSize: 14, color: colors.textMuted, mt: -0.5 }}
            >
              {activeRoom.description}
            </Typography>
          )}
          <SeatFloorPlan
            room={activeRoom}
            desks={activeDesks}
            label={`${activeRoom.name} floor plan`}
            onDeskSelect={canPick ? handleDeskSelect : undefined}
            minCellSize={48}
          />
          <FloorPlanLegend
            items={["mine", "free", "taken", "selected"]}
            sx={{ pt: 0.5 }}
          />
        </Box>

        <Box
          component="aside"
          aria-label="Your seat and who's where"
          sx={{
            flex: "1 1 280px",
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          <Box
            component="section"
            aria-labelledby="seat-status-kicker"
            sx={{
              border: `1px solid ${hairline.panel}`,
              backgroundColor: colors.surface,
              p: 2.5,
              display: "flex",
              flexDirection: "column",
              gap: 1.5,
            }}
          >
            <Kicker component="h2" id="seat-status-kicker">
              {kicker}
            </Kicker>
            <Box
              aria-live="polite"
              sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}
            >
              <Box
                component="p"
                sx={{
                  m: 0,
                  fontSize: "clamp(28px,3vw,36px)",
                  fontWeight: 700,
                  lineHeight: 1,
                  color: titleTone === "lime" ? colors.lime : colors.cyan,
                  overflowWrap: "anywhere",
                }}
              >
                {title}
              </Box>
              <Typography
                component="div"
                sx={{ fontSize: 14, lineHeight: 1.55, color: colors.textMuted }}
              >
                {sub}
              </Typography>
            </Box>
            {actions.length > 0 && (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
                {actions}
              </Box>
            )}
          </Box>

          <Box
            component="section"
            aria-labelledby="seat-who-kicker"
            sx={{
              border: `1px solid ${hairline.panel}`,
              backgroundColor: colors.surface,
            }}
          >
            <Kicker
              component="h2"
              id="seat-who-kicker"
              prefix={false}
              sx={{
                px: 2.5,
                py: "14px",
                borderBottom: `1px solid ${hairline.soft}`,
              }}
            >
              {activeRoom.name} · Who&apos;s where
            </Kicker>
            <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0 }}>
              {activeDesks.map((desk) => {
                const people = desk.people;
                return (
                  <Box component="li" key={desk.seat.id} sx={listRowSx}>
                    <Box
                      component="span"
                      sx={{
                        width: 40,
                        flex: "none",
                        fontFamily: fonts.mono,
                        fontSize: 13,
                        fontWeight: 700,
                        color: labelTone[desk.state],
                      }}
                    >
                      {desk.seat.label}
                    </Box>
                    <Box
                      sx={{
                        flex: 1,
                        minWidth: 0,
                        display: "flex",
                        flexDirection: "column",
                        gap: 0.5,
                      }}
                    >
                      {people.length === 0 ? (
                        <Box
                          component="span"
                          sx={{ fontSize: 14, color: colors.textMuted }}
                        >
                          {desk.state === "selected" ? "Selected" : "Free"}
                        </Box>
                      ) : (
                        people.map((inv, i) => (
                          <Box
                            key={i}
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 1.25,
                              minWidth: 0,
                            }}
                          >
                            <UserAvatar
                              name={displayName(inv)}
                              src={inv.avatarUrl}
                              size={26}
                            />
                            <Box
                              component="span"
                              sx={{
                                fontSize: 14,
                                color: colors.text,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                minWidth: 0,
                              }}
                            >
                              {displayName(inv)}
                              {isMe(inv) ? " (you)" : ""}
                            </Box>
                            {inv.response === RSVP.maybe && (
                              <Tag tone="amber" size="sm">
                                MAYBE
                              </Tag>
                            )}
                            <Box sx={{ flex: 1 }} />
                            <AttendancePips
                              attendance={inv.attendance}
                              response={inv.response}
                              event={event}
                            />
                          </Box>
                        ))
                      )}
                      {desk.seat.description && (
                        <Box
                          component="span"
                          sx={{ fontSize: 12, color: colors.textMuted }}
                        >
                          {desk.seat.description}
                        </Box>
                      )}
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </Box>

          {seatingConfig.allowUnspecifiedSeat &&
            unspecifiedInvitations.length > 0 && (
              <Box
                component="section"
                aria-labelledby="seat-own-kicker"
                sx={{
                  border: `1px solid ${hairline.panel}`,
                  backgroundColor: colors.surface,
                }}
              >
                <Kicker
                  component="h2"
                  id="seat-own-kicker"
                  prefix={false}
                  sx={{
                    px: 2.5,
                    py: "14px",
                    borderBottom: `1px solid ${hairline.soft}`,
                  }}
                >
                  {ownDesk} · {unspecifiedInvitations.length}
                </Kicker>
                <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0 }}>
                  {unspecifiedInvitations.map((inv, i) => (
                    <Box component="li" key={i} sx={listRowSx}>
                      <UserAvatar
                        name={displayName(inv)}
                        src={inv.avatarUrl}
                        size={26}
                      />
                      <Box
                        component="span"
                        sx={{
                          flex: 1,
                          minWidth: 0,
                          fontSize: 14,
                          color: colors.text,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {displayName(inv)}
                        {isMe(inv) ? " (you)" : ""}
                      </Box>
                      {inv.response === RSVP.maybe && (
                        <Tag tone="amber" size="sm">
                          MAYBE
                        </Tag>
                      )}
                    </Box>
                  ))}
                </Box>
              </Box>
            )}

          <StatGrid columns={seatingConfig.allowUnspecifiedSeat ? 4 : 3}>
            <StatCell value={seats.length} label="DESKS" tone="cyan" />
            <StatCell value={occupiedSeats} label="TAKEN" tone="violet" />
            <StatCell
              value={seats.length - occupiedSeats}
              label="OPEN"
              tone="lime"
            />
            {seatingConfig.allowUnspecifiedSeat && (
              <StatCell
                value={unspecifiedInvitations.length}
                label="OWN DESK"
              />
            )}
          </StatGrid>
        </Box>
      </Box>
    </>
  );
};

export default EventSeatMap;
