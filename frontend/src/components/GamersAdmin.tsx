import * as React from "react";
import { useEffect, useState, useRef, memo, useContext } from "react";
import {
  Avatar,
  Box,
  Chip,
  Container,
  Paper,
  Popper,
  Tooltip,
  Typography,
  Grid,
  TextField,
} from "@mui/material";
import { GamerSummaryData, PaginatedGamersResponse } from "../types/gamer";
import { DataGrid } from "@mui/x-data-grid/DataGrid";
import {
  GridColDef,
  GridRenderCellParams,
  GridRowModel,
  GridPaginationModel,
} from "@mui/x-data-grid";
import { GridApiCommunity } from "@mui/x-data-grid/internals";
import moment from "moment";
import { useSnackbar } from "notistack";

import { dateParser } from "../utils";
import { UserContext, UserDispatchContext } from "../UserProvider";

interface GridCellExpandProps {
  value: string;
  width: number;
}

function isOverflown(element: Element): boolean {
  return (
    element.scrollHeight > element.clientHeight ||
    element.scrollWidth > element.clientWidth
  );
}

const GridCellExpand = memo(function GridCellExpand(
  props: GridCellExpandProps,
) {
  const { width, value } = props;
  const wrapper = useRef<HTMLDivElement | null>(null);
  const cellDiv = useRef(null);
  const cellValue = useRef(null);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [showFullCell, setShowFullCell] = useState(false);
  const [showPopper, setShowPopper] = useState(false);

  const handleMouseEnter = () => {
    const isCurrentlyOverflown = isOverflown(cellValue.current!);
    setShowPopper(isCurrentlyOverflown);
    setAnchorEl(cellDiv.current);
    setShowFullCell(true);
  };

  const handleMouseLeave = () => {
    setShowFullCell(false);
  };

  useEffect(() => {
    if (!showFullCell) {
      return undefined;
    }

    function handleKeyDown(nativeEvent: KeyboardEvent) {
      // IE11, Edge (prior to using Bink?) use 'Esc'
      if (nativeEvent.key === "Escape" || nativeEvent.key === "Esc") {
        setShowFullCell(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [setShowFullCell, showFullCell]);

  return (
    <Box
      ref={wrapper}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      sx={{
        alignItems: "center",
        lineHeight: "24px",
        width: "100%",
        height: "100%",
        position: "relative",
        display: "flex",
      }}
    >
      <Box
        ref={cellDiv}
        sx={{
          height: "100%",
          width,
          display: "block",
          position: "absolute",
          top: 0,
        }}
      />
      <Box
        ref={cellValue}
        sx={{
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {value}
      </Box>
      {showPopper && (
        <Popper
          open={showFullCell && anchorEl !== null}
          anchorEl={anchorEl}
          style={{ width, marginLeft: -17 }}
        >
          <Paper
            elevation={1}
            style={{ minHeight: wrapper.current!.offsetHeight - 3 }}
          >
            <Typography
              variant="body2"
              style={{ padding: 8 }}
              sx={{ whiteSpace: "pre-wrap" }}
            >
              {value}
            </Typography>
          </Paper>
        </Popper>
      )}
    </Box>
  );
});

function renderCellExpand(params: GridRenderCellParams) {
  return (
    <GridCellExpand
      value={params.value || ""}
      width={params.colDef.computedWidth}
    />
  );
}

const GamersAdmin = () => {
  const { signOut } = useContext(UserDispatchContext);
  const userDetails = useContext(UserContext);
  const token = userDetails?.token;
  const { enqueueSnackbar } = useSnackbar();

  const [gamers, setGamers] = useState<GamerSummaryData[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalRows, setTotalRows] = useState(0);
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
    page: 0,
    pageSize: 20,
  });
  const [searchText, setSearchText] = useState("");
  const [searchDebounce, setSearchDebounce] = useState("");

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchDebounce(searchText);
      setPaginationModel((prev) =>
        prev.page === 0 ? prev : { ...prev, page: 0 },
      ); // Reset to first page on search only if not already 0
    }, 500);

    return () => clearTimeout(timer);
  }, [searchText]);

  // Fetch gamers when pagination or search changes
  useEffect(() => {
    const fetchGamers = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          as_admin: "true",
          page: String(paginationModel.page + 1), // API uses 1-based pagination
          limit: String(paginationModel.pageSize),
        });

        if (searchDebounce) {
          params.append("search", searchDebounce);
        }

        const response = await fetch(`/api/gamers?${params}`, {
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: "Bearer " + token,
          },
        });

        if (response.status === 401) {
          signOut();
          return;
        }

        if (response.ok) {
          const data = JSON.parse(
            await response.text(),
            dateParser,
          ) as PaginatedGamersResponse;
          setGamers(data.gamers);
          setTotalRows(data.total);
        } else {
          enqueueSnackbar("Failed to fetch gamers", { variant: "error" });
        }
      } catch (error) {
        console.error("Error fetching gamers:", error);
        enqueueSnackbar("Error fetching gamers", { variant: "error" });
      } finally {
        setLoading(false);
      }
    };

    if (token) {
      void fetchGamers();
    }
  }, [paginationModel, searchDebounce, token, signOut, enqueueSnackbar]);

  const processRowUpdate = async (
    newRow: GridRowModel,
    oldRow: GridRowModel,
  ) => {
    const gamerData = newRow as GamerSummaryData;

    // Validate Steam ID (17 digits, required)
    if (!gamerData.steamId || !/^\d{17}$/.test(gamerData.steamId)) {
      enqueueSnackbar("Steam ID must be exactly 17 digits", {
        variant: "error",
      });
      return oldRow;
    }

    try {
      const response = await fetch(
        `/api/profile/${encodeURIComponent(gamerData.email)}?as_admin=true`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: "Bearer " + token,
          },
          body: JSON.stringify({ steamId: gamerData.steamId ?? null }),
        },
      );

      if (response.status === 401) {
        signOut();
        return oldRow;
      }

      if (response.ok) {
        enqueueSnackbar("Steam ID updated successfully", {
          variant: "success",
        });
        return newRow;
      } else {
        const errorText = await response.text();
        enqueueSnackbar(`Failed to update Steam ID: ${errorText}`, {
          variant: "error",
        });
        return oldRow;
      }
    } catch (error) {
      console.error("Error updating Steam ID:", error);
      enqueueSnackbar("Error updating Steam ID", { variant: "error" });
      return oldRow;
    }
  };

  const columns: GridColDef[] = [
    {
      field: "email",
      headerName: "Email",
      type: "string",
      flex: 1,
      editable: false,
      valueGetter: (_value, row) => row,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      renderCell: (params: GridRenderCellParams<any, GamerSummaryData>) => (
        <Tooltip title={params.value?.email || "Attendee"}>
          <Chip
            avatar={
              <Avatar
                alt={params.value?.email || "Attendee"}
                src={
                  params.value?.avatarUrl ||
                  "https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y"
                }
              />
            }
            label={params.value?.email || "Attendee"}
            variant="outlined"
          />
        </Tooltip>
      ),
    },
    {
      field: "handles",
      headerName: "Handles",
      type: "string",
      flex: 1,
      editable: false,
      renderCell: renderCellExpand,
    },
    {
      field: "steamId",
      headerName: "Steam ID",
      type: "string",
      flex: 1,
      editable: true,
      renderCell: renderCellExpand,
    },
    {
      field: "eventsInvitedCount",
      headerName: "Invited",
      type: "number",
      flex: 0.5,
      editable: false,
    },
    {
      field: "eventsAcceptedCount",
      headerName: "Accepted",
      type: "number",
      flex: 0.5,
      editable: false,
    },
    {
      field: "eventsTentativeCount",
      headerName: "Tentative",
      type: "number",
      flex: 0.5,
      editable: false,
    },
    {
      field: "eventsDeclinedCount",
      headerName: "Declined",
      type: "number",
      flex: 0.5,
      editable: false,
    },
    {
      field: "eventsLastResponse",
      headerName: "Last RSVP",
      type: "dateTime",
      flex: 1,
      editable: false,
      valueFormatter: (
        value: moment.Moment,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        _row: any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        _column: GridColDef<any, moment.Moment, string>,
        _apiRef: React.MutableRefObject<GridApiCommunity>,
      ) => {
        if (value == null) {
          return "";
        }

        return value.calendar();
      },
    },
    {
      field: "gamesOwnedCount",
      headerName: "Games Owned",
      type: "number",
      flex: 0.5,
      editable: false,
    },
    {
      field: "gamesOwnedLastModified",
      headerName: "Games Updated",
      type: "dateTime",
      flex: 1,
      editable: false,
      valueFormatter: (
        value: moment.Moment,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        _row: any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        _column: GridColDef<any, moment.Moment, string>,
        _apiRef: React.MutableRefObject<GridApiCommunity>,
      ) => {
        if (value == null) {
          return "";
        }

        return value.calendar();
      },
    },
  ];

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Grid container spacing={3}>
        {/* Gamers */}
        <Grid size={12}>
          <Paper sx={{ p: 2, display: "flex", flexDirection: "column" }}>
            <Typography
              component="h2"
              variant="h6"
              color="primary"
              gutterBottom
            >
              Gamers
            </Typography>
            <Box sx={{ mb: 2 }}>
              <TextField
                fullWidth
                label="Search by email or handle"
                variant="outlined"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Type to search..."
                size="small"
              />
            </Box>
            <Box sx={{ width: "100%", height: 600 }}>
              <DataGrid
                rows={gamers}
                getRowId={(row) => row.email}
                columns={columns}
                rowCount={totalRows}
                loading={loading}
                pageSizeOptions={[10, 20, 50, 100]}
                paginationModel={paginationModel}
                paginationMode="server"
                onPaginationModelChange={setPaginationModel}
                processRowUpdate={processRowUpdate}
                disableRowSelectionOnClick
                initialState={{
                  sorting: {
                    sortModel: [{ field: "email", sort: "asc" }],
                  },
                }}
              />
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Container>
  );
};

export default GamersAdmin;
