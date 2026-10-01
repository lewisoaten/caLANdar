import * as React from "react";
import { useState, useEffect, useContext } from "react";
import { Link as RouterLink } from "react-router-dom";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Link from "@mui/material/Link";
import Skeleton from "@mui/material/Skeleton";
import Typography from "@mui/material/Typography";
import EditSharp from "@mui/icons-material/EditSharp";
import VerifiedSharp from "@mui/icons-material/VerifiedSharp";
import HelpOutlineSharp from "@mui/icons-material/HelpOutlineSharp";
import BlockSharp from "@mui/icons-material/BlockSharp";
import MarkEmailUnreadSharp from "@mui/icons-material/MarkEmailUnreadSharp";
import { RSVP, InvitationData } from "../../types/invitations";
import { EventData } from "../../types/events";
import { UserContext, UserDispatchContext } from "../../UserProvider";
import { displayCallsign } from "../../utils/callsign";
import {
  bracket,
  colors,
  fonts,
  hairline,
  srOnly,
  tint,
  tones,
  type HlTone,
} from "../hl";
import AttendanceStrip from "../AttendanceStrip";
import { ownDeskLabel } from "../seatFloorPlanModel";
import {
  SessionExpiredError,
  fetchReservation,
  fetchSeatLabel,
} from "./ownSeat";
import {
  RSVP_STATUS,
  attendanceCells,
  rsvpState,
  type RsvpState,
} from "../lobbyModel";

interface RSVPSummaryProps {
  invitation: InvitationData;
  event: EventData;
  onEdit: () => void;
  disabled?: boolean;
}

const STATUS_ICON: Record<RsvpState, React.ElementType> = {
  yes: VerifiedSharp,
  maybe: HelpOutlineSharp,
  no: BlockSharp,
  none: MarkEmailUnreadSharp,
};

const fieldLabel = {
  fontFamily: fonts.mono,
  fontSize: 10,
  letterSpacing: "0.18em",
  color: colors.textDim,
  textTransform: "uppercase",
} as const;

