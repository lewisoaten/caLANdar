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
import { getAttendanceGrid, TIME_PERIODS } from "../utils/attendanceBuckets";

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

/** Icon component per slot, indexed by slot number. */
const SLOT_ICONS = [WbTwilightIcon, WbSunnyIcon, BedtimeIcon, HotelIcon];

/** Stable ToggleButton value for a given day/slot pair. */
const buttonValue = (dayNum: number, slot: number) => dayNum * 4 + slot;

export default function InvitationResponse(props: AttendanceSelectorProps) {
  // The UTC day/slot grid the API validates against. Deriving this from the
  // browser's local calendar makes the bucket count timezone-dependent, which
  // caused RSVPs to be rejected outright.
  const grid = getAttendanceGrid(props.timeBegin, props.timeEnd);

  const bucketCount = grid.reduce(
    (total, day) => total + day.slots.filter((slot) => slot.inRange).length,
    0,
  );

  // Normalise the incoming value to exactly one entry per in-range bucket,
  // defaulting missing entries to "attending".
  const attendance: number[] = Array.from({ length: bucketCount }, (_, i) =>
    props.value && props.value.length > i ? props.value[i] : 1,
  );

  const selectedButtonsFromAttendance = (current: number[]) => {
    const selected: number[] = [];
    grid.forEach((day, dayNum) => {
      day.slots.forEach((slot) => {
        if (slot.attendanceIndex === null) return;
        if (current[slot.attendanceIndex] === 1) {
          selected.push(buttonValue(dayNum, slot.slot));
        }
      });
    });
    return selected;
  };

  const attendanceFromSelectedButtons = (selected: number[]) => {
    const next = Array.from({ length: bucketCount }, () => 0);
    grid.forEach((day, dayNum) => {
      day.slots.forEach((slot) => {
        if (slot.attendanceIndex === null) return;
        if (selected.includes(buttonValue(dayNum, slot.slot))) {
          next[slot.attendanceIndex] = 1;
        }
      });
    });
    return next;
  };

  const buttonColour = props.colour ? props.colour : "primary";

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

  const isSelected = (value: number) => selectedButtons.includes(value);

  const slotIcon = (
    value: number,
    icon: React.ReactElement<unknown>,
    label: string,
    disabled: boolean,
  ) => {
    const selected = isSelected(value);
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
      {grid.map((day, dayNum) => (
        <TimelineItem key={dayNum}>
          <TimelineOppositeContent
            sx={{ m: "auto 0" }}
            align="right"
            variant="body2"
            color="text.secondary"
          >
            {day.dayStart.format("ddd Do")}
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
              {day.slots.map((slot) => {
                const Icon = SLOT_ICONS[slot.slot];
                return (
                  <ToggleButton
                    key={slot.slot}
                    value={buttonValue(dayNum, slot.slot)}
                    disabled={!slot.inRange}
                  >
                    {slotIcon(
                      buttonValue(dayNum, slot.slot),
                      <Icon />,
                      TIME_PERIODS[slot.slot],
                      !slot.inRange,
                    )}
                  </ToggleButton>
                );
              })}
            </ToggleButtonGroup>
          </TimelineContent>
        </TimelineItem>
      ))}
    </Timeline>
  );
}
