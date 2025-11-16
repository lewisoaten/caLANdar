import * as React from "react";
import { useState, useEffect, useContext } from "react";
import {
  Card,
  CardContent,
  Typography,
  Button,
  Stack,
  Box,
  Chip,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import HelpIcon from "@mui/icons-material/Help";
import EventSeatIcon from "@mui/icons-material/EventSeat";
import { RSVP, InvitationData } from "../../types/invitations";
import { EventData } from "../../types/events";
import { getAttendanceDescription } from "../../utils/attendanceDescription";
import { UserContext, UserDispatchContext } from "../../UserProvider";

interface RSVPSummaryProps {
  invitation: InvitationData;
  event: EventData;
  onEdit: () => void;
  disabled?: boolean;
}

export default function RSVPSummary(props: RSVPSummaryProps) {
  const { invitation } = props;
  const { signOut } = useContext(UserDispatchContext);
  const userDetails = useContext(UserContext);
  const token = userDetails?.token;

  const [seatLabel, setSeatLabel] = useState<string | null>(null);
  const [seatRoomName, setSeatRoomName] = useState<string | null>(null);
  const [hasSeating, setHasSeating] = useState(false);

  // Fetch seating config and seat reservation
  useEffect(() => {
    if (!props.event.id || !token) return;

    // Fetch seating config
    fetch(`/api/events/${props.event.id}/seating-config?as_admin=true`, {
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
        if (data) {
          setHasSeating(data.hasSeating || false);
          const unspecifiedLabel =
            data.unspecifiedSeatLabel || "Unspecified Seat";
          const allowUnspecifiedSeat = data.allowUnspecifiedSeat || false;

          // If seating is enabled and user has responded, fetch seat reservation
          if (
            data.hasSeating &&
            invitation.response &&
            invitation.response !== RSVP.no
          ) {
            fetch(`/api/events/${props.event.id}/seat-reservations/me`, {
              headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                Authorization: "Bearer " + token,
              },
            })
              .then((response) => {
                if (response.status === 404) {
                  // No reservation - if optional seating, default to unspecified
                  if (allowUnspecifiedSeat) {
                    setSeatLabel(unspecifiedLabel);
                    setSeatRoomName(null);
                  } else {
                    setSeatLabel(null);
                    setSeatRoomName(null);
                  }
                  return null;
                }
                if (response.ok) return response.json();
                return null;
              })
              .then((reservationData) => {
                if (reservationData) {
                  if (reservationData.seatId === null) {
                    setSeatLabel(unspecifiedLabel);
                    setSeatRoomName(null);
                  } else if (reservationData.seatId) {
                    // Fetch seat label and room
                    fetch(
                      `/api/events/${props.event.id}/seats/${reservationData.seatId}`,
                      {
                        headers: {
                          "Content-Type": "application/json",
                          Accept: "application/json",
                          Authorization: "Bearer " + token,
                        },
                      },
                    )
                      .then((response) => {
                        if (response.ok) return response.json();
                        return null;
                      })
                      .then((seatData) => {
                        if (seatData?.label) {
                          setSeatLabel(seatData.label);
                          // Fetch room name
                          if (seatData.roomId) {
                            fetch(
                              `/api/events/${props.event.id}/rooms/${seatData.roomId}`,
                              {
                                headers: {
                                  "Content-Type": "application/json",
                                  Accept: "application/json",
                                  Authorization: "Bearer " + token,
                                },
                              },
                            )
                              .then((response) => {
                                if (response.ok) return response.json();
                                return null;
                              })
                              .then((roomData) => {
                                if (roomData?.name) {
                                  setSeatRoomName(roomData.name);
                                }
                              })
                              .catch((error) => {
                                console.error("Error fetching room:", error);
                              });
                          }
                        }
                      })
                      .catch((error) => {
                        console.error("Error fetching seat:", error);
                      });
                  }
                } else if (allowUnspecifiedSeat) {
                  // No reservation but optional seating - default to unspecified
                  setSeatLabel(unspecifiedLabel);
                  setSeatRoomName(null);
                }
              })
              .catch((error) => {
                console.error("Error fetching seat reservation:", error);
              });
          }
        }
      })
      .catch((error) => {
        console.error("Error fetching seating config:", error);
      });
  }, [props.event.id, token, invitation.response, signOut]);

  const getResponseColor = (response: RSVP | null) => {
    switch (response) {
      case RSVP.yes:
        return "success";
      case RSVP.maybe:
        return "warning";
      case RSVP.no:
        return "error";
      default:
        return "default";
    }
  };

  const getResponseIcon = (response: RSVP | null) => {
    switch (response) {
      case RSVP.yes:
        return <CheckCircleIcon />;
      case RSVP.maybe:
        return <HelpIcon />;
      case RSVP.no:
        return <CancelIcon />;
      default:
        return <HelpIcon />;
    }
  };

  const getResponseText = (response: RSVP | null) => {
    switch (response) {
      case RSVP.yes:
        return "Yes";
      case RSVP.maybe:
        return "Maybe";
      case RSVP.no:
        return "No";
      default:
        return "Not Responded";
    }
  };

  const getAttendanceText = (attendance: number[] | null) => {
    return getAttendanceDescription(
      attendance,
      props.event.timeBegin,
      props.event.timeEnd,
    );
  };

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={2}>
          <Box
            display="flex"
            justifyContent="space-between"
            alignItems="center"
          >
            <Typography variant="h6" component="h2">
              Your RSVP
            </Typography>
            <Button
              startIcon={<EditIcon />}
              onClick={props.onEdit}
              disabled={props.disabled}
              variant="outlined"
              size="small"
            >
              Edit
            </Button>
          </Box>

          <Box display="flex" alignItems="center" gap={1}>
            <Chip
              icon={getResponseIcon(invitation.response)}
              label={getResponseText(invitation.response)}
              color={getResponseColor(invitation.response)}
              size="medium"
            />
          </Box>

          {invitation.response && invitation.response !== RSVP.no && (
            <>
              {invitation.handle && (
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Handle
                  </Typography>
                  <Typography variant="body1">{invitation.handle}</Typography>
                </Box>
              )}

              <Box>
                <Typography variant="body2" color="text.secondary">
                  Attendance
                </Typography>
                <Typography variant="body1">
                  {getAttendanceText(invitation.attendance)}
                </Typography>
              </Box>

              {hasSeating && seatLabel && (
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    <EventSeatIcon
                      fontSize="small"
                      sx={{ verticalAlign: "middle", mr: 0.5 }}
                    />
                    Seat
                  </Typography>
                  <Typography variant="body1">
                    {seatRoomName
                      ? `${seatRoomName} - ${seatLabel}`
                      : seatLabel}
                  </Typography>
                </Box>
              )}
            </>
          )}

          {!invitation.response && (
            <Typography variant="body2" color="text.secondary">
              You haven&apos;t responded to this event yet. Click
              &quot;Edit&quot; to RSVP.
            </Typography>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
