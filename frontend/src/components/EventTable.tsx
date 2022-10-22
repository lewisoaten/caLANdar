import * as React from "react";
import {
  useEffect,
  useState,
  useContext,
  useCallback,
  useRef,
  useMemo,
  memo,
  Dispatch,
  SetStateAction,
} from "react";
import { Box, Typography, Paper, Popper } from "@mui/material";
import {
  DataGrid,
  GridColumns,
  GridRowParams,
  GridActionsCellItem,
  GridValueFormatterParams,
  GridValueGetterParams,
  GridRenderCellParams,
  GridRowId,
} from "@mui/x-data-grid";
import LaunchIcon from "@mui/icons-material/Launch";
import { useNavigate } from "react-router-dom";
import { UserContext } from "../UserProvider";
import { dateParser } from "../utils";
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
            <Typography variant="body2" style={{ padding: 8 }}>
              {value}
            </Typography>
          </Paper>
        </Popper>
      )}
    </Box>
  );
});

function renderCellExpand(params: GridRenderCellParams<string>) {
  return (
    <GridCellExpand
      value={params.value || ""}
      width={params.colDef.computedWidth}
    />
  );
}

interface EventTableProps {
  eventsState?: [EventData[], Dispatch<SetStateAction<EventData[]>>];
  asAdmin?: boolean;
}

export default function EventTable(props: EventTableProps) {
  const userDetails = useContext(UserContext);
  const token = userDetails?.token;

  const ownEventsState = useState([] as EventData[]);

  const [events, setEvents] = props.eventsState ?? ownEventsState;
  const isAdmin = props.asAdmin ?? false;

  const navigate = useNavigate();

  const openEvent = useCallback(
    (id: GridRowId) => () => {
      navigate(`${id}`);
    },
    [navigate],
  );

  const columns = useMemo<GridColumns<typeof events[number]>>(
    () => [
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
        valueFormatter: (params: GridValueFormatterParams<moment.Moment>) => {
          if (params.value == null) {
            return "";
          }

          return params.value.calendar();
        },
      },
      {
        field: "duration",
        headerName: "Duration",
        type: "dateTime",
        flex: 1,
        editable: false,
        valueGetter: (params: GridValueGetterParams) => {
          if (params.row.timeBegin == null || params.row.timeEnd == null) {
            return "";
          }

          return params.row.timeEnd
            .endOf("day")
            .diff(params.row.timeBegin.startOf("day"), "days");
        },
        valueFormatter: (params: GridValueFormatterParams<number>) => {
          if (params.value == null) {
            return "";
          }

          return `${params.value} days`;
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
            icon={<LaunchIcon />}
            label="Open"
            onClick={openEvent(params.id)}
          />,
        ],
      },
    ],
    [openEvent],
  );

  useEffect(() => {
    fetch(`${process.env.REACT_APP_API_PROXY}/api/events?as_admin=${isAdmin}`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
    })
      .then((response) => {
        return response
          .text()
          .then((data) => JSON.parse(data, dateParser) as Array<EventData>);
      })
      .then((data) => {
        setEvents(data);
      });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <React.Fragment>
      <Typography component="h2" variant="h6" color="primary" gutterBottom>
        Upcoming Events
      </Typography>
      <Box sx={{ width: "100%" }}>
        <DataGrid
          rows={events}
          columns={columns}
          pageSize={5}
          autoHeight
          rowsPerPageOptions={[5]}
          disableSelectionOnClick
          experimentalFeatures={{ newEditingApi: true }}
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
