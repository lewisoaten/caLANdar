import * as React from "react";
import { useState, useEffect, useContext } from "react";
import {
  Container,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TextField,
  MenuItem,
  Stack,
  Typography,
  CircularProgress,
  Alert,
} from "@mui/material";
import { UserContext } from "../UserProvider";
import { DateTimePicker } from "@mui/x-date-pickers/DateTimePicker";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterMoment } from "@mui/x-date-pickers/AdapterMoment";
import moment, { Moment } from "moment";

interface AuditLogEntry {
  id: number;
  timestamp: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
}

interface AuditLogsResponse {
  logs: AuditLogEntry[];
  totalCount: number;
  limit: number;
  offset: number;
}

const entityTypes = [
  { value: "", label: "All" },
  { value: "auth", label: "Authentication" },
  { value: "event", label: "Events" },
  { value: "event_seating_config", label: "Event Seating Config" },
  { value: "invitation", label: "Invitations" },
  { value: "email", label: "Emails" },
  { value: "rsvp", label: "RSVPs" },
  { value: "seat_reservation", label: "Seat Reservations" },
  { value: "room", label: "Rooms" },
  { value: "seat", label: "Seats" },
  { value: "game_suggestion", label: "Game Suggestions" },
  { value: "game_vote", label: "Game Votes" },
  { value: "profile", label: "Profiles" },
  { value: "steam_games", label: "Steam Games" },
];

const getActionDescription = (log: AuditLogEntry): string => {
  const parts = log.action.split(".");
  const entity = parts[0];
  const action = parts[1];

  let description = "";

  switch (entity) {
    case "auth":
      description = "User logged in";
      break;
    case "event":
      if (action === "create") {
        const title = (log.metadata?.title as string) || "Unknown";
        description = `Created event "${title}"`;
      } else if (action === "update") {
        const title = (log.metadata?.title as string) || "Unknown";
        description = `Updated event "${title}"`;
      } else if (action === "delete") {
        description = `Deleted event`;
      }
      break;
    case "event_seating_config":
      if (action === "update") {
        const hasSeating = log.metadata?.has_seating as boolean;
        const allowUnspecified = log.metadata
          ?.allow_unspecified_seat as boolean;
        const label = log.metadata?.unspecified_seat_label as string;
        description = `Updated seating config: seating ${
          hasSeating ? "enabled" : "disabled"
        }`;
        if (hasSeating && allowUnspecified) {
          description += `, unspecified seat allowed (${label})`;
        }
      }
      break;
    case "invitation":
      if (action === "create") {
        const email = (log.metadata?.invited_email as string) || "unknown";
        description = `Created invitation for ${email}`;
      } else if (action === "delete") {
        const email = (log.metadata?.deleted_email as string) || "unknown";
        description = `Deleted invitation for ${email}`;
      }
      break;
    case "rsvp":
      if (action === "update") {
        const response = (log.metadata?.response as string) || "Unknown";
        const attendance = (log.metadata?.attendance as string) || "none";
        const handle = (log.metadata?.handle as string) || "N/A";
        const seatCleared = log.metadata?.seat_cleared as boolean;
        const isAdminUpdate = log.metadata?.admin_update as boolean;
        const targetEmail = log.metadata?.target_email as string;

        const parts = [`${response}`];
        if (attendance !== "none") {
          parts.push(attendance);
        }
        if (handle !== "N/A") {
          parts.push(`handle: ${handle}`);
        }

        let baseDescription = `Updated RSVP: ${parts.join(", ")}`;
        if (isAdminUpdate && targetEmail) {
          baseDescription = `Admin updated RSVP for ${targetEmail}: ${parts.join(
            ", ",
          )}`;
        }
        if (seatCleared) {
          baseDescription += " (seat cleared)";
        }
        description = baseDescription;
      }
      break;
    case "game_suggestion":
      if (action === "create") {
        const gameName = log.metadata?.game_name as string | undefined;
        const gameId = (log.metadata?.game_id as string) || "Unknown";
        const comment = log.metadata?.comment as string | undefined;
        const gameDisplay = gameName || `game (ID: ${gameId})`;
        const commentDisplay = comment ? ` - "${comment}"` : "";
        description = `Suggested game: ${gameDisplay}${commentDisplay}`;
      }
      break;
    case "game_vote":
      if (action === "update") {
        const gameName = log.metadata?.game_name as string | undefined;
        const gameId = (log.metadata?.game_id as string) || "Unknown";
        const vote = (log.metadata?.vote as string) || "Unknown";
        const gameDisplay = gameName || `game (ID: ${gameId})`;
        description = `Voted ${vote} on ${gameDisplay}`;
      }
      break;
    case "email":
      if (action === "send") {
        const emailType = log.metadata?.email_type as string | undefined;
        const recipientEmail = log.metadata?.recipient_email as
          | string
          | undefined;
        const recipientCount = log.metadata?.recipient_count as
          | number
          | undefined;
        const subject = log.metadata?.subject as string | undefined;

        if (emailType === "invitation_resend") {
          description = `Resent invitation email to ${recipientEmail}`;
        } else if (emailType === "custom") {
          description = `Sent custom email to ${recipientCount} recipients: "${subject}"`;
        } else {
          description = `Sent email`;
        }
      }
      break;
    case "room":
      if (action === "create") {
        const name = (log.metadata?.name as string) || "Unknown";
        description = `Created room: ${name}`;
      } else if (action === "update") {
        const name = (log.metadata?.name as string) || "Unknown";
        description = `Updated room: ${name}`;
      } else if (action === "delete") {
        description = `Deleted room`;
      }
      break;
    case "seat":
      if (action === "create") {
        const label = (log.metadata?.label as string) || "Unknown";
        description = `Created seat: ${label}`;
      } else if (action === "update") {
        const label = (log.metadata?.label as string) || "Unknown";
        description = `Updated seat: ${label}`;
      } else if (action === "delete") {
        description = `Deleted seat`;
      }
      break;
    case "seat_reservation":
      if (action === "create") {
        const seat = (log.metadata?.seat as string) || "unknown seat";
        const attendance = (log.metadata?.attendance as string) || "none";
        description = `Reserved seat: ${seat} (${attendance})`;
      } else if (action === "update") {
        const seat = (log.metadata?.seat as string) || "unknown seat";
        const attendance = (log.metadata?.attendance as string) || "none";
        description = `Updated seat reservation: ${seat} (${attendance})`;
      }
      break;
    case "profile":
      if (action === "update") {
        description = `Updated profile`;
      } else if (action === "games_refresh") {
        const gamesCount = (log.metadata?.games_count as number) || "Unknown";
        description = `Refreshed games library (${gamesCount} games)`;
      }
      break;
    case "steam_games":
      if (action === "update") {
        description = `Updated Steam games database`;
      }
      break;
    default:
      description = log.action;
  }

  return description;
};