/** The lobby's "Your RSVP" panel: status, callsign, seat, attendance and CTA. */
export default function RSVPSummary(props: RSVPSummaryProps) {
  const { invitation } = props;
  const { signOut } = useContext(UserDispatchContext);
  const userDetails = useContext(UserContext);
  const token = userDetails?.token;

  const [seatLabel, setSeatLabel] = useState<string | null>(null);
  const [seatRoomName, setSeatRoomName] = useState<string | null>(null);
  const [seatLoading, setSeatLoading] = useState(false);
  const [hasSeating, setHasSeating] = useState(false);
  // Bumped whenever an RSVP is saved, so a changed seat shows even when the
  // answer itself (and so `invitation.response`) didn't change.
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const onUpdate = () => setRefreshKey((k) => k + 1);
    window.addEventListener("calandar:rsvp-updated", onUpdate);
    return () => window.removeEventListener("calandar:rsvp-updated", onUpdate);
  }, []);

  // Fetch seating config and seat reservation
  useEffect(() => {
    if (!props.event.id || !token) return;
    const controller = new AbortController();
    const { signal } = controller;
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: "Bearer " + token,
    };
    const going =
      invitation.response === RSVP.yes || invitation.response === RSVP.maybe;

    (async () => {
      try {
        const cfgRes = await fetch(
          `/api/events/${props.event.id}/seating-config`,
          { headers, signal },
        );
        if (cfgRes.status === 401) throw new SessionExpiredError();
        if (!cfgRes.ok) return;
        const cfg = await cfgRes.json();
        if (signal.aborted) return;
        setHasSeating(Boolean(cfg.hasSeating));
        if (!cfg.hasSeating || !going) return;

        setSeatLoading(true);
        const reservation = await fetchReservation(
          props.event.id,
          headers,
          undefined,
          signal,
        );
        if (signal.aborted) return;
        if (!reservation.exists) {
          setSeatLabel(null);
          setSeatRoomName(null);
        } else if (reservation.seatId === null) {
          setSeatLabel(ownDeskLabel(cfg.unspecifiedSeatLabel));
          setSeatRoomName(null);
        } else {
          const seat = await fetchSeatLabel(
            props.event.id,
            reservation.seatId,
            headers,
            signal,
          );
          if (signal.aborted) return;
          setSeatLabel(seat.label);
          setSeatRoomName(seat.roomName);
        }
      } catch (error) {
        if (signal.aborted) return;
        if (error instanceof SessionExpiredError) signOut();
        else console.error("Error fetching seat reservation:", error);
      } finally {
        if (!signal.aborted) setSeatLoading(false);
      }
    })();
    return () => controller.abort();
  }, [props.event.id, token, invitation.response, refreshKey, signOut]);

  const state = rsvpState(invitation.response);
  const status = RSVP_STATUS[state];
  const tone: HlTone = status.tone;
  const Icon = STATUS_ICON[state];
  const going = state === "yes" || state === "maybe";
  const { cells } = attendanceCells(
    invitation.attendance,
    props.event.timeBegin,
    props.event.timeEnd,
  );
  const attended = cells.filter((c) => c.on).length;

  const seatText = seatLabel
    ? seatRoomName
      ? `${seatLabel} · ${seatRoomName}`
      : seatLabel
    : "No seat yet";

  return (
    <Box
      component="section"
      aria-labelledby="rsvp-summary-title"
      sx={{
        position: "relative",
        border: `1px solid ${hairline.panel}`,
        backgroundColor: "rgba(12,15,24,0.82)",
        ...bracket({ both: true }),
        p: "clamp(18px, 2.4vw, 28px)",
        display: "flex",
        flexWrap: "wrap",
        gap: "24px 40px",
        alignItems: "center",
      }}
    >
      <Box
        sx={{
          flex: "1 1 240px",
          display: "flex",
          flexDirection: "column",
          gap: "6px",
        }}
      >
        <Typography
          id="rsvp-summary-title"
          component="h2"
          sx={{
            m: 0,
            fontFamily: fonts.mono,
            fontSize: 11,
            fontWeight: 400,
            letterSpacing: "0.18em",
            color: colors.textDim,
          }}
        >
          <span aria-hidden="true">{"// "}</span>YOUR RSVP
        </Typography>
        <Box
          role="status"
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            color: tones[tone].fg,
          }}
        >
          <Icon aria-hidden="true" sx={{ fontSize: 30 }} />
          <Typography
            component="p"
            sx={{
              m: 0,
              fontSize: "clamp(26px, 3vw, 34px)",
              fontWeight: 700,
              letterSpacing: "0.02em",
              textTransform: "uppercase",
              lineHeight: 1.1,
              color: "inherit",
            }}
          >
            {status.text}
          </Typography>
        </Box>
        <Typography
          component="p"
          sx={{ m: 0, fontSize: 15, color: colors.textMuted, lineHeight: 1.5 }}
        >
          {props.disabled
            ? "This event has ended, so RSVPs are closed."
            : status.sub}
        </Typography>
      </Box>

      {going && (
        <>
          <Box
            component="dl"
            sx={{
              m: 0,
              flex: "0 1 auto",
              display: "flex",
              flexWrap: "wrap",
              gap: "12px 28px",
              "& dd": { m: 0 },
            }}
          >
            <Box sx={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <Box component="dt" sx={fieldLabel}>
                Callsign
              </Box>
              <Box
                component="dd"
                sx={{
                  fontSize: 18,
                  fontWeight: 600,
                  overflowWrap: "anywhere",
                }}
              >
                {displayCallsign(invitation.handle)}
              </Box>
            </Box>
            {hasSeating && (
              <Box
                sx={{ display: "flex", flexDirection: "column", gap: "4px" }}
              >
                <Box component="dt" sx={fieldLabel}>
                  Seat
                </Box>
                <Box component="dd" sx={{ fontSize: 18, fontWeight: 600 }}>
                  {seatLoading ? (
                    <Skeleton width={90} aria-label="Loading seat" />
                  ) : (
                    <Link
                      component={RouterLink}
                      to={`/events/${props.event.id}/seat-map`}
                      sx={{
                        color: colors.cyan,
                        textDecorationColor: tint("cyan", 0.4),
                        textUnderlineOffset: "4px",
                        display: "inline-flex",
                        alignItems: "center",
                        minHeight: 44,
                      }}
                    >
                      {seatText}
                      <Box component="span" sx={srOnly}>
                        {" "}
                        (open seat map)
                      </Box>
                    </Link>
                  )}
                </Box>
              </Box>
            )}
          </Box>
          {cells.length > 0 && (
            <Box
              sx={{
                flex: "1 1 320px",
                display: "flex",
                flexDirection: "column",
                gap: 1,
              }}
            >
              <Box component="span" sx={fieldLabel} aria-hidden="true">
                Attendance · {attended}/{cells.length} blocks
              </Box>
              <AttendanceStrip
                attendance={invitation.attendance}
                timeBegin={props.event.timeBegin}
                timeEnd={props.event.timeEnd}
                tone={state === "maybe" ? "amber" : "lime"}
                size="lg"
                label={`Attendance, ${attended} of ${cells.length} blocks`}
              />
            </Box>
          )}
        </>
      )}

      <Box sx={{ flex: "0 0 auto", display: "flex", gap: 1.25 }}>
        {state === "none" ? (
          <Button
            variant="contained"
            size="large"
            onClick={props.onEdit}
            disabled={props.disabled}
            sx={{ px: "28px", fontSize: 15 }}
          >
            {status.cta}
          </Button>
        ) : (
          <Button
            variant="outlined"
            onClick={props.onEdit}
            disabled={props.disabled}
            startIcon={<EditSharp />}
          >
            {status.cta}
          </Button>
        )}
      </Box>
    </Box>
  );
}
