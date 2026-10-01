import * as React from "react";
import { useEffect, useState, useContext, useCallback } from "react";
import moment from "moment";
import {
  Box,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  TextField,
  Button,
  Typography,
  Tooltip,
  IconButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  SelectChangeEvent,
  Skeleton,
} from "@mui/material";
import EditSharp from "@mui/icons-material/EditSharp";
import PersonRemoveSharp from "@mui/icons-material/PersonRemoveSharp";
import PersonAddSharp from "@mui/icons-material/PersonAddSharp";
import ForwardToInboxSharp from "@mui/icons-material/ForwardToInboxSharp";
import ContentCopySharp from "@mui/icons-material/ContentCopySharp";
import GroupSharp from "@mui/icons-material/GroupSharp";
import { InvitationData, RSVP } from "../types/invitations";
import { SeatReservation } from "../types/seat_reservations";
import {
  EventData,
  EventSeatingConfig,
  PaginatedEventsResponse,
  Room,
  Seat,
} from "../types/events";
import { UserContext, UserDispatchContext } from "../UserProvider";
import { dateParser } from "../utils";
import { getAttendanceDescription } from "../utils/attendanceDescription";
import { ApiError, apiErrorFrom, userFacingReason } from "../utils/apiError";
import { useSnackbar } from "notistack";
import RSVPWizard from "./RSVPWizard/RSVPWizard";
import {
  EmptyState,
  UserAvatar,
  colors,
  fonts,
  hairline,
  srOnly,
  tint,
  tones,
  type HlTone,
} from "./hl";

// ---------------------------------------------------------------------------
// Shared admin-list pieces (also used by InvitationsTable/SeatOccupancyAdmin)
// ---------------------------------------------------------------------------

/** RSVP -> the design's status label and tone (IN lime, MAYBE amber...). */
export function rsvpStatus(response: RSVP | string | null | undefined): {
  label: string;
  tone: HlTone;
} {
  switch (response) {
    case RSVP.yes:
      return { label: "IN", tone: "lime" };
    case RSVP.maybe:
      return { label: "MAYBE", tone: "amber" };
    case RSVP.no:
      return { label: "OUT", tone: "pink" };
    default:
      return { label: "PENDING", tone: "cyan" };
  }
}

