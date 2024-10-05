import * as React from "react";
import { useState } from "react";
import { ToggleButtonGroup, ToggleButton, Tooltip } from "@mui/material";
import WbTwilightIcon from "@mui/icons-material/WbTwilight";
import WbSunnyIcon from "@mui/icons-material/WbSunny";
import BedtimeIcon from "@mui/icons-material/Bedtime";
import HotelIcon from "@mui/icons-material/Hotel";
import CalendarTodayIcon from "@mui/icons-material/CalendarToday";
import Timeline from "@mui/lab/Timeline";
import TimelineItem from "@mui/lab/TimelineItem";
import TimelineSeparator from "@mui/lab/TimelineSeparator";
import TimelineConnector from "@mui/lab/TimelineConnector";
import TimelineContent from "@mui/lab/TimelineContent";
import TimelineDot from "@mui/lab/TimelineDot";
import TimelineOppositeContent from "@mui/lab/TimelineOppositeContent";
import moment from "moment";

interface AttendanceSelectorProps {
  timeBegin: moment.Moment;
  timeEnd: moment.Moment;
  value: number[] | null;
  colour?:
    | "primary"
    | "error"
    | "secondary"
    | "info"
    | "success"
    | "warning"
    | "standard"
    | undefined;
  onChange?: (value: number[]) => void;
}

export default function InvitationResponse(props: AttendanceSelectorProps) {
  const numberOfDays =
    moment(props.timeEnd)
      .startOf("day")
      .diff(moment(props.timeBegin).startOf("day"), "days") + 1;

  var firstButtonForAttendance: number | undefined;

  //Create array of dates between timeBegin and timeEnd
  const dates = Array.from(Array(numberOfDays)).map((_, day_number) => {
    return Array.from(Array(4)).map((_, bucket_number) => {
      const day = moment(props.timeBegin)
        .startOf("day")
        .add(day_number, "days");
      const bucket = moment(day).add(6 * (bucket_number + 1), "hours");
      if (props.timeBegin <= bucket && props.timeEnd >= bucket) {
        if (firstButtonForAttendance === undefined)
          firstButtonForAttendance = day_number * 4 + bucket_number;
        return 1;
      }

      return 0;
    });
  });

  const buttonColour = props.colour ? props.colour : "primary";

  const calculatedAttendance = dates.flat().filter((e) => e === 1);

  const attendance: number[] = calculatedAttendance.map((e, i) => {
    return props.value && props.value.length > i ? props.value[i] : 1;
  });

  const selectedButtonsFromAttendance = (attendance: number[]) => {
    // Convert array of 1s and 0s to array of indices of 1s
    var selectedButtons: number[] = [];

    dates.flat().forEach((e, i) => {
      if (
        e === 1 &&
        firstButtonForAttendance !== undefined &&
        attendance[i - firstButtonForAttendance] === 1
      ) {
        selectedButtons.push(i);
      }
    });
    return selectedButtons;
  };

  const attendanceFromSelectedButtons = (selectedButtons: number[]) => {
    return attendance.map((_, idx) => {
      if (
        firstButtonForAttendance !== undefined &&
        selectedButtons.includes(idx + firstButtonForAttendance)
      )
        return 1;
      return 0;
    });
  };

  const [selectedButtons, setSelectedButtons] = useState(
    selectedButtonsFromAttendance(attendance),
  );

  const handleButtonChange = (
    event: React.MouseEvent<HTMLElement>,
    newSelectedButtons: number[],
  ) => {
    if (props.onChange) {
      setSelectedButtons(newSelectedButtons);
      props.onChange(attendanceFromSelectedButtons(newSelectedButtons));
    }
  };

  return (
    <Timeline>
      {dates.map((bucket_array, idx) => (
        <TimelineItem key={idx}>
          <TimelineOppositeContent
            sx={{ m: "auto 0" }}
            align="right"
            variant="body2"
            color="text.secondary"
          >
            {moment(props.timeBegin).add(idx, "days").format("ddd Do")}
          </TimelineOppositeContent>
          <TimelineSeparator>
            <TimelineConnector />
            <TimelineDot color="primary" variant="outlined">
              <CalendarTodayIcon />
            </TimelineDot>
            <TimelineConnector />
          </TimelineSeparator>
          <TimelineContent sx={{ py: "12px", px: 2 }}>
            <ToggleButtonGroup
              color={buttonColour}
              value={selectedButtons}
              onChange={handleButtonChange}
            >
              <ToggleButton
                value={idx * 4 + 0}
                disabled={bucket_array[0] === 0}
              >
                <Tooltip title="Morning">
                  <WbTwilightIcon />
                </Tooltip>
              </ToggleButton>
              <ToggleButton
                value={idx * 4 + 1}
                disabled={bucket_array[1] === 0}
              >
                <Tooltip title="Afternoon">
                  <WbSunnyIcon />
                </Tooltip>
              </ToggleButton>
              <ToggleButton
                value={idx * 4 + 2}
                disabled={bucket_array[2] === 0}
              >
                <Tooltip title="Evening">
                  <BedtimeIcon />
                </Tooltip>
              </ToggleButton>
              <ToggleButton
                value={idx * 4 + 3}
                disabled={bucket_array[3] === 0}
              >
                <Tooltip title="Overnight">
                  <HotelIcon />
                </Tooltip>
              </ToggleButton>
            </ToggleButtonGroup>
          </TimelineContent>
        </TimelineItem>
      ))}
    </Timeline>
  );
}
