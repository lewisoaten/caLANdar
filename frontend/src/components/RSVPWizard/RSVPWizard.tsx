import * as React from "react";
import { useState, useEffect, useContext } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Stepper,
  Step,
  StepLabel,
  Box,
  LinearProgress,
  Alert,
} from "@mui/material";
import { useSnackbar } from "notistack";
import { UserContext, UserDispatchContext } from "../../UserProvider";
import { EventData } from "../../types/events";
import { RSVP, InvitationData } from "../../types/invitations";
import { calculateDefaultAttendance } from "../../utils/attendance";
import RSVPResponseStep from "./RSVPResponseStep";
import GamerHandleStep from "./GamerHandleStep";
import AttendanceStep from "./AttendanceStep";
import SeatSelectionStep from "./SeatSelectionStep";
import ReviewStep from "./ReviewStep";

interface RSVPWizardProps {
  open: boolean;
  onClose: () => void;
  event: EventData;
  initialData?: InvitationData;
  onSaved: () => void;
}

export default function RSVPWizard(props: RSVPWizardProps) {
  const { signOut } = useContext(UserDispatchContext);
  const userDetails = useContext(UserContext);
  const token = userDetails?.token;
  const email = userDetails?.email;
  const { enqueueSnackbar } = useSnackbar();

  // Wizard state
  const [activeStep, setActiveStep] = useState(0);
  const [response, setResponse] = useState<RSVP | null>(
    props.initialData?.response || null,
  );
  const [handle, setHandle] = useState<string>(props.initialData?.handle || "");
  const [attendance, setAttendance] = useState<number[] | null>(
    props.initialData?.attendance || null,
  );
  const [handleValid, setHandleValid] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showExitWarning, setShowExitWarning] = useState(false);
  const [hasSeating, setHasSeating] = useState(false);
  const [allowUnspecifiedSeat, setAllowUnspecifiedSeat] = useState(false);
  const [seatReservationId, setSeatReservationId] = useState<number | null>(
    null,
  );

  // Check if event has seating configured
  useEffect(() => {
    if (!props.event.id || !token) return;

    fetch(`/api/events/${props.event.id}/seating-config?as_admin=true`, {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: "Bearer " + token,
      },
    })
      .then((response) => {
        if (response.status === 401) signOut();
        else if (response.ok) return response.json();
      })
      .then((data) => {
        if (data) {
          setHasSeating(data.hasSeating || false);
          setAllowUnspecifiedSeat(data.allowUnspecifiedSeat || false);
        }
      })
      .catch((error) => {
        console.error("Error fetching seating config:", error);
      });
  }, [props.event.id, token, signOut]);

  // Check if user has an existing seat reservation
  useEffect(() => {
    if (!props.event.id || !token || !email || !hasSeating) return;

    fetch(`/api/events/${props.event.id}/seat-reservations/me`, {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: "Bearer " + token,
      },
    })
      .then((response) => {
        if (response.status === 404) {
          setSeatReservationId(null);
          return null;
        }
        if (response.status === 401) {
          signOut();
          return null;
        }
        if (response.ok) return response.json();
        return null;
      })
      .then((data) => {
        if (data?.id) {
          setSeatReservationId(data.id);
        }
      })
      .catch((error) => {
        console.error("Error fetching seat reservation:", error);
      });
  }, [props.event.id, token, email, hasSeating, signOut]);

  // Define steps based on response
  const getSteps = () => {
    const baseSteps = ["Response", "Handle"];

    if (response === RSVP.no) {
      return ["Response", "Review"];
    }

    const steps = [...baseSteps, "Attendance"];

    // Only add seat selection step if event has seating
    if (hasSeating) {
      steps.push("Seat");
    }

    steps.push("Review");
    return steps;
  };

  const steps = getSteps();

  // Check if current step is valid
  const isStepValid = () => {
    switch (activeStep) {
      case 0: // Response step
        return response !== null;
      case 1: // Handle step (or Review if response is No)
        if (response === RSVP.no) {
          return true; // Review step is always valid
        }
        return handleValid && handle.trim().length > 0;
      case 2: // Attendance step (only if not No response)
        if (response === RSVP.no) return true;
        return attendance !== null && attendance.some((v) => v === 1);
      case 3: // Seat or Review step
        // If this is the seat step and seat is required, check if user has a reservation
        if (steps[activeStep] === "Seat") {
          // Seat is required if seating is enabled and unspecified seat is not allowed
          const seatRequired = hasSeating && !allowUnspecifiedSeat;
          if (seatRequired) {
            // User must have a seat reservation to proceed
            return seatReservationId !== null;
          }
        }
        return true; // Seat selection is optional or this is review
      case 4: // Final review step
        return true;
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (activeStep === steps.length - 1) {
      // Last step - save
      handleSave();
    } else {
      setActiveStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    setActiveStep((prev) => prev - 1);
  };

  const handleClose = () => {
    // Check if there are unsaved changes
    const hasChanges =
      response !== props.initialData?.response ||
      handle !== (props.initialData?.handle || "") ||
      JSON.stringify(attendance) !==
        JSON.stringify(props.initialData?.attendance);

    if (hasChanges && !saving) {
      setShowExitWarning(true);
    } else {
      props.onClose();
      resetWizard();
    }
  };

  const handleForceClose = () => {
    setShowExitWarning(false);
    props.onClose();
    resetWizard();
  };

  const resetWizard = () => {
    setActiveStep(0);
    setResponse(props.initialData?.response || null);
    setHandle(props.initialData?.handle || "");
    setAttendance(props.initialData?.attendance || null);
    setHandleValid(false);
  };

  const handleSave = () => {
    setSaving(true);

    // For "No" response, we don't need handle or attendance
    const finalAttendance =
      response === RSVP.no
        ? null
        : attendance ||
          calculateDefaultAttendance(
            props.event.timeBegin,
            props.event.timeEnd,
          );

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
          handle: response === RSVP.no ? null : handle,
          response: response,
          attendance: finalAttendance,
        }),
      },
    )
      .then((response) => {
        if (response.status === 401) {
          signOut();
        } else if (response.status === 204) {
          enqueueSnackbar("RSVP saved successfully", { variant: "success" });
          props.onSaved();
          props.onClose();
          resetWizard();
        } else {
          throw new Error("Unable to save RSVP");
        }
      })
      .catch((error) => {
        console.error("Error saving RSVP:", error);
        enqueueSnackbar("Failed to save RSVP", { variant: "error" });
      })
      .finally(() => {
        setSaving(false);
      });
  };

  // Handle response change - update attendance when switching to Yes/Maybe
  const handleResponseChange = (newResponse: RSVP | null) => {
    setResponse(newResponse);

    // If switching to Yes/Maybe and no attendance set, calculate default
    if (
      newResponse &&
      newResponse !== RSVP.no &&
      (!attendance || attendance.length === 0)
    ) {
      setAttendance(
        calculateDefaultAttendance(props.event.timeBegin, props.event.timeEnd),
      );
    }
  };

  const renderStepContent = (step: number) => {
    const currentStepName = steps[step];

    switch (currentStepName) {
      case "Response":
        return (
          <RSVPResponseStep
            value={response}
            onChange={handleResponseChange}
            disabled={saving}
          />
        );
      case "Handle":
        return (
          <GamerHandleStep
            value={handle}
            onChange={setHandle}
            onValidationChange={setHandleValid}
            disabled={saving}
          />
        );
      case "Attendance":
        return (
          <AttendanceStep
            timeBegin={props.event.timeBegin}
            timeEnd={props.event.timeEnd}
            value={attendance}
            onChange={setAttendance}
            disabled={saving}
          />
        );
      case "Seat":
        return (
          <SeatSelectionStep
            eventId={props.event.id}
            attendanceBuckets={attendance}
            hasSeating={hasSeating}
            allowUnspecifiedSeat={allowUnspecifiedSeat}
            disabled={saving}
            onReservationChange={() => {
              // Seat reservation changed, refresh the reservation status
              // Re-fetch to update seatReservationId
              if (!props.event.id || !token || !email) return;

              fetch(`/api/events/${props.event.id}/seat-reservations/me`, {
                headers: {
                  "Content-Type": "application/json",
                  Accept: "application/json",
                  Authorization: "Bearer " + token,
                },
              })
                .then((response) => {
                  if (response.status === 404) {
                    setSeatReservationId(null);
                    return null;
                  }
                  if (response.ok) return response.json();
                  return null;
                })
                .then((data) => {
                  if (data?.id) {
                    setSeatReservationId(data.id);
                  } else {
                    setSeatReservationId(null);
                  }
                })
                .catch((error) => {
                  console.error("Error fetching seat reservation:", error);
                });
            }}
          />
        );
      case "Review":
        return (
          <ReviewStep
            response={response}
            handle={handle}
            attendance={attendance}
            timeBegin={props.event.timeBegin}
            timeEnd={props.event.timeEnd}
          />
        );
      default:
        return <div>Unknown step</div>;
    }
  };

  const getPreviousResponseText = () => {
    if (!props.initialData?.response) {
      return "Not responded";
    }
    switch (props.initialData.response) {
      case RSVP.yes:
        return "Yes";
      case RSVP.maybe:
        return "Maybe";
      case RSVP.no:
        return "No";
      default:
        return "Not responded";
    }
  };

  return (
    <>
      <Dialog
        open={props.open}
        onClose={handleClose}
        maxWidth="md"
        fullWidth
        aria-labelledby="rsvp-wizard-title"
      >
        <DialogTitle id="rsvp-wizard-title">
          RSVP to {props.event.title}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2 }}>
            <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
              {steps.map((label) => (
                <Step key={label}>
                  <StepLabel>{label}</StepLabel>
                </Step>
              ))}
            </Stepper>

            {saving && <LinearProgress sx={{ mb: 2 }} />}

            <Box sx={{ minHeight: 300 }}>{renderStepContent(activeStep)}</Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} disabled={saving}>
            Cancel
          </Button>
          <Box sx={{ flex: "1 1 auto" }} />
          <Button onClick={handleBack} disabled={activeStep === 0 || saving}>
            Back
          </Button>
          <Button
            variant="contained"
            onClick={handleNext}
            disabled={!isStepValid() || saving}
          >
            {activeStep === steps.length - 1 ? "Confirm RSVP" : "Next"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Exit warning dialog */}
      <Dialog
        open={showExitWarning}
        onClose={() => setShowExitWarning(false)}
        maxWidth="sm"
      >
        <DialogTitle>Unsaved Changes</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            Your RSVP has not been saved yet.
          </Alert>
          <Box>
            <strong>Current status:</strong> {getPreviousResponseText()}
          </Box>
          <Box sx={{ mt: 1 }}>
            Are you sure you want to exit without saving your changes?
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowExitWarning(false)}>
            Continue Editing
          </Button>
          <Button onClick={handleForceClose} color="error" variant="outlined">
            Exit Without Saving
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