const getEntityTypeName = (entityType: string): string => {
  const entityTypeMap: Record<string, string> = {
    auth: "Authentication",
    event: "Event",
    event_seating_config: "Event Seating Config",
    invitation: "Invitation",
    email: "Email",
    rsvp: "RSVP",
    seat_reservation: "Seat Reservation",
    room: "Room",
    seat: "Seat",
    game_suggestion: "Game Suggestion",
    game_vote: "Game Vote",
    profile: "Profile",
    steam_games: "Steam Games",
  };

  return entityTypeMap[entityType] || entityType;
};

const AuditLog = () => {
  const { token, isAdmin } = useContext(UserContext);
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [userId, setUserId] = useState("");
  const [entityType, setEntityType] = useState("");
  const [fromTimestamp, setFromTimestamp] = useState<Moment | null>(null);
  const [toTimestamp, setToTimestamp] = useState<Moment | null>(null);

  const fetchLogs = async () => {
    if (!token || !isAdmin) {
      setError("Unauthorized: Admin access required");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.append("_as_admin", "true");
      params.append("limit", rowsPerPage.toString());
      params.append("offset", (page * rowsPerPage).toString());

      if (userId) params.append("user_id", userId);
      if (entityType) params.append("entity_type", entityType);
      if (fromTimestamp)
        params.append("from_timestamp", fromTimestamp.toISOString());
      if (toTimestamp) params.append("to_timestamp", toTimestamp.toISOString());

      const response = await fetch(`/api/audit-logs?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch audit logs: ${response.statusText}`);
      }

      const data: AuditLogsResponse = await response.json();
      setLogs(data.logs);
      setTotalCount(data.totalCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page, rowsPerPage, userId, entityType, fromTimestamp, toTimestamp, token, isAdmin]);

  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  if (!isAdmin) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Alert severity="error">
          You do not have permission to view this page. Admin access required.
        </Alert>
      </Container>
    );
  }

  return (
    <LocalizationProvider dateAdapter={AdapterMoment}>
      <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
        <Typography variant="h4" gutterBottom>
          Audit Log
        </Typography>

        <Paper sx={{ p: 2, mb: 2 }}>
          <Stack direction="row" spacing={2} flexWrap="wrap">
            <TextField
              label="User Email"
              value={userId}
              onChange={(e) => {
                setUserId(e.target.value);
                setPage(0);
              }}
              sx={{ minWidth: 200 }}
              size="small"
            />
            <TextField
              select
              label="Entity Type"
              value={entityType}
              onChange={(e) => {
                setEntityType(e.target.value);
                setPage(0);
              }}
              sx={{ minWidth: 200 }}
              size="small"
            >
              {entityTypes.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>
            <DateTimePicker
              label="From"
              value={fromTimestamp}
              onChange={(newValue) => {
                setFromTimestamp(newValue);
                setPage(0);
              }}
              slotProps={{ textField: { size: "small" } }}
            />
            <DateTimePicker
              label="To"
              value={toTimestamp}
              onChange={(newValue) => {
                setToTimestamp(newValue);
                setPage(0);
              }}
              slotProps={{ textField: { size: "small" } }}
            />
          </Stack>
        </Paper>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Paper>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Timestamp</TableCell>
                  <TableCell>User</TableCell>
                  <TableCell>Action</TableCell>
                  <TableCell>Entity Type</TableCell>
                  <TableCell>Entity ID</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center">
                      <CircularProgress />
                    </TableCell>
                  </TableRow>
                ) : logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center">
                      No audit logs found
                    </TableCell>
                  </TableRow>
                ) : (
                  logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>
                        {moment(log.timestamp).format("YYYY-MM-DD HH:mm:ss")}
                      </TableCell>
                      <TableCell>{log.userId || "System"}</TableCell>
                      <TableCell>{getActionDescription(log)}</TableCell>
                      <TableCell>{getEntityTypeName(log.entityType)}</TableCell>
                      <TableCell>{log.entityId || "-"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            rowsPerPageOptions={[25, 50, 100]}
            component="div"
            count={totalCount}
            rowsPerPage={rowsPerPage}
            page={page}
            onPageChange={handleChangePage}
            onRowsPerPageChange={handleChangeRowsPerPage}
          />
        </Paper>
      </Container>
    </LocalizationProvider>
  );
};

export default AuditLog;
