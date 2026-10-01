import * as React from "react";
import Box from "@mui/material/Box";
import CheckCircleOutlineSharp from "@mui/icons-material/CheckCircleOutlineSharp";
import HelpOutlineSharp from "@mui/icons-material/HelpOutlineSharp";
import HighlightOffSharp from "@mui/icons-material/HighlightOffSharp";
import { RSVP } from "../../types/invitations";
import { colors, tint, tones, type HlTone } from "../hl";

interface RSVPResponseStepProps {
  value: RSVP | null;
  onChange: (value: RSVP | null) => void;
  disabled?: boolean;
}

const OPTIONS: Array<{
  value: RSVP;
  label: string;
  sub: string;
  tone: HlTone;
  Icon: React.ElementType;
}> = [
  {
    value: RSVP.yes,
    label: "I'm in",
    sub: "Count me in",
    tone: "lime",
    Icon: CheckCircleOutlineSharp,
  },
  {
    value: RSVP.maybe,
    label: "Maybe",
    sub: "Not sure yet",
    tone: "amber",
    Icon: HelpOutlineSharp,
  },
  {
    value: RSVP.no,
    label: "Can't make it",
    sub: "Sitting this out",
    tone: "pink",
    Icon: HighlightOffSharp,
  },
];

/** Step 1: are you coming? Three large toggle cards. */
export default function RSVPResponseStep(props: RSVPResponseStepProps) {
  return (
    <Box
      role="group"
      aria-label="Your response"
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "repeat(3, minmax(0, 1fr))" },
        gap: 1.25,
      }}
    >
      {OPTIONS.map(({ value, label, sub, tone, Icon }) => {
        const selected = props.value === value;
        const t = tones[tone];
        return (
          <Box
            component="button"
            type="button"
            key={value}
            aria-pressed={selected}
            disabled={props.disabled}
            onClick={() => props.onChange(value)}
            sx={{
              minHeight: { xs: 76, md: 110 },
              p: 2,
              display: "flex",
              flexDirection: { xs: "row", md: "column" },
              alignItems: { xs: "center", md: "flex-start" },
              justifyContent: { xs: "flex-start", md: "space-between" },
              gap: 1.25,
              textAlign: "left",
              cursor: "pointer",
              font: "inherit",
              border: `1px solid ${selected ? t.border : tint("cyan", 0.18)}`,
              backgroundColor: selected ? tint(tone, 0.1) : "rgba(6,7,11,0.5)",
              color: colors.text,
              transition: "border-color .15s, background-color .15s",
              "&:hover:not(:disabled)": {
                borderColor: selected ? t.border : tint("cyan", 0.45),
              },
              "&:focus-visible": {
                outline: `2px solid ${colors.cyan}`,
                outlineOffset: 2,
              },
              "&:disabled": { cursor: "not-allowed", opacity: 0.6 },
            }}
          >
            <Icon aria-hidden="true" sx={{ fontSize: 28, color: t.fg }} />
            <Box
              component="span"
              sx={{ display: "flex", flexDirection: "column", gap: "2px" }}
            >
              <Box
                component="span"
                sx={{
                  fontSize: 18,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  color: t.fg,
                }}
              >
                {label}
              </Box>
              <Box
                component="span"
                sx={{ fontSize: 13, color: colors.textMuted }}
              >
                {sub}
              </Box>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
