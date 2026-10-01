import * as React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import moment from "moment";
import { RSVP } from "../../types/invitations";
import { getAttendanceDescription } from "../../utils/attendanceDescription";
import { colors, fonts, hairline, tones } from "../hl";
import AttendanceStrip from "../AttendanceStrip";
import { rsvpState } from "../lobbyModel";

interface ReviewStepProps {
  response: RSVP | null;
  handle: string;
  attendance: number[] | null;
  timeBegin: moment.Moment;
  timeEnd: moment.Moment;
  seatLabel?: string | null;
  seatRoomName?: string | null;
  hasSeating: boolean;
}

const RESPONSE_TEXT: Record<
  string,
  { text: string; tone: keyof typeof tones }
> = {
  yes: { text: "I'm in", tone: "lime" },
  maybe: { text: "Maybe", tone: "amber" },
  no: { text: "Can't make it", tone: "pink" },
  none: { text: "Not set", tone: "neutral" },
};

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "140px 1fr" },
        gap: { xs: 0.5, md: 2 },
        alignItems: "baseline",
        py: 1.5,
        borderBottom: `1px solid ${hairline.faint}`,
        "&:last-of-type": { borderBottom: 0 },
      }}
    >
      <Box
        component="dt"
        sx={{
          fontFamily: fonts.mono,
          fontSize: 11,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: colors.textDim,
        }}
      >
        {label}
      </Box>
      <Box component="dd" sx={{ m: 0, minWidth: 0 }}>
        {children}
      </Box>
    </Box>
  );
}

/** Final step: summary of the RSVP before it's saved. */
export default function ReviewStep(props: ReviewStepProps) {
  const state = rsvpState(props.response);
  const resp = RESPONSE_TEXT[state];
  const going = props.response !== RSVP.no;

  const seatText =
    props.seatLabel !== null && props.seatLabel !== undefined
      ? props.seatRoomName
        ? `${props.seatLabel} · ${props.seatRoomName}`
        : props.seatLabel
      : "Not selected";

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      <Typography
        component="p"
        sx={{ m: 0, fontSize: 15, color: colors.textMuted }}
      >
        Check it over, then lock it in.
      </Typography>
      <Box
        component="dl"
        sx={{
          m: 0,
          px: 2,
          border: `1px solid ${hairline.panel}`,
          backgroundColor: "rgba(6,7,11,0.5)",
        }}
      >
        <Row label="Response">
          <Box
            component="span"
            sx={{
              fontSize: 18,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              color: tones[resp.tone].fg,
            }}
          >
            {resp.text}
          </Box>
        </Row>
        {going && (
          <>
            <Row label="Callsign">
              <Box
                component="span"
                sx={{ fontSize: 17, fontWeight: 600, overflowWrap: "anywhere" }}
              >
                {props.handle || "Not set"}
              </Box>
            </Row>
            <Row label="Attendance">
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <Box
                  component="span"
                  sx={{ fontSize: 15, color: colors.text2 }}
                >
                  {getAttendanceDescription(
                    props.attendance,
                    props.timeBegin,
                    props.timeEnd,
                  )}
                </Box>
                <Box aria-hidden="true">
                  <AttendanceStrip
                    attendance={props.attendance}
                    timeBegin={props.timeBegin}
                    timeEnd={props.timeEnd}
                    tone={state === "maybe" ? "amber" : "lime"}
                    size="lg"
                  />
                </Box>
              </Box>
            </Row>
            {props.hasSeating && (
              <Row label="Seat">
                <Box
                  component="span"
                  sx={{
                    fontFamily: fonts.mono,
                    fontSize: 15,
                    fontWeight: 700,
                    color:
                      props.seatLabel != null ? colors.cyan : colors.textMuted,
                  }}
                >
                  {seatText}
                </Box>
              </Row>
            )}
          </>
        )}
      </Box>
      {going && (
        <Typography
          component="p"
          sx={{ m: 0, fontSize: 13, color: colors.textMuted }}
        >
          After confirming you&apos;ll see the squad and can vote on games.
        </Typography>
      )}
    </Box>
  );
}
