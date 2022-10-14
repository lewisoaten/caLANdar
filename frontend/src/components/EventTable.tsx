import * as React from "react";
import { useEffect, useState, useContext } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Button,
  Typography,
} from "@mui/material";
import { Link } from "react-router-dom";
import { UserContext } from "../UserProvider";
import { dateParser } from "../utils";
import { EventData } from "../types/events";

interface EventTableProps {
  eventsState?: [
    EventData[],
    React.Dispatch<React.SetStateAction<EventData[]>>,
  ];
}

export default function EventTable(props: EventTableProps) {
  const userDetails = useContext(UserContext);
  const token = userDetails?.token;

  const ownEventsState = useState([] as EventData[]);

  const [events, setEvents] = props.eventsState ?? ownEventsState;

  useEffect(() => {
    fetch(`${process.env.REACT_APP_API_PROXY}/api/events`, {
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
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Title</TableCell>
            <TableCell>Start Date</TableCell>
            <TableCell>End Date</TableCell>
            <TableCell>Description</TableCell>
            <TableCell>Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {events.map((events) => (
            <TableRow key={events.id}>
              <TableCell>{events.title}</TableCell>
              <TableCell>{events.timeBegin.calendar()}</TableCell>
              <TableCell>{events.timeEnd.calendar()}</TableCell>
              <TableCell>{events.description}</TableCell>
              <TableCell>
                <Button
                  variant="text"
                  component={Link}
                  to={events.id.toString()}
                >
                  Open
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </React.Fragment>
  );
}
