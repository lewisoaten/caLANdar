import * as React from "react";
import { useState, useEffect, useContext, useCallback, useRef } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import LinearProgress from "@mui/material/LinearProgress";
import Typography from "@mui/material/Typography";
import CloseSharp from "@mui/icons-material/CloseSharp";
import { useSnackbar } from "notistack";
import { UserContext, UserDispatchContext } from "../../UserProvider";
import { EventData } from "../../types/events";
import { RSVP, InvitationData } from "../../types/invitations";
import { calculateDefaultAttendance } from "../../utils/attendance";
import { apiErrorFrom, userFacingReason } from "../../utils/apiError";
import { captureHandledError } from "../../utils/sentryReporting";
import RSVPResponseStep from "./RSVPResponseStep";
import GamerHandleStep from "./GamerHandleStep";
import AttendanceStep from "./AttendanceStep";
import SeatSelectionStep from "./SeatSelectionStep";
import ReviewStep from "./ReviewStep";
import { colors, effects, fonts, hairline, tint, useIsMobile } from "../hl";

export type WizardStep =
  "Response" | "Attendance" | "Handle" | "Seat" | "Review";

/** Heading shown for each step. */
export const STEP_TITLES: Record<WizardStep, string> = {
  Response: "Are you coming?",
  Attendance: "When are you there?",
  Handle: "Your callsign",
  Seat: "Pick a seat",
  Review: "Review & lock in",
};

/**
 * Steps for a response: response → attendance → callsign → seat (only when
 * the event has seating) → review. A "no" skips straight to review.
 */
export const getWizardSteps = (
  response: RSVP | null,
  hasSeating: boolean,
): WizardStep[] => {
  if (response === RSVP.no) return ["Response", "Review"];
  const steps: WizardStep[] = ["Response", "Attendance", "Handle"];
  if (hasSeating) steps.push("Seat");
  steps.push("Review");
  return steps;
};

const srOnlyStyle: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  border: 0,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
};

interface RSVPWizardProps {
  open: boolean;
  onClose: () => void;
  event: EventData;
  initialData?: InvitationData;
  onSaved: () => void;
  asAdmin?: boolean;
}

