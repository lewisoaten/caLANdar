import * as React from "react";
import { useId, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import ArrowForwardSharp from "@mui/icons-material/ArrowForwardSharp";
import { Tag, colors, fonts, hairline, tint } from "./hl";
import type { EventData } from "../types/events";
import {
  cardStatus,
  eventPhase,
  formatCardRange,
  formatDayBlock,
  type MyRsvp,
} from "./eventListModel";

interface EventCardProps {
  event: EventData;
  /** The user's RSVP (`undefined` while unknown: no tag is shown). */
  rsvp?: MyRsvp;
  /** Heading level of the title (default h2). */
  headingComponent?: "h2" | "h3";
  /** Clock override for stories/tests. */
  now?: number;
}

/**
 * One event in the Events grid: calendar tile, title, time range, description
 * and RSVP status tag. The whole card links to the event lobby.
 */
export default function EventCard({
  event,
  rsvp,
  headingComponent = "h2",
  now,
}: EventCardProps) {
  const id = useId();
  const titleId = `${id}-title`;
  const metaId = `${id}-meta`;
  const statusId = `${id}-status`;
  const descId = `${id}-desc`;

  const [mountedAt] = useState(() => Date.now());
  const { day, mon } = formatDayBlock(event.timeBegin);
  const status = cardStatus(
    eventPhase(event.timeBegin, event.timeEnd, now ?? mountedAt),
    rsvp,
  );

  return (
    <Box
      component={RouterLink}
      to={`/events/${event.id}`}
      aria-labelledby={`${titleId} ${metaId}${status ? ` ${statusId}` : ""}`}
      aria-describedby={event.description ? descId : undefined}
      sx={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        gap: "14px",
        height: "100%",
        minHeight: 44,
        p: "20px",
        border: `1px solid ${hairline.panel}`,
        backgroundColor: "rgba(12,15,24,0.82)",
        color: colors.text,
        textDecoration: "none",
        transition: "border-color .15s, background-color .15s",
        "&:hover": {
          borderColor: tint("cyan", 0.55),
          backgroundColor: "rgba(16,20,32,0.95)",
        },
        "&:focus-visible": {
          outline: `2px solid ${colors.cyan}`,
          outlineOffset: 2,
        },
      }}
    >
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: "14px" }}>
        <Box
          aria-hidden="true"
          sx={{
            flex: "none",
            width: 58,
            py: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            border: `1px solid ${tint("cyan", 0.3)}`,
            fontFamily: fonts.mono,
          }}
        >
          <Box
            component="span"
            sx={{
              fontSize: 24,
              fontWeight: 700,
              lineHeight: 1,
              color: colors.cyan,
            }}
          >
            {day}
          </Box>
          <Box
            component="span"
            sx={{
              mt: "4px",
              fontSize: 10,
              letterSpacing: "0.16em",
              color: colors.textMuted,
            }}
          >
            {mon}
          </Box>
        </Box>
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: "4px",
          }}
        >
          <Typography
            id={titleId}
            component={headingComponent}
            sx={{
              m: 0,
              fontSize: 20,
              fontWeight: 700,
              lineHeight: 1.15,
              textTransform: "uppercase",
              overflowWrap: "anywhere",
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {event.title}
          </Typography>
          <Box
            component="span"
            id={metaId}
            sx={{
              fontFamily: fonts.mono,
              fontSize: 11,
              letterSpacing: "0.1em",
              color: colors.textDim,
            }}
          >
            {formatCardRange(event.timeBegin, event.timeEnd)}
          </Box>
        </Box>
      </Box>
      <Typography
        id={descId}
        component="p"
        sx={{
          m: 0,
          flex: 1,
          fontSize: 14,
          lineHeight: 1.55,
          color: colors.textMuted,
          whiteSpace: "pre-line",
          overflowWrap: "anywhere",
          display: "-webkit-box",
          WebkitLineClamp: 4,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {event.description}
      </Typography>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          minHeight: 24,
        }}
      >
        {status && (
          <Box component="span" id={statusId} sx={{ display: "inline-flex" }}>
            <Tag tone={status.tone}>{status.label}</Tag>
          </Box>
        )}
        <ArrowForwardSharp
          aria-hidden="true"
          sx={{ ml: "auto", fontSize: 20, color: colors.cyan }}
        />
      </Box>
    </Box>
  );
}