/** Split and tidy a comma/whitespace separated list of emails. */
export function parseEmailList(value: string): string[] {
  const seen = new Set<string>();
  return value
    .split(/[,;\s]+/)
    .map((e) => e.trim())
    .filter((e) => {
      const key = e.toLowerCase();
      if (!e || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/** Loose shape check, matching what the browser's `type=email` accepts. */
export function isValidEmail(value: string): boolean {
  return /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(value);
}

/** Why one invitation failed, in words an admin can act on. */
export function inviteFailureReason(error: unknown): string {
  const reason = userFacingReason(error);
  if (reason) return reason;
  if (error instanceof ApiError) {
    if (error.status === 409) return "already invited";
    if (error.status === 400) return "not a valid email address";
    if (error.status === 404) return "this event no longer exists";
    if (error.status === 502)
      return "saved, but the invite email could not be sent; use resend to try again";
    return "the server couldn't send it, try again";
  }
  return "network error, try again";
}

/** Full-stopped, for joining several reasons (emails keep their case). */
const sentence = (text: string) => {
  const t = text.trim();
  return /[.!?]$/.test(t) ? t : `${t}.`;
};

const isSignOut = (error: unknown) =>
  error instanceof ApiError && error.status === 401;

/**
 * Attendance buckets as small squares, with a text alternative. Not
 * interactive, so it is not a tab stop: screen readers get the day/time
 * summary as the image's name, mouse users the same text as a tooltip.
 */
export function AttendancePips({
  attendance,
  tone = "lime",
  description,
}: {
  attendance: number[];
  tone?: HlTone;
  /** Accessible description; defaults to a per-bucket list. */
  description?: string;
}) {
  const label =
    description ??
    `Attendance: ${attendance.filter((b) => b === 1).length} of ${attendance.length} slots`;
  return (
    <Tooltip title={label} enterDelay={200}>
      <Box
        role="img"
        aria-label={label}
        sx={{
          display: "flex",
          flexWrap: "wrap",
          gap: "3px",
          maxWidth: 140,
        }}
      >
        {attendance.map((bucket, index) => (
          <Box
            key={index}
            sx={{
              width: 8,
              height: 8,
              backgroundColor: bucket === 1 ? tones[tone].solid : "transparent",
              border: `1px solid ${
                bucket === 1 ? tones[tone].solid : tint("neutral", 0.35)
              }`,
            }}
          />
        ))}
      </Box>
    </Tooltip>
  );
}

/** Themed confirmation dialog for destructive actions. */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText component="div">{children}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} color="inherit" disabled={busy}>
          Cancel
        </Button>
        <Button
          onClick={onConfirm}
          variant="contained"
          color="error"
          disabled={busy}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** 44px square icon action used in admin rows. */
export function RowAction({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip title={label}>
      <IconButton
        aria-label={label}
        onClick={onClick}
        sx={{
          width: 44,
          height: 44,
          border: `1px solid ${hairline.control}`,
          color: colors.textMuted,
          "&:hover": {
            color: danger ? colors.pinkText : colors.cyan,
            borderColor: danger ? colors.pinkText : colors.cyan,
            backgroundColor: "transparent",
          },
          "& svg": { fontSize: 18 },
        }}
      >
        {children}
      </IconButton>
    </Tooltip>
  );
}

const mono = { fontFamily: fonts.mono } as const;

// ---------------------------------------------------------------------------

interface InvitationSeatManagementTableProps {
  event: EventData;
  as_admin: boolean;
}

interface CombinedAttendeeData {
  email: string;
  avatarUrl: string | null;
  handle: string | null;
  invitedAt: moment.Moment;
  respondedAt: moment.Moment | null;
  response: RSVP | null;
  attendance: number[] | null;
  lastModified: moment.Moment;
  seatId: number | null;
  reservationId: number | null;
  reservationLastModified: moment.Moment | null;
}

/**
 * Event management "Roster" tab: invite by email (or copy a previous event's
 * list), then one row per invitee with RSVP, attendance, seat and actions
 * (resend, edit via the RSVP wizard, remove).
 */
export default function InvitationSeatManagementTable(
  props: InvitationSeatManagementTableProps,
) {
  const { signOut } = useContext(UserDispatchContext);
  const userDetails = useContext(UserContext);
  const token = userDetails?.token;
  const event_id = props.event.id;
  const { enqueueSnackbar } = useSnackbar();
  const uid = React.useId();

  const [invitations, setInvitations] = useState<InvitationData[]>([]);
  const [reservations, setReservations] = useState<SeatReservation[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [seats, setSeats] = useState<Seat[]>([]);
  // What this event calls a reservation without a seat ("Floating / BYO").
  const [unspecifiedLabel, setUnspecifiedLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  // RSVP Wizard state
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editingInvitation, setEditingInvitation] = useState<
    InvitationData | undefined
  >(undefined);

  // Inline invite field
  const [inviteValue, setInviteValue] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Send invitations (copy from event) dialog state
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [emailsValue, setEmailsValue] = useState<string>("");
  const [emailsError, setEmailsError] = useState<string | null>(null);
  const [availableEvents, setAvailableEvents] = useState<EventData[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<number | "">(0);

  // Delete confirmation
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Fetch all data
  const fetchData = useCallback(() => {
    if (!event_id || !token) return;

    setLoadError(false);
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: "Bearer " + token,
    };
    const get = <T,>(url: string): Promise<T | undefined> =>
      fetch(url, { headers }).then((response) => {
        if (response.status === 401) {
          signOut();
          return undefined;
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response
          .text()
          .then((data) => JSON.parse(data, dateParser) as T);
      });

    Promise.all([
      get<InvitationData[]>(
        `/api/events/${event_id}/invitations?as_admin=${props.as_admin}`,
      ).then((data) => {
        if (data) setInvitations(data);
      }),
      get<SeatReservation[]>(
        `/api/events/${event_id}/seat-reservations?as_admin=true`,
      ).then((data) => {
        if (data) setReservations(data);
      }),
      get<Room[]>(`/api/events/${event_id}/rooms?as_admin=true`).then(
        (data) => {
          if (data) setRooms(data);
        },
      ),
      get<Seat[]>(`/api/events/${event_id}/seats?as_admin=true`).then(
        (data) => {
          if (data) setSeats(data);
        },
      ),
      // Only used for a label: a missing/failed config isn't a roster error.
      get<EventSeatingConfig>(
        `/api/events/${event_id}/seating-config?as_admin=true`,
      )
        .then((data) => {
          setUnspecifiedLabel(data?.unspecifiedSeatLabel?.trim() || null);
        })
        .catch(() => setUnspecifiedLabel(null)),
    ])
      .catch((error) => {
        console.error("Error loading the roster:", error);
        setLoadError(true);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [event_id, token, props.as_admin, signOut]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Fetch available events for pre-fill
  useEffect(() => {
    if (!token) return;

    fetch("/api/events?as_admin=true&limit=100", {
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
              (data) => JSON.parse(data, dateParser) as PaginatedEventsResponse,
            );
      })
      .then((data) => {
        if (data && data.events) {
          setAvailableEvents(data.events.filter((e) => e.id !== event_id));
        }
      })
      .catch((error) => console.error("Error fetching events:", error));
  }, [token, event_id, signOut]);

  // Combine invitations and reservations
  const combinedData: CombinedAttendeeData[] = invitations.map((inv) => {
    const reservation = reservations.find(
      (r) => r.invitationEmail.toLowerCase() === inv.email.toLowerCase(),
    );
    return {
      email: inv.email,
      avatarUrl: inv.avatarUrl,
      handle: inv.handle,
      invitedAt: inv.invitedAt,
      respondedAt: inv.respondedAt,
      response: inv.response,
      attendance: inv.attendance,
      lastModified: inv.lastModified,
      seatId: reservation?.seatId || null,
      reservationId: reservation?.id || null,
      reservationLastModified: reservation?.lastModified || null,
    };
  });

  const totals = {
    invited: invitations.length,
    yes: invitations.filter((i) => i.response === RSVP.yes).length,
    maybe: invitations.filter((i) => i.response === RSVP.maybe).length,
    no: invitations.filter((i) => i.response === RSVP.no).length,
    pending: invitations.filter((i) => !i.response).length,
  };

  // Seat label and room for a seat ID, plus the text read by screen readers
  // in place of the visible label.
  const getSeat = (
    attendee: CombinedAttendeeData,
  ): { label: string; room: string | null; spoken: string } => {
    if (!attendee.seatId) {
      if (!attendee.reservationId)
        return { label: "—", room: null, spoken: "No seat yet" };
      const label = unspecifiedLabel ?? "No seat";
      return { label, room: null, spoken: `Seat: ${label}` };
    }
    const seat = seats.find((s) => s.id === attendee.seatId);
    if (!seat)
      return { label: "?", room: "Unknown seat", spoken: "Unknown seat" };
    const room = rooms.find((r) => r.id === seat.roomId)?.name ?? null;
    return {
      label: seat.label,
      room,
      spoken: room ? `Seat ${seat.label}, ${room}` : `Seat ${seat.label}`,
    };
  };

  // Handle edit - open wizard
  const handleEdit = (attendee: CombinedAttendeeData) => {
    const invitation: InvitationData = {
      eventId: event_id,
      email: attendee.email,
      avatarUrl: attendee.avatarUrl,
      handle: attendee.handle,
      invitedAt: attendee.invitedAt,
      respondedAt: attendee.respondedAt,
      response: attendee.response,
      attendance: attendee.attendance,
      lastModified: attendee.lastModified,
    };
    setEditingInvitation(invitation);
    setWizardOpen(true);
  };

  const handleWizardClose = () => {
    setWizardOpen(false);
    setEditingInvitation(undefined);
  };

  const handleWizardSaved = () => {
    fetchData(); // Refresh the data
  };

  // Handle delete invitation (after confirmation)
  const handleDeleteInvitation = async (email: string) => {
    setDeleting(true);
    try {
      const response = await fetch(
        `/api/events/${event_id}/invitations/${encodeURIComponent(
          email,
        )}?as_admin=true`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: "Bearer " + token,
          },
        },
      );

      if (response.status === 401) {
        signOut();
      } else if (response.status === 204) {
        enqueueSnackbar("Invitation deleted successfully", {
          variant: "success",
        });
        fetchData();
      } else {
        enqueueSnackbar("Unable to delete invitation", { variant: "error" });
      }
    } catch (error) {
      console.error("Error deleting:", error);
      enqueueSnackbar("Network error", { variant: "error" });
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  };

  // Handle resend invitation
  const handleResendInvitation = async (email: string) => {
    try {
      const response = await fetch(
        `/api/events/${event_id}/invitations/${encodeURIComponent(
          email,
        )}/resend?as_admin=true`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: "Bearer " + token,
          },
        },
      );

      if (response.status === 401) {
        signOut();
      } else if (response.status === 204) {
        enqueueSnackbar("Invitation resent successfully", {
          variant: "success",
        });
      } else {
        const error = await apiErrorFrom(
          "Unable to resend invitation",
          response,
        );
        enqueueSnackbar(
          userFacingReason(error) ?? "Unable to resend invitation",
          {
            variant: "error",
          },
        );
      }
    } catch (error) {
      console.error("Error resending:", error);
      enqueueSnackbar("Network error", { variant: "error" });
    }
  };

  // Send invitations handlers
  const handleSendDialogOpen = () => {
    setSendDialogOpen(true);
  };

  const handleSendDialogClose = () => {
    setSendDialogOpen(false);
    setEmailsValue("");
    setEmailsError(null);
    setSelectedEventId(0);
  };

  const handleEventSelect = (event: SelectChangeEvent<number | "">) => {
    const selectedId = event.target.value as number;
    setSelectedEventId(selectedId);

    if (selectedId && selectedId !== 0) {
      fetch(`/api/events/${selectedId}/invitations?as_admin=true`, {
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
              .then((data) => JSON.parse(data, dateParser) as InvitationData[]);
        })
        .then((data) => {
          if (data) {
            // Only people who aren't on this event's list yet.
            const existing = new Set(
              invitations.map((i) => i.email.toLowerCase()),
            );
            const emails = data
              .map((inv) => inv.email)
              .filter((e) => !existing.has(e.toLowerCase()))
              .join(", ");
            setEmailsValue(emails);
          }
        })
        .catch((error) => {
          console.error("Error fetching invitations:", error);
        });
    }
  };

  /**
   * POST one invitation per email. Returns true if all succeeded; otherwise
   * reports each failed address with the server's reason (in `setError`) and
   * leaves only those addresses in the field so they can be fixed and resent.
   */
  const sendInvites = async (
    raw: string,
    setValue: (value: string) => void,
    setError: (error: string | null) => void,
  ): Promise<boolean> => {
    const emails = parseEmailList(raw);

    if (emails.length === 0) {
      setError("Enter at least one email address.");
      return false;
    }
    const invalid = emails.filter((e) => !isValidEmail(e));
    if (invalid.length > 0) {
      setError(
        invalid.length === 1
          ? `${invalid[0]} isn't a valid email address.`
          : `These aren't valid email addresses: ${invalid.join(", ")}.`,
      );
      return false;
    }
    setError(null);

    const results = await Promise.allSettled(
      emails.map(async (email) => {
        const response = await fetch(
          `/api/events/${event_id}/invitations?as_admin=true`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              Authorization: "Bearer " + token,
            },
            body: JSON.stringify({ email }),
          },
        );
        if (response.status === 401) {
          signOut();
          throw new ApiError("Signed out", 401);
        }
        if (!response.ok)
          throw await apiErrorFrom("Couldn't send the invitation", response);
      }),
    );

    if (results.some((r) => r.status === "rejected" && isSignOut(r.reason)))
      return false;

    const failures = emails.flatMap((email, i) => {
      const r = results[i];
      if (r.status === "fulfilled") return [];
      const status = r.reason instanceof ApiError ? r.reason.status : 0;
      // Expected failures are explained inline; only log the unexpected.
      if (status === 0 || (status >= 500 && status !== 502))
        console.error("Error sending invitation:", r.reason);
      const reason = inviteFailureReason(r.reason);
      return [
        {
          email,
          // 502: the invitation was saved, only its email failed.
          saved: status === 502,
          message: reason.toLowerCase().includes(email.toLowerCase())
            ? sentence(reason)
            : `${email}: ${sentence(reason)}`,
        },
      ];
    });
    const sent = emails.filter((_, i) => results[i].status === "fulfilled");

    if (sent.length > 0) {
      enqueueSnackbar(
        sent.length === 1
          ? `Invitation sent to ${sent[0]}`
          : `${sent.length} invitations sent`,
        { variant: "success" },
      );
    }
    if (sent.length > 0 || failures.some((f) => f.saved)) fetchData();
    if (failures.length === 0) return true;

    // Keep only the addresses that still need sending, to fix and retry.
    setValue(
      failures
        .filter((f) => !f.saved)
        .map((f) => f.email)
        .join(", "),
    );
    setError(failures.map((f) => f.message).join(" "));
    return false;
  };

  const handleInlineInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviting(true);
    if (await sendInvites(inviteValue, setInviteValue, setInviteError))
      setInviteValue("");
    setInviting(false);
  };

  const handleSendInvitations = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await sendInvites(emailsValue, setEmailsValue, setEmailsError))
      handleSendDialogClose();
  };

  const renderAttendance = (attendee: CombinedAttendeeData) => {
    const { attendance, response } = attendee;
    if (!attendance || attendance.length === 0 || response === RSVP.no)
      return (
        <Box component="span" sx={{ color: colors.textDim, fontSize: 13 }}>
          —
        </Box>
      );
    return (
      <AttendancePips
        attendance={attendance}
        tone={response === RSVP.maybe ? "amber" : "lime"}
        description={getAttendanceDescription(
          attendance,
          props.event.timeBegin,
          props.event.timeEnd,
        )}
      />
    );
  };

  const header = (
    <Box
      sx={{
        p: "16px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 1.5,
        borderBottom: `1px solid ${hairline.soft}`,
      }}
    >
      <Box
        component="form"
        onSubmit={handleInlineInvite}
        noValidate
        aria-label="Invite gamers"
        sx={{ display: "flex", flexWrap: "wrap", gap: 1.25 }}
      >
        <TextField
          type="email"
          name="invite"
          value={inviteValue}
          onChange={(e) => {
            setInviteValue(e.target.value);
            if (inviteError) setInviteError(null);
          }}
          placeholder="Invite by email"
          required
          error={inviteError !== null}
          slotProps={{
            htmlInput: {
              "aria-label": "Invite by email",
              "aria-invalid": inviteError !== null,
              "aria-describedby": inviteError
                ? `${uid}-invite-error ${uid}-invite-help`
                : `${uid}-invite-help`,
              multiple: true,
            },
          }}
          sx={{
            flex: "1 1 240px",
            "& .MuiOutlinedInput-root": { backgroundColor: "rgba(6,7,11,0.6)" },
          }}
        />
        <Button
          type="submit"
          variant="contained"
          disabled={inviting}
          startIcon={<PersonAddSharp />}
        >
          {inviting ? "Inviting…" : "Invite"}
        </Button>
        <Button
          variant="outlined"
          onClick={handleSendDialogOpen}
          startIcon={<ContentCopySharp />}
        >
          Copy from event
        </Button>
      </Box>
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          gap: 1,
        }}
      >
        {inviteError && (
          <Typography
            id={`${uid}-invite-error`}
            role="alert"
            sx={{
              flexBasis: "100%",
              fontSize: 13,
              color: colors.pinkText,
              overflowWrap: "anywhere",
            }}
          >
            {inviteError}
          </Typography>
        )}
        <Typography
          id={`${uid}-invite-help`}
          sx={{ fontSize: 13, color: colors.textMuted }}
        >
          Separate several emails with commas. Each gets an invite email.
        </Typography>
        {!loading && totals.invited > 0 && (
          <Box
            component="p"
            sx={{
              ...mono,
              m: 0,
              fontSize: 12,
              letterSpacing: "0.1em",
              color: colors.textMuted,
            }}
          >
            {totals.invited} INVITED · {totals.yes} IN · {totals.maybe} MAYBE ·{" "}
            {totals.no} OUT · {totals.pending} PENDING
          </Box>
        )}
      </Box>
    </Box>
  );

  let content: React.ReactNode;
  if (loading) {
    content = (
      <Box aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <Box
            key={i}
            sx={{
              display: "flex",
              gap: 2,
              alignItems: "center",
              p: "12px 20px",
              borderBottom: `1px solid ${hairline.faint}`,
            }}
          >
            <Skeleton variant="rectangular" width={36} height={36} />
            <Box sx={{ flex: 1 }}>
              <Skeleton width="30%" />
              <Skeleton width="45%" />
            </Box>
          </Box>
        ))}
      </Box>
    );
  } else if (loadError) {
    content = (
      <Box
        role="alert"
        sx={{
          p: 4,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 1.5,
          color: colors.pinkText,
        }}
      >
        Couldn&apos;t load the roster.
        <Button variant="outlined" size="small" onClick={fetchData}>
          Retry
        </Button>
      </Box>
    );
  } else if (combinedData.length === 0) {
    content = (
      <EmptyState
        icon={<GroupSharp />}
        title="Nobody invited yet"
        description="Invite people by email above, or copy the list from a previous event."
      />
    );
  } else {
    content = (
      <Box component="ul" aria-label="Invitees" sx={{ m: 0, p: 0 }}>
        {combinedData.map((attendee) => {
          const st = rsvpStatus(attendee.response);
          const seat = getSeat(attendee);
          const name = attendee.handle || attendee.email;
          return (
            <Box
              component="li"
              key={attendee.email}
              sx={{
                listStyle: "none",
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: "10px 18px",
                p: "12px 20px",
                borderBottom: `1px solid ${hairline.faint}`,
                "&:hover": { backgroundColor: tint("cyan", 0.03) },
              }}
            >
              <Box
                sx={{
                  flex: "1 1 220px",
                  minWidth: 0,
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                }}
              >
                <UserAvatar name={name} src={attendee.avatarUrl} size={36} />
                <Box
                  sx={{
                    minWidth: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: "2px",
                  }}
                >
                  <Typography
                    component="span"
                    sx={{
                      fontSize: 15,
                      fontWeight: 600,
                      color: attendee.handle ? colors.text : colors.textMuted,
                      overflowWrap: "anywhere",
                    }}
                  >
                    {attendee.handle || "No callsign yet"}
                  </Typography>
                  <Box
                    component="span"
                    title={attendee.email}
                    sx={{
                      ...mono,
                      fontSize: 12,
                      color: colors.textMuted,
                      overflowWrap: "anywhere",
                    }}
                  >
                    {attendee.email}
                  </Box>
                </Box>
              </Box>
              <Box
                component="span"
                sx={{
                  ...mono,
                  width: 80,
                  fontSize: 11,
                  letterSpacing: "0.12em",
                  color: tones[st.tone].fg,
                }}
              >
                {st.label}
              </Box>
              <Box sx={{ width: 120, display: "flex" }}>
                {renderAttendance(attendee)}
              </Box>
              <Box
                sx={{
                  width: 96,
                  minWidth: 0,
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <Box component="span" sx={srOnly}>
                  {seat.spoken}
                </Box>
                <Box
                  component="span"
                  aria-hidden="true"
                  sx={{
                    ...mono,
                    fontSize: 13,
                    fontWeight: 600,
                    color: colors.text,
                    overflowWrap: "anywhere",
                  }}
                >
                  {seat.label}
                </Box>
                {seat.room && (
                  <Box
                    component="span"
                    aria-hidden="true"
                    sx={{
                      fontSize: 12,
                      color: colors.textMuted,
                      overflowWrap: "anywhere",
                    }}
                  >
                    {seat.room}
                  </Box>
                )}
              </Box>
              <Tooltip
                title={
                  <Box>
                    <Box>Invited: {attendee.invitedAt.calendar()}</Box>
                    {attendee.respondedAt && (
                      <Box>Responded: {attendee.respondedAt.calendar()}</Box>
                    )}
                    <Box>Last modified: {attendee.lastModified.calendar()}</Box>
                    {attendee.reservationLastModified && (
                      <Box>
                        Seat modified:{" "}
                        {attendee.reservationLastModified.calendar()}
                      </Box>
                    )}
                  </Box>
                }
              >
                <Box
                  component="time"
                  dateTime={attendee.lastModified.toISOString()}
                  sx={{
                    ...mono,
                    width: 110,
                    fontSize: 12,
                    color: colors.textMuted,
                    cursor: "help",
                  }}
                >
                  <Box component="span" sx={srOnly}>
                    Last updated{" "}
                  </Box>
                  {attendee.lastModified.fromNow()}
                  <Box component="span" sx={srOnly}>
                    {`, ${attendee.lastModified.format("ddd D MMM, HH:mm")}`}
                  </Box>
                </Box>
              </Tooltip>
              <Box sx={{ display: "flex", gap: "6px", ml: "auto" }}>
                {!attendee.response && (
                  <RowAction
                    label={`Resend invite to ${attendee.email}`}
                    onClick={() => handleResendInvitation(attendee.email)}
                  >
                    <ForwardToInboxSharp />
                  </RowAction>
                )}
                <RowAction
                  label={`Edit RSVP for ${attendee.email}`}
                  onClick={() => handleEdit(attendee)}
                >
                  <EditSharp />
                </RowAction>
                <RowAction
                  label={`Remove ${attendee.email}`}
                  danger
                  onClick={() => setPendingDelete(attendee.email)}
                >
                  <PersonRemoveSharp />
                </RowAction>
              </Box>
            </Box>
          );
        })}
      </Box>
    );
  }

  return (
    <React.Fragment>
      <Box
        component="section"
        aria-label="Invitations and seat assignments"
        aria-busy={loading}
        sx={{
          border: `1px solid ${hairline.panel}`,
          backgroundColor: colors.surface,
          minWidth: 0,
        }}
      >
        {header}
        {content}
      </Box>

      {/* Copy invitations from another event */}
      <Dialog
        open={sendDialogOpen}
        onClose={handleSendDialogClose}
        maxWidth="sm"
        fullWidth
      >
        <Box component="form" noValidate onSubmit={handleSendInvitations}>
          <DialogTitle>Send invitations</DialogTitle>
          <DialogContent>
            <DialogContentText sx={{ mb: 2 }}>
              Invite gamers here! Pick a previous event to copy its guest list,
              or type email addresses separated by commas.
            </DialogContentText>

            <FormControl fullWidth margin="dense">
              <InputLabel id={`${uid}-event-select-label`}>
                Pre-fill from another event (optional)
              </InputLabel>
              <Select
                labelId={`${uid}-event-select-label`}
                id={`${uid}-event-select`}
                value={selectedEventId}
                label="Pre-fill from another event (optional)"
                onChange={handleEventSelect}
              >
                <MenuItem value={0}>
                  <em>None</em>
                </MenuItem>
                {availableEvents.map((evt) => (
                  <MenuItem key={evt.id} value={evt.id}>
                    {evt.title} ({evt.timeBegin.format("MMM D, YYYY")})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              id={`${uid}-emails`}
              name="emails"
              label="Emails"
              type="text"
              autoFocus
              required
              margin="dense"
              fullWidth
              multiline
              minRows={2}
              value={emailsValue}
              onChange={(e) => {
                setEmailsValue(e.target.value);
                if (emailsError) setEmailsError(null);
              }}
              error={emailsError !== null}
              helperText={emailsError ?? "Separate multiple emails with commas"}
              slotProps={{
                formHelperText: emailsError ? { role: "alert" } : undefined,
              }}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={handleSendDialogClose} color="inherit">
              Cancel
            </Button>
            <Button type="submit" variant="contained">
              Send
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Remove invitation?"
        confirmLabel="Remove"
        busy={deleting}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && handleDeleteInvitation(pendingDelete)}
      >
        Remove <strong>{pendingDelete}</strong> from this event? Their RSVP is
        removed too.
      </ConfirmDialog>

      {/* RSVP Wizard for editing */}
      <RSVPWizard
        open={wizardOpen}
        onClose={handleWizardClose}
        event={props.event}
        initialData={editingInvitation}
        onSaved={handleWizardSaved}
        asAdmin={true}
      />
    </React.Fragment>
  );
}
