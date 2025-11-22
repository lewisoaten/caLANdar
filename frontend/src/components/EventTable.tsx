import * as React from "react";
import {
  useEffect,
  useState,
  useContext,
  useCallback,
  useRef,
  memo,
  Dispatch,
  SetStateAction,
} from "react";
import moment from "moment";
import { Box, Typography, Paper, Popper } from "@mui/material";
import {
  DataGrid,
  GridColDef,
  GridRowParams,
  GridActionsCellItem,
  GridRenderCellParams,
  GridRowId,
} from "@mui/x-data-grid";
import LinkIcon from "@mui/icons-material/Link";
import { useNavigate } from "react-router-dom";
import { UserContext, UserDispatchContext } from "../UserProvider";
import { dateParser } from "../utils";
import { EventData } from "../types/events";
import { GridApiCommunity } from "@mui/x-data-grid/models/api/gridApiCommunity";

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

interface EventTableProps {
  eventsState?: [EventData[], Dispatch<SetStateAction<EventData[]>>];
  liveEvents?: boolean;
  pastEvents?: boolean;
  asAdmin?: boolean;
}

export default function EventTable(props: EventTableProps) {
  const { signOut } = useContext(UserDispatchContext);
  const userDetails = useContext(UserContext);
  const token = userDetails?.token;

  const ownEventsState = useState([] as EventData[]);

  const [events, setEvents] = props.eventsState ?? ownEventsState;
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0); // MUI DataGrid uses 0-based page indexing
  const [pageSize, setPageSize] = useState(20);
  const [rowCount, setRowCount] = useState(0);
  const isAdmin = props.asAdmin ?? false;

  const liveEvents = props.liveEvents ?? true;
  const pastEvents = props.pastEvents ?? true;

  const tableTitle =
    liveEvents && pastEvents
      ? "Events"
      : liveEvents
        ? "Upcoming Events"
        : "Past Events";

  const navigate = useNavigate();

  const openEvent = useCallback(
    (id: GridRowId) => () => {
      navigate(`${id}`);
    },
    [navigate],
  );

  const columns: GridColDef[] = [
    {
      field: "title",
      headerName: "Title",
      type: "string",
      flex: 1,
      editable: false,
      renderCell: renderCellExpand,
    },
    {
      field: "timeBegin",
      headerName: "Start",
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
      field: "duration",
      headerName: "Duration",
      type: "dateTime",
      flex: 1,
      editable: false,
      valueGetter: (
        _value: string,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        row: any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        _column: GridColDef<any, string, any>,
        _apiRef: React.MutableRefObject<GridApiCommunity>,
      ) => {
        const timeBegin = moment(row.timeBegin);
        const timeEnd = moment(row.timeEnd);
        if (timeBegin == null || timeEnd == null) {
          return "";
        }

        return timeEnd.endOf("day").diff(timeBegin.startOf("day"), "days");
      },
      valueFormatter: (
        value: number,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        _row: any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        _column: GridColDef<any, number, string>,
        _apiRef: React.MutableRefObject<GridApiCommunity>,
      ) => {
        if (value == null) {
          return "";
        }

        return `${value} days`;
      },
    },
    {
      field: "description",
      headerName: "Description",
      type: "string",
      flex: 2,
      editable: false,
      renderCell: renderCellExpand,
    },
    {
      field: "actions",
      type: "actions",
      flex: 0.1,
      getActions: (params: GridRowParams) => [
        <GridActionsCellItem
          key={params.id}
          icon={<LinkIcon />}
          label="Open"
          onClick={openEvent(params.id)}
        />,
      ],
    },
  ];

  useEffect(() => {
    setLoading(true);

    // Determine filter based on liveEvents and pastEvents
    let filter = "all";
    if (liveEvents && !pastEvents) {
      filter = "upcoming";
    } else if (!liveEvents && pastEvents) {
      filter = "past";
    }

    // API uses 1-based page indexing, MUI DataGrid uses 0-based
    const apiPage = page + 1;

    fetch(
      `/api/events?as_admin=${isAdmin}&page=${apiPage}&limit=${pageSize}&filter=${filter}`,
      {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: "Bearer " + token,
        },
      },
    )
      .then((response) => {
        if (response.status === 401) signOut();
        else if (response.ok) return response.json();
      })
      .then((data) => {
        if (!data) {
          setEvents([]);
          setRowCount(0);
          setLoading(false);
          return;
        }

        // Parse the events from the paginated response
        const parsedEvents = JSON.parse(
          JSON.stringify(data.events),
          dateParser,
        ) as Array<EventData>;

        setEvents(parsedEvents);
        setRowCount(data.total);
        setLoading(false);
      })
      .catch((error) => {
        console.error("Error fetching events:", error);
        setLoading(false);
      });
  }, [
    page,
    pageSize,
    isAdmin,
    liveEvents,
    pastEvents,
    token,
    signOut,
    setEvents,
  ]);

  return (
    <React.Fragment>
      <Typography component="h2" variant="h6" color="primary" gutterBottom>
        {tableTitle}
      </Typography>
      <Box sx={{ width: "100%" }}>
        <DataGrid
          rows={events}
          columns={columns}
          autoHeight
          disableRowSelectionOnClick
          loading={loading}
          pagination
          paginationMode="server"
          rowCount={rowCount}
          paginationModel={{ page, pageSize }}
          onPaginationModelChange={(model) => {
            setPage(model.page);
            setPageSize(model.pageSize);
          }}
          pageSizeOptions={[10, 20, 50, 100]}
          initialState={{
            sorting: {
              sortModel: [{ field: "timeBegin", sort: "desc" }],
            },
          }}
        />
      </Box>
    </React.Fragment>
  );
}
