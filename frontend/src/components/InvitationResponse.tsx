import * as React from "react";
import { useEffect, useState, useContext, useRef } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Button,
  TextField,
  Stack,
  Typography,
  ToggleButtonGroup,
  CircularProgress,
  ToggleButton,
} from "@mui/material";
import { Link } from "react-router-dom";
import { UserContext } from "../UserProvider";
import { dateParser } from "../utils";
import {
  RSVP,
  InvitationData,
  defaultInvitationData,
} from "../types/invitations";

interface InvitationResponseProps {
  event_id: number;
  asAdmin?: boolean;
}

export default function InvitationResponse(props: InvitationResponseProps) {
  const userDetails = useContext(UserContext);
  const token = userDetails?.token;
  const email = userDetails?.email;

  const isAdmin = props.asAdmin ?? false;

  const [invitation, setInvitation] = useState(defaultInvitationData);
  const [loading, setLoading] = useState(false);
  const [handleColour, setHandleColour] = useState<
    | "primary"
    | "error"
    | "secondary"
    | "info"
    | "success"
    | "warning"
    | undefined
  >("primary");

  var typingTimer = useRef<NodeJS.Timeout>();
  const doneTypingInterval = 1000;

  useEffect(() => {
    fetch(
      `${process.env.REACT_APP_API_PROXY}/api/events/${props.event_id}/invitations/${email}`,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
      },
    )
      .then((response) => {
        return response
          .text()
          .then((data) => JSON.parse(data, dateParser) as InvitationData);
      })
      .then((data) => {
        setInvitation(data);
      });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRSVPChange = (
    event: React.MouseEvent<HTMLElement>,
    newAlignment: string,
  ) => {
    clearTimeout(typingTimer.current);
    setLoading(true);

    const newInvitation = {
      ...invitation,
      response: newAlignment as RSVP,
    };

    setInvitation(newInvitation);

    typingTimer.current = setTimeout(function () {
      saveInvitationResponse(newInvitation);
    }, doneTypingInterval);
  };

  const handleHandleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    clearTimeout(typingTimer.current);

    setLoading(true);
    setHandleColour("warning");

    const newInvitation = {
      ...invitation,
      handle: event.target.value,
    };

    setInvitation(newInvitation);

    if (event.target.value) {
      typingTimer.current = setTimeout(function () {
        saveInvitationResponse(newInvitation);
      }, doneTypingInterval);
    }
  };

  const saveInvitationResponse = (newInvitation: InvitationData) => {
    fetch(
      `${process.env.REACT_APP_API_PROXY}/api/events/${props.event_id}/invitations/${email}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({
          handle: newInvitation.handle,
          response: newInvitation.response,
        }),
      },
    ).then((response) => {
      if (response.status === 204) {
        setLoading(false);
        setHandleColour("primary");
      } else {
        alert("Unable to set response");
        throw new Error("Unable to set response");
      }
    });
  };

  return (
    <React.Fragment>
      <Typography component="h2" variant="h6" color="primary" gutterBottom>
        RSVP
      </Typography>
      <Stack spacing={2} direction="row">
        <TextField
          label="Handle"
          variant="outlined"
          color={handleColour}
          focused
          value={invitation.handle}
          onChange={handleHandleChange}
        />
        <ToggleButtonGroup
          color="primary"
          value={invitation.response}
          exclusive
          onChange={handleRSVPChange}
          aria-label="Response"
        >
          <ToggleButton color="success" value="yes">
            Yes
          </ToggleButton>
          <ToggleButton color="warning" value="maybe">
            Maybe
          </ToggleButton>
          <ToggleButton color="error" value="no">
            No
          </ToggleButton>
        </ToggleButtonGroup>
        {loading && <CircularProgress />}
      </Stack>
    </React.Fragment>
  );
}
