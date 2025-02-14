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
import { UserContext, UserDispatchContext } from "../UserProvider";
import { dateParser } from "../utils";
import {
  RSVP,
  InvitationData,
  defaultInvitationData,
} from "../types/invitations";
import AttendanceSelector from "./AttendanceSelector";
import { EventData } from "../types/events";

interface InvitationResponseProps {
  event: EventData;
  setResponded: Dispatch<SetStateAction<boolean>>;
  disabled: boolean;
  asAdmin?: boolean;
}

export default function InvitationResponse(props: InvitationResponseProps) {
  const { signOut } = useContext(UserDispatchContext);
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

  const [attendanceSelectorVisible, setAttendanceSelectorVisible] =
    useState(false);
  const [attendanceColour, setAttendanceColour] = useState<
    | "primary"
    | "error"
    | "secondary"
    | "info"
    | "success"
    | "warning"
    | "standard"
    | undefined
  >("primary");

  const typingTimer = useRef<NodeJS.Timeout>(new NodeJS.Timeout());
  const doneTypingInterval = 1000;

  useEffect(() => {
    fetch(
      `/api/events/${props.event.id}/invitations/${encodeURIComponent(email)}`,
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
        else
          return response
            .text()
            .then((data) => JSON.parse(data, dateParser) as InvitationData);
      })
      .then((data) => {
        if (data) {
          setInvitation(data);
          setAttendanceColour(
            data.response === RSVP.yes ? "success" : "warning",
          );

          if (data.response && data.handle && data.response !== RSVP.no) {
            props.setResponded(true);
            setAttendanceSelectorVisible(true);
          }
        }
      });
  }, []);

  const handleRSVPChange = (
    _event: React.MouseEvent<HTMLElement>,
    newAlignment: string,
  ) => {
    clearTimeout(typingTimer.current);

    const newInvitation = {
      ...invitation,
      response: newAlignment as RSVP,
    };

    setInvitation(newInvitation);
    setAttendanceColour(
      newInvitation.response === RSVP.yes ? "success" : "warning",
    );

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
    setAttendanceColour(
      newInvitation.response === RSVP.yes ? "success" : "warning",
    );

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

  const handleAttendanceChange = (newAttendance: number[]) => {
    const newInvitation = {
      ...invitation,
      attendance: newAttendance,
    };

    setInvitation(newInvitation);
    setAttendanceColour(
      newInvitation.response === RSVP.yes ? "success" : "warning",
    );

    saveInvitationResponse(newInvitation);
  };

  const saveInvitationResponse = (newInvitation: InvitationData) => {
    fetch(
      `/api/events/${props.event.id}/invitations/${encodeURIComponent(email)}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({
          handle: newInvitation.handle,
          response: newInvitation.response,
          attendance: newInvitation.attendance,
        }),
      },
    ).then((response) => {
      if (response.status === 401) signOut();
      else if (response.status === 204) {
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
      <Stack spacing={2} direction="column" alignItems="flex-start">
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
        <Collapse in={attendanceSelectorVisible}>
          <Typography component="h3" variant="h6" color="primary" gutterBottom>
            Times Attending
          </Typography>
          {attendanceSelectorVisible && (
            <AttendanceSelector
              timeBegin={props.event.timeBegin}
              timeEnd={props.event.timeEnd}
              value={invitation.attendance}
              colour={attendanceColour}
              onChange={handleAttendanceChange}
            />
          )}
        </Collapse>
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
