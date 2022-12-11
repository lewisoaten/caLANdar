import * as React from "react";
import {
  useEffect,
  useState,
  useContext,
  useRef,
  Dispatch,
  SetStateAction,
} from "react";
import {
  Alert,
  Collapse,
  TextField,
  Stack,
  Typography,
  ToggleButtonGroup,
  CircularProgress,
  ToggleButton,
} from "@mui/material";
import { useSnackbar } from "notistack";
import { UserContext } from "../UserProvider";
import { dateParser } from "../utils";
import {
  RSVP,
  InvitationData,
  defaultInvitationData,
} from "../types/invitations";

interface InvitationResponseProps {
  event_id: number;
  setResponded: Dispatch<SetStateAction<boolean>>;
  disabled: boolean;
  asAdmin?: boolean;
}

export default function InvitationResponse(props: InvitationResponseProps) {
  const userDetails = useContext(UserContext);
  const token = userDetails?.token;
  const email = userDetails?.email;

  const { enqueueSnackbar } = useSnackbar();

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
  const [formInfoVisible, setFormInfoVisible] = useState(false);

  var typingTimer = useRef<NodeJS.Timeout>();
  const doneTypingInterval = 1000;

  useEffect(() => {
    fetch(
      `${process.env.REACT_APP_API_PROXY}/api/events/${
        props.event_id
      }/invitations/${encodeURIComponent(email)}`,
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
        if (data.response && data.handle && data.response !== RSVP.no) {
          props.setResponded(true);
        }
      });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRSVPChange = (
    event: React.MouseEvent<HTMLElement>,
    newAlignment: string,
  ) => {
    clearTimeout(typingTimer.current);

    const newInvitation = {
      ...invitation,
      response: newAlignment as RSVP,
    };

    setInvitation(newInvitation);

    if (!invitation.handle || !newAlignment) {
      setFormInfoVisible(true);
      setLoading(false);
      return;
    }

    setFormInfoVisible(false);
    setLoading(true);

    typingTimer.current = setTimeout(function () {
      saveInvitationResponse(newInvitation);
    }, doneTypingInterval);
  };

  const handleHandleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    clearTimeout(typingTimer.current);

    const newInvitation = {
      ...invitation,
      handle: event.target.value,
    };

    setInvitation(newInvitation);

    if (!event.target.value || !invitation.response) {
      setFormInfoVisible(true);
      setLoading(false);
      return;
    }

    setFormInfoVisible(false);
    setLoading(true);
    setHandleColour("warning");

    if (event.target.value) {
      typingTimer.current = setTimeout(function () {
        saveInvitationResponse(newInvitation);
      }, doneTypingInterval);
    }
  };

  const saveInvitationResponse = (newInvitation: InvitationData) => {
    fetch(
      `${process.env.REACT_APP_API_PROXY}/api/events/${
        props.event_id
      }/invitations/${encodeURIComponent(email)}`,
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
        enqueueSnackbar("RSVP saved", { variant: "success" });
        if (newInvitation.response !== RSVP.no) {
          props.setResponded(true);
        }
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
      <Stack spacing={2} direction="column">
        <Stack spacing={2} direction="row">
          <TextField
            label="Handle"
            variant="outlined"
            color={handleColour}
            focused
            value={invitation.handle}
            onChange={handleHandleChange}
            disabled={props.disabled}
          />
          <ToggleButtonGroup
            color="primary"
            value={invitation.response}
            exclusive
            onChange={handleRSVPChange}
            aria-label="Response"
            disabled={props.disabled}
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
        <Collapse in={formInfoVisible}>
          <Alert severity="info">
            You must enter both a Handle and select whether you are attending to
            save your response.
          </Alert>
        </Collapse>
      </Stack>
    </React.Fragment>
  );
}
