import * as React from "react";
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
import { RSVP, InvitationData } from "../../types/invitations";

interface RSVPSummaryProps {
  invitation: InvitationData;
  onEdit: () => void;
  disabled?: boolean;
}

export default function RSVPSummary(props: RSVPSummaryProps) {
  const { invitation } = props;

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
    if (!attendance || attendance.length === 0) {
      return "No attendance selected";
    }
    const selectedCount = attendance.filter((v) => v === 1).length;
    return `${selectedCount} time slot${selectedCount !== 1 ? "s" : ""}`;
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