export default function RSVPWizard(props: RSVPWizardProps) {
  const { signOut } = useContext(UserDispatchContext);
  const userDetails = useContext(UserContext);
  const token = userDetails?.token;
  const email =
    props.asAdmin && props.initialData?.email
      ? props.initialData.email
      : userDetails?.email;
  const { enqueueSnackbar } = useSnackbar();
  const isMobile = useIsMobile();
  const stepHeadingRef = useRef<HTMLHeadingElement | null>(null);

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
  const [unspecifiedSeatLabel, setUnspecifiedSeatLabel] =
    useState<string>("Unspecified Seat");

  // Seat selection state - null means unspecified/skip
  const [selectedSeatId, setSelectedSeatId] = useState<number | null>(null);
  const [reservedSeatId, setReservedSeatId] = useState<number | null>(null);
  const [selectedSeatLabel, setSelectedSeatLabel] = useState<string | null>(
    null,
  );
  const [selectedSeatRoomName, setSelectedSeatRoomName] = useState<
    string | null
  >(null);
  const clearSeatSelection = useCallback(() => {
    setSelectedSeatId(null);
    setSelectedSeatLabel(null);
    setSelectedSeatRoomName(null);
  }, []);

  // Reset wizard state when opening with new data
  useEffect(() => {
    if (props.open) {
      setActiveStep(0);
      setResponse(props.initialData?.response || null);
      setHandle(props.initialData?.handle || "");
      setAttendance(props.initialData?.attendance || null);
      setHandleValid(false);
      clearSeatSelection();
      setReservedSeatId(null);
    }
  }, [props.open, props.initialData, clearSeatSelection]);

  // Check if event has seating configured
  useEffect(() => {
    if (!props.event.id || !token) return;

    fetch(`/api/events/${props.event.id}/seating-config`, {
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
          setUnspecifiedSeatLabel(
            data.unspecifiedSeatLabel || "Unspecified Seat",
          );
        }
      })
      .catch((error) => {
        console.error("Error fetching seating config:", error);
      });
  }, [props.event.id, token, signOut]);

  // Check if user has an existing seat reservation and load it into wizard state
  useEffect(() => {
    if (!props.open || !props.event.id || !token || !email || !hasSeating)
      return;

    fetch(`/api/events/${props.event.id}/seat-reservations/me`, {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: "Bearer " + token,
      },
    })
      .then((response) => {
        if (response.status === 404) {
          // No reservation exists
          setSelectedSeatId(null);
          setReservedSeatId(null);
          setSelectedSeatLabel(
            allowUnspecifiedSeat ? unspecifiedSeatLabel : null,
          );
          setSelectedSeatRoomName(null);
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
          // Fetch seat label if seatId is not null
          if (data.seatId === null) {
            // Unspecified seat
            setSelectedSeatId(null);
            setReservedSeatId(null);
            setSelectedSeatLabel(unspecifiedSeatLabel);
            setSelectedSeatRoomName(null);
          } else if (data.seatId) {
            // Set the selected seat ID
            setSelectedSeatId(data.seatId);
            setReservedSeatId(data.seatId);

            // Fetch the actual seat label and room
            fetch(`/api/events/${props.event.id}/seats/${data.seatId}`, {
              headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                Authorization: "Bearer " + token,
              },
            })
              .then((response) => {
                if (response.ok) return response.json();
                return null;
              })
              .then((seatData) => {
                if (seatData?.label) {
                  setSelectedSeatLabel(seatData.label);
                  // Fetch room name
                  if (seatData.roomId) {
                    fetch(
                      `/api/events/${props.event.id}/rooms/${seatData.roomId}`,
                      {
                        headers: {
                          "Content-Type": "application/json",
                          Accept: "application/json",
                          Authorization: "Bearer " + token,
                        },
                      },
                    )
                      .then((response) => {
                        if (response.ok) return response.json();
                        return null;
                      })
                      .then((roomData) => {
                        if (roomData?.name) {
                          setSelectedSeatRoomName(roomData.name);
                        }
                      })
                      .catch((error) => {
                        console.error("Error fetching room:", error);
                      });
                  }
                }
              })
              .catch((error) => {
                console.error("Error fetching seat:", error);
              });
          }
        } else if (allowUnspecifiedSeat) {
          // No reservation but optional seating - default to unspecified
          setSelectedSeatId(null);
          setReservedSeatId(null);
          setSelectedSeatLabel(unspecifiedSeatLabel);
          setSelectedSeatRoomName(null);
        } else {
          setSelectedSeatId(null);
          setReservedSeatId(null);
          setSelectedSeatLabel(null);
          setSelectedSeatRoomName(null);
        }
      })
      .catch((error) => {
        console.error("Error fetching seat reservation:", error);
      });
  }, [props.open, props.event.id, token, email, hasSeating, signOut]);

  // Define steps based on response (see STEP_TITLES for the order)
  const steps = getWizardSteps(response, hasSeating);
  const currentStep = steps[activeStep] ?? "Response";

  // Move focus to the new step's heading so keyboard and screen-reader users
  // land on (and hear) the new step. The callsign input focuses itself.
  const previousStep = useRef(activeStep);
  useEffect(() => {
    if (previousStep.current === activeStep) return;
    previousStep.current = activeStep;
    if (currentStep !== "Handle") stepHeadingRef.current?.focus();
  }, [activeStep, currentStep]);

  // Check if current step is valid
  const isStepValid = () => {
    switch (currentStep) {
      case "Response":
        return response !== null;
      case "Attendance":
        return attendance !== null && attendance.some((v) => v === 1);
      case "Handle":
        return handleValid && handle.trim().length > 0;
      case "Seat":
        // A seat is required if seating is enabled and "unspecified" (bring
        // your own desk) is not allowed.
        if (hasSeating && !allowUnspecifiedSeat) return selectedSeatId !== null;
        return true;
      case "Review":
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
    // Closing is blocked while the RSVP is being saved.
    if (saving) return;
    // Check if there are unsaved changes
    const hasChanges =
      (response ?? null) !== (props.initialData?.response ?? null) ||
      handle !== (props.initialData?.handle || "") ||
      JSON.stringify(attendance ?? null) !==
        JSON.stringify(props.initialData?.attendance ?? null) ||
      selectedSeatId !== reservedSeatId;

    if (hasChanges) {
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
    clearSeatSelection();
    setReservedSeatId(null);
  };

  const handleSave = async () => {
    setSaving(true);

    // For "No" response, preserve existing handle but set attendance to null
    const finalHandle =
      response === RSVP.no ? props.initialData?.handle || null : handle || "";
    const finalAttendance =
      response === RSVP.no
        ? null
        : attendance ||
          calculateDefaultAttendance(
            props.event.timeBegin,
            props.event.timeEnd,
          );

    try {
      // Step 1: Save RSVP
      const rsvpUrl = props.asAdmin
        ? `/api/events/${props.event.id}/invitations/${encodeURIComponent(
            email,
          )}?as_admin=true`
        : `/api/events/${props.event.id}/invitations/${encodeURIComponent(
            email,
          )}`;

      const rsvpResponse = await fetch(rsvpUrl, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({
          handle: finalHandle,
          response,
          attendance: finalAttendance,
        }),
      });

      if (rsvpResponse.status === 401) {
        signOut();
        return;
      }

      if (rsvpResponse.status !== 204) {
        throw await apiErrorFrom("Unable to save RSVP", rsvpResponse);
      }

      // Step 2: Save seat reservation if seating is enabled and user is attending
      if (hasSeating && response !== RSVP.no) {
        try {
          // Delete any existing reservation first
          const deleteUrl = props.asAdmin
            ? `/api/events/${
                props.event.id
              }/seat-reservations/${encodeURIComponent(email)}?as_admin=true`
            : `/api/events/${props.event.id}/seat-reservations/me`;

          await fetch(deleteUrl, {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              Authorization: "Bearer " + token,
            },
          });

          // Create new reservation with selected seat (or null for unspecified)
          const createUrl = props.asAdmin
            ? `/api/events/${props.event.id}/seat-reservations?as_admin=true`
            : `/api/events/${props.event.id}/seat-reservations/me`;

          const createBody = props.asAdmin
            ? {
                invitationEmail: email,
                seatId: selectedSeatId,
                attendanceBuckets: finalAttendance,
              }
            : {
                seatId: selectedSeatId,
                attendanceBuckets: finalAttendance,
              };

          const seatReservationResponse = await fetch(createUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              Authorization: "Bearer " + token,
            },
            body: JSON.stringify(createBody),
          });

          if (!seatReservationResponse.ok) {
            throw await apiErrorFrom(
              "Unable to save seat reservation",
              seatReservationResponse,
            );
          }
        } catch (seatError) {
          console.error("Error saving seat reservation:", seatError);
          // The RSVP itself succeeded, so this is otherwise invisible: it was
          // only ever logged to the browser console.
          captureHandledError(seatError, {
            tags: { rsvp_step: "seat_reservation" },
            extra: {
              eventId: props.event.id,
              seatId: selectedSeatId,
              asAdmin: Boolean(props.asAdmin),
            },
          });
          const reason = userFacingReason(seatError);
          enqueueSnackbar(
            reason
              ? `RSVP saved, but your seat couldn't be reserved: ${reason}`
              : "RSVP saved, but your seat couldn't be reserved. Please try again, or contact the organiser if it keeps happening.",
            { variant: "warning" },
          );
          props.onSaved();
          props.onClose();
          resetWizard();
          return;
        }
      }

      // Success!
      enqueueSnackbar("RSVP saved successfully", { variant: "success" });

      // Notify the app that RSVP status has changed
      window.dispatchEvent(new CustomEvent("calandar:rsvp-updated"));

      props.onSaved();
      props.onClose();
      resetWizard();
    } catch (error) {
      console.error("Error saving RSVP:", error);
      captureHandledError(error, {
        tags: { rsvp_step: "rsvp" },
        extra: { eventId: props.event.id, asAdmin: Boolean(props.asAdmin) },
      });
      const reason = userFacingReason(error);
      enqueueSnackbar(
        reason ? `Failed to save RSVP: ${reason}` : "Failed to save RSVP",
        { variant: "error" },
      );
    } finally {
      setSaving(false);
    }
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

  // Handle attendance change - always clear any seat selection to avoid stale seats
  const handleAttendanceChange = (newAttendance: number[] | null) => {
    setAttendance(newAttendance);
    clearSeatSelection();
  };

  // Handle seat selection change
  const handleSeatSelect = (
    seatId: number | null,
    label?: string,
    roomName?: string,
  ) => {
    setSelectedSeatId(seatId);
    setSelectedSeatLabel(label || null);
    setSelectedSeatRoomName(roomName || null);
  };

  const renderStepContent = (stepName: WizardStep) => {
    switch (stepName) {
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
            onChange={handleAttendanceChange}
            disabled={saving}
            tone={response === RSVP.maybe ? "warning" : "success"}
          />
        );
      case "Seat":
        return (
          <SeatSelectionStep
            eventId={props.event.id}
            attendanceBuckets={attendance}
            hasSeating={hasSeating}
            allowUnspecifiedSeat={allowUnspecifiedSeat}
            unspecifiedSeatLabel={unspecifiedSeatLabel}
            selectedSeatId={selectedSeatId}
            reservedSeatId={reservedSeatId}
            onSeatSelect={handleSeatSelect}
            disabled={saving}
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
            seatLabel={selectedSeatLabel}
            seatRoomName={selectedSeatRoomName}
            hasSeating={hasSeating}
          />
        );
      default:
        return null;
    }
  };

  const getPreviousResponseText = () => {
    switch (props.initialData?.response) {
      case RSVP.yes:
        return "I'm in";
      case RSVP.maybe:
        return "Maybe";
      case RSVP.no:
        return "Can't make it";
      default:
        return "Not responded";
    }
  };

  const isLastStep = activeStep === steps.length - 1;
  const stepValid = isStepValid();

  return (
    <>
      <Dialog
        open={props.open}
        onClose={handleClose}
        fullScreen={isMobile}
        maxWidth={false}
        aria-labelledby="rsvp-wizard-title rsvp-wizard-step-title"
        slotProps={{
          paper: {
            "aria-busy": saving,
            sx: {
              width: "100%",
              maxWidth: isMobile ? "none" : 640,
              maxHeight: isMobile ? "none" : "calc(100vh - 32px)",
              m: isMobile ? 0 : 2,
              border: isMobile ? 0 : undefined,
              boxShadow: isMobile
                ? "none"
                : `0 0 0 1px ${colors.bg}, ${effects.dialog}`,
            },
          },
          backdrop: {
            sx: {
              backgroundColor: "rgba(3,4,8,0.78)",
              backdropFilter: "blur(6px)",
            },
          },
        }}
      >
        <Box
          component="form"
          noValidate
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
            if (stepValid && !saving) handleNext();
          }}
          sx={{
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            flex: "1 1 auto",
          }}
        >
          <Box
            sx={{
              p: "20px 24px 16px",
              pt: isMobile
                ? "calc(16px + env(safe-area-inset-top, 0px))"
                : "20px",
              display: "flex",
              flexDirection: "column",
              gap: 1.75,
              borderBottom: `1px solid ${hairline.soft}`,
              flex: "none",
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
              <Box
                sx={{
                  flex: 1,
                  minWidth: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 0.5,
                }}
              >
                <Box
                  component="span"
                  sx={{
                    fontFamily: fonts.mono,
                    fontSize: 11,
                    letterSpacing: "0.18em",
                    color: colors.cyan,
                  }}
                >
                  <span id="rsvp-wizard-title" style={srOnlyStyle}>
                    RSVP to {props.event.title},
                  </span>
                  STEP {activeStep + 1} / {steps.length}
                </Box>
                <Typography
                  id="rsvp-wizard-step-title"
                  ref={stepHeadingRef}
                  tabIndex={-1}
                  component="h2"
                  sx={{
                    m: 0,
                    fontSize: 24,
                    fontWeight: 700,
                    lineHeight: 1.15,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    outline: "none",
                  }}
                >
                  {STEP_TITLES[currentStep]}
                </Typography>
              </Box>
              <IconButton
                aria-label="Close"
                onClick={handleClose}
                disabled={saving}
                sx={{
                  width: 44,
                  height: 44,
                  flex: "none",
                  border: `1px solid ${hairline.control}`,
                }}
              >
                <CloseSharp />
              </IconButton>
            </Box>
            <Box
              aria-hidden="true"
              sx={{
                display: "grid",
                gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))`,
                gap: "4px",
              }}
            >
              {steps.map((name, i) => (
                <Box
                  key={name}
                  sx={{
                    height: 4,
                    backgroundColor:
                      i <= activeStep ? colors.cyan : tint("cyan", 0.15),
                    transition: "background-color .2s",
                  }}
                />
              ))}
            </Box>
          </Box>

          {saving && (
            <LinearProgress
              aria-label="Saving your RSVP"
              sx={{ flex: "none" }}
            />
          )}

          <DialogContent
            sx={{
              p: "22px 24px",
              display: "flex",
              flexDirection: "column",
              gap: 1.75,
              minHeight: isMobile ? undefined : 200,
            }}
          >
            {renderStepContent(currentStep)}
          </DialogContent>

          <DialogActions
            sx={{
              justifyContent: "space-between",
              p: "16px 24px 22px",
              pb: isMobile
                ? "calc(16px + env(safe-area-inset-bottom, 0px))"
                : "22px",
              flex: "none",
            }}
          >
            <Button
              variant="outlined"
              color="inherit"
              onClick={handleBack}
              disabled={activeStep === 0 || saving}
            >
              Back
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={!stepValid || saving}
            >
              {saving ? "Saving…" : isLastStep ? "Lock it in" : "Next"}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      {/* Exit warning dialog */}
      <Dialog
        open={showExitWarning}
        onClose={() => setShowExitWarning(false)}
        maxWidth="xs"
        fullWidth
        aria-labelledby="rsvp-exit-title"
        aria-describedby="rsvp-exit-description"
      >
        <DialogTitle id="rsvp-exit-title">Unsaved changes</DialogTitle>
        <DialogContent>
          <Box
            id="rsvp-exit-description"
            sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}
          >
            <Typography component="p" sx={{ m: 0, color: colors.textMuted }}>
              Your RSVP hasn&apos;t been saved yet. Leave without saving your
              changes?
            </Typography>
            <Typography
              component="p"
              sx={{
                m: 0,
                fontFamily: fonts.mono,
                fontSize: 12,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: colors.textMuted,
              }}
            >
              Current status:{" "}
              <Box component="span" sx={{ color: colors.text }}>
                {getPreviousResponseText()}
              </Box>
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button
            variant="outlined"
            color="inherit"
            onClick={() => setShowExitWarning(false)}
            autoFocus
          >
            Keep editing
          </Button>
          <Button onClick={handleForceClose} color="error" variant="outlined">
            Discard changes
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
