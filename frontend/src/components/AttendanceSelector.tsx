import * as React from "react";
import { useState } from "react";
import { ToggleButtonGroup, ToggleButton, Tooltip, Badge } from "@mui/material";
import WbTwilightIcon from "@mui/icons-material/WbTwilight";
import WbSunnyIcon from "@mui/icons-material/WbSunny";
import BedtimeIcon from "@mui/icons-material/Bedtime";
import HotelIcon from "@mui/icons-material/Hotel";
import CalendarTodayIcon from "@mui/icons-material/CalendarToday";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
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

  let firstButtonForAttendance: number | undefined;

  //Create array of dates between timeBegin and timeEnd
  const dates = Array.from(Array(numberOfDays)).map((_, day_number) => {
    return Array.from(Array(4)).map((_, bucket_number) => {
      const day = moment(props.timeBegin)
        .startOf("day")
        .add(day_number, "days");
      const bucket = moment(day).add(6 * (bucket_number + 1), "hours");
      if (
        props.timeBegin < moment(bucket).add(6, "hours") &&
        props.timeEnd >= bucket
      ) {
        if (firstButtonForAttendance === undefined) {
          firstButtonForAttendance = day_number * 4 + bucket_number;
        }
        return 1;
      }

      return 0;
    });
  });

  const buttonColour = props.colour ? props.colour : "primary";

  const calculatedAttendance = dates.flat().filter((e) => e === 1);

  const attendance: number[] = calculatedAttendance.map((_, i) => {
    return props.value && props.value.length > i ? props.value[i] : 1;
  });

  const selectedButtonsFromAttendance = (attendance: number[]) => {
    // Convert array of 1s and 0s to array of indices of 1s
    const selectedButtons: number[] = [];

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
    _event: React.MouseEvent<HTMLElement>,
    newSelectedButtons: number[],
  ) => {
    if (props.onChange) {
      setSelectedButtons(newSelectedButtons);
      props.onChange(attendanceFromSelectedButtons(newSelectedButtons));
    }
  };

  const isSelected = (buttonValue: number) =>
    selectedButtons.includes(buttonValue);

  const slotIcon = (
    buttonValue: number,
    icon: React.ReactElement<unknown>,
    label: string,
    disabled: boolean,
  ) => {
    const selected = isSelected(buttonValue);
    const showBadge = !disabled;
    return (
      <Tooltip title={label}>
        <Badge
          invisible={!showBadge}
          badgeContent={
            selected ? (
              <CheckCircleIcon sx={{ fontSize: 14 }} />
            ) : (
              <CancelIcon sx={{ fontSize: 14 }} />
            )
          }
          overlap="circular"
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          sx={{
            "& .MuiBadge-badge": {
              color: selected ? "success.main" : "error.main",
              backgroundColor: "transparent",
              minWidth: "auto",
              height: "auto",
              padding: 0,
            },
          }}
        >
          {icon}
        </Badge>
      </Tooltip>
    );
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
                {slotIcon(
                  idx * 4 + 0,
                  <WbTwilightIcon />,
                  "Morning",
                  bucket_array[0] === 0,
                )}
              </ToggleButton>
              <ToggleButton
                value={idx * 4 + 1}
                disabled={bucket_array[1] === 0}
              >
                {slotIcon(
                  idx * 4 + 1,
                  <WbSunnyIcon />,
                  "Afternoon",
                  bucket_array[1] === 0,
                )}
              </ToggleButton>
              <ToggleButton
                value={idx * 4 + 2}
                disabled={bucket_array[2] === 0}
              >
                {slotIcon(
                  idx * 4 + 2,
                  <BedtimeIcon />,
                  "Evening",
                  bucket_array[2] === 0,
                )}
              </ToggleButton>
              <ToggleButton
                value={idx * 4 + 3}
                disabled={bucket_array[3] === 0}
              >
                {slotIcon(
                  idx * 4 + 3,
                  <HotelIcon />,
                  "Overnight",
                  bucket_array[3] === 0,
                )}
              </ToggleButton>
            </ToggleButtonGroup>
          </TimelineContent>
        </TimelineItem>
      ))}
    </Timeline>
  );
}
