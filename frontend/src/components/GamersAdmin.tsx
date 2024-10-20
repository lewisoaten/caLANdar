import * as React from "react";
import { useEffect, useState, useRef, memo, useContext } from "react";
import {
  Avatar,
  Box,
  Chip,
  Container,
  Grid,
  Paper,
  Popper,
  Tooltip,
  Typography,
} from "@mui/material";
import { GamerData } from "../types/gamer";
import { DataGrid } from "@mui/x-data-grid/DataGrid";
import {
  GridColDef,
  GridColumnGroupingModel,
  GridRenderCellParams,
} from "@mui/x-data-grid";
import { GridApiCommunity } from "@mui/x-data-grid/internals";
import moment from "moment";

import { dateParser } from "../utils";
import { UserContext, UserDispatchContext } from "../UserProvider";
import { EventData } from "../types/events";

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

  const gamersState = useState([] as GamerData[]);
  const [gamers, setGamers] = gamersState;

  const columnGroupingModel: GridColumnGroupingModel = [
    {
      groupId: "Events",
      children: [
        { field: "eventsInvited" },
        { field: "eventsAccepted" },
        { field: "eventsTentative" },
        { field: "eventsDeclined" },
        { field: "eventsLastResponse" },
      ],
    },
    {
      groupId: "Games",
      children: [
        { field: "gamesOwnedCount" },
        { field: "gamesOwnedLastModified" },
      ],
    },
  ];

  const columns: GridColDef[] = [
    {
      field: "email",
      headerName: "Email",
      type: "string",
      flex: 1,
      editable: false,
      valueGetter: (_value, row) => row,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      renderCell: (params: GridRenderCellParams<any, GamerData>) => (
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
      field: "eventsInvited",
      headerName: "Invinted",
      type: "string",
      flex: 1,
      editable: false,
      renderCell: renderCellExpand,
      valueGetter: (_value, row) =>
        row.eventsInvited.map((e: EventData) => e.title).join(", "),
    },
    {
      field: "eventsAccepted",
      headerName: "Accepted",
      type: "string",
      flex: 1,
      editable: false,
      renderCell: renderCellExpand,
      valueGetter: (_value, row) =>
        row.eventsAccepted.map((e: EventData) => e.title).join(", "),
    },
    {
      field: "eventsTentative",
      headerName: "Tentative",
      type: "string",
      flex: 1,
      editable: false,
      renderCell: renderCellExpand,
      valueGetter: (_value, row) =>
        row.eventsTentative.map((e: EventData) => e.title).join(", "),
    },
    {
      field: "eventsDeclined",
      headerName: "Declined",
      type: "string",
      flex: 1,
      editable: false,
      renderCell: renderCellExpand,
      valueGetter: (_value, row) =>
        row.eventsDeclined.map((e: EventData) => e.title).join(", "),
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
      headerName: "Owned",
      type: "number",
      flex: 1,
      editable: false,
    },
    {
      field: "gamesOwnedLastModified",
      headerName: "Updated",
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

  useEffect(() => {
    fetch(`/api/gamers?as_admin=true`, {
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
            .then((data) => JSON.parse(data, dateParser) as Array<GamerData>);
      })
      .then((data) => {
        if (!data) {
          return [] as GamerData[];
        }

        setGamers(data);
      });
  }, []);

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Grid container spacing={3}>
        {/* Gamers */}
        <Grid item xs={12}>
          <Paper sx={{ p: 2, display: "flex", flexDirection: "column" }}>
            <Typography
              component="h2"
              variant="h6"
              color="primary"
              gutterBottom
            >
              Gamers
            </Typography>
            <Box sx={{ width: "100%" }}>
              <DataGrid
                rows={gamers}
                getRowId={(row) => row.email}
                columns={columns}
                columnGroupingModel={columnGroupingModel}
                disableRowSelectionOnClick
                initialState={{
                  sorting: {
                    sortModel: [{ field: "email", sort: "desc" }],
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
