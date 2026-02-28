import * as React from "react";
import { Typography, Stack, Alert } from "@mui/material";
import EventIcon from "@mui/icons-material/Event";
import AttendanceSelector from "../AttendanceSelector";
import { getAttendanceDescription } from "../../utils/attendanceDescription";
import moment from "moment";

interface AttendanceStepProps {
  timeBegin: moment.Moment;
  timeEnd: moment.Moment;
  value: number[] | null;
  onChange: (value: number[]) => void;
  disabled?: boolean;
}

export default function AttendanceStep(props: AttendanceStepProps) {
  const hasSelection =
    props.value && props.value.length > 0 && props.value.some((v) => v === 1);

  return (
    <Stack spacing={3}>
      <Typography variant="h6" component="h2">
        When will you be attending?
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Select the times you plan to attend. You can select multiple time slots.
      </Typography>
      {!props.value || props.value.length === 0 ? (
        <Alert severity="info">
          Please select at least one time slot when you will be attending.
        </Alert>
      ) : null}
      <AttendanceSelector
        timeBegin={props.timeBegin}
        timeEnd={props.timeEnd}
        value={props.value}
        colour="primary"
        onChange={props.onChange}
      />
      {hasSelection && (
        <Alert severity="success" icon={<EventIcon />}>
          <strong>Attending:</strong>{" "}
          {getAttendanceDescription(
            props.value,
            props.timeBegin,
            props.timeEnd,
          )}
        </Alert>
      )}
    </Stack>
  );
}
