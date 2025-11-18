import * as React from "react";
import { Typography, Stack, Card, CardContent, Grid, Box } from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import HelpIcon from "@mui/icons-material/Help";
import PersonIcon from "@mui/icons-material/Person";
import EventIcon from "@mui/icons-material/Event";
import EventSeatIcon from "@mui/icons-material/EventSeat";
import { RSVP } from "../../types/invitations";
import moment from "moment";
import { getAttendanceDescription } from "../../utils/attendanceDescription";

interface ReviewStepProps {
  response: RSVP | null;
  handle: string;
  attendance: number[] | null;
  timeBegin: moment.Moment;
  timeEnd: moment.Moment;
  seatLabel?: string | null;
  seatRoomName?: string | null;
  hasSeating: boolean;
}

export default function ReviewStep(props: ReviewStepProps) {
  const getResponseIcon = (response: RSVP | null) => {
    switch (response) {
      case RSVP.yes:
        return <CheckCircleIcon color="success" />;
      case RSVP.maybe:
        return <HelpIcon color="warning" />;
      case RSVP.no:
        return <CancelIcon color="error" />;
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
        return "Not set";
    }
  };

  const getAttendanceText = (
    attendance: number[] | null,
    timeBegin: moment.Moment,
    timeEnd: moment.Moment,
  ) => {
    return getAttendanceDescription(attendance, timeBegin, timeEnd);
  };

  return (
    <Stack spacing={3}>
      <Typography variant="h6" component="h2">
        Review your RSVP
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Please review your response before confirming.
      </Typography>

      <Card variant="outlined">
        <CardContent>
          <Grid container spacing={2}>
            <Grid size={12}>
              <Box display="flex" alignItems="center" gap={1}>
                {getResponseIcon(props.response)}
                <Typography variant="body1" component="span">
                  <strong>Response:</strong> {getResponseText(props.response)}
                </Typography>
              </Box>
            </Grid>

            {props.response !== RSVP.no && (
              <>
                <Grid size={12}>
                  <Box display="flex" alignItems="center" gap={1}>
                    <PersonIcon color="primary" />
                    <Typography variant="body1" component="span">
                      <strong>Handle:</strong> {props.handle || "Not set"}
                    </Typography>
                  </Box>
                </Grid>

                <Grid size={12}>
                  <Box display="flex" alignItems="center" gap={1}>
                    <EventIcon color="primary" />
                    <Typography variant="body1" component="span">
                      <strong>Attendance:</strong>{" "}
                      {getAttendanceText(
                        props.attendance,
                        props.timeBegin,
                        props.timeEnd,
                      )}
                    </Typography>
                  </Box>
                </Grid>

                {props.hasSeating && (
                  <Grid size={12}>
                    <Box display="flex" alignItems="center" gap={1}>
                      <EventSeatIcon color="primary" />
                      <Typography variant="body1" component="span">
                        <strong>Seat:</strong>{" "}
                        {props.seatLabel !== null &&
                        props.seatLabel !== undefined
                          ? props.seatRoomName
                            ? `${props.seatRoomName} - ${props.seatLabel}`
                            : props.seatLabel
                          : "Not selected"}
                      </Typography>
                    </Box>
                  </Grid>
                )}
              </>
            )}
          </Grid>
        </CardContent>
      </Card>

      {props.response !== RSVP.no && (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ fontStyle: "italic" }}
        >
          After confirming, you&apos;ll be able to view attendees and suggest
          games.
        </Typography>
      )}
    </Stack>
  );
}
