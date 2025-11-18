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
  metadata: Record<string, any> | null;
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
  { value: "rsvp", label: "RSVPs" },
  { value: "game_suggestion", label: "Game Suggestions" },
  { value: "game_vote", label: "Game Votes" },
  { value: "profile", label: "Profiles" },
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
        const title = log.metadata?.title || "Unknown";
        description = `Created event "${title}"`;
      } else if (action === "update") {
        const title = log.metadata?.title || "Unknown";
        description = `Updated event "${title}"`;
      } else if (action === "delete") {
        description = `Deleted event`;
      }
      break;
    case "rsvp":
      if (action === "update") {
        const response = log.metadata?.response || "Unknown";
        description = `Updated RSVP to ${response}`;
      }
      break;
    case "game_suggestion":
      if (action === "create") {
        const gameId = log.metadata?.game_id || "Unknown";
        description = `Suggested game (ID: ${gameId})`;
      }
      break;
    case "game_vote":
      if (action === "update") {
        const vote = log.metadata?.vote || "Unknown";
        description = `Voted ${vote} on game`;
      }
      break;
    case "profile":
      if (action === "update") {
        description = `Updated profile`;
      }
      break;
    default:
      description = log.action;
  }

  return description;
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
  }, [page, rowsPerPage, userId, entityType, fromTimestamp, toTimestamp]);

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
                      <TableCell>{log.entityType}</TableCell>
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
