import * as React from "react";
import { useEffect, useState, useContext } from "react";
import {
  Typography,
  Grid,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Avatar,
  Alert,
  Skeleton,
} from "@mui/material";
import { UserContext, UserDispatchContext } from "../UserProvider";
import { dateParser } from "../utils";
import {
  InvitationLiteData,
  defaultInvitationsLiteData,
} from "../types/invitations";

interface EventAttendeListProps {
  event_id: number;
  responded: boolean;
}

export default function EventAttendeeList(props: EventAttendeListProps) {
  const { signOut } = useContext(UserDispatchContext);
  const userDetails = useContext(UserContext);
  const token = userDetails?.token;

  const [attendees, setAttendees] = useState(defaultInvitationsLiteData);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/events/${props.event_id}/invitations`, {
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
            .then(
              (data) =>
                JSON.parse(data, dateParser) as Array<InvitationLiteData>,
            );
      })
      .then((data) => {
        if (data) {
          setAttendees(data);
          setLoading(false);
        }
      });
  }, [props.event_id, props.responded]);

  return (
    <Grid container spacing={2}>
      <Grid item xs={12}>
        <Typography component="h3" variant="h6" color="primary" gutterBottom>
          Attendees
        </Typography>
      </Grid>
      {props.responded && !loading ? (
        <Grid item xs={12}>
          <List>
            {attendees.map((attendee) => (
              <ListItem dense={true} key={attendee.handle}>
                <ListItemAvatar>
                  <Avatar
                    alt={attendee.handle || "Attendee"}
                    src={
                      attendee.avatarUrl ||
                      "https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y"
                    }
                  />
                </ListItemAvatar>
                <ListItemText
                  primary={attendee.handle}
                  secondary={`RSVP: ${attendee.response}`}
                />
              </ListItem>
            ))}
          </List>
        </Grid>
      ) : (
        <React.Fragment>
          <Grid item xs={12}>
            <Alert severity="info">RSVP to load attendees.</Alert>
          </Grid>
          {Array.from(Array(3)).map((_, i) => (
            <React.Fragment key={i}>
              <Grid item xs={2}>
                <Skeleton variant="circular" animation="wave">
                  <Avatar />
                </Skeleton>
              </Grid>
              <Grid item xs={10}>
                <Skeleton variant="rectangular" width="100%" animation="wave">
                  <Typography variant="body1" gutterBottom>
                    Person Name
                  </Typography>
                </Skeleton>
              </Grid>
            </React.Fragment>
          ))}
        </React.Fragment>
      )}
    </Grid>
  );
}
