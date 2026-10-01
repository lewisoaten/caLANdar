import * as React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import ChevronRightSharp from "@mui/icons-material/ChevronRightSharp";
import { GameSuggestion } from "../../types/game_suggestions";
import { colors, fonts, tint } from "../hl";
import { TrophyBadge } from "./AddToScheduleDialog";
import {
  LanDay,
  Session,
  clockDay,
  fmtClock,
  fmtDur,
  spanLong,
} from "./scheduleModel";
import GameCoverImage from "../GameCoverImage";
import type { TrophyRank, VoteRank } from "../../utils/voteRanking";

export interface ScheduleDayCardsProps {
  days: LanDay[];
  sessions: Session[];
  suggestions: Map<number, GameSuggestion>;
  /** Vote rank per appid (shared utils/voteRanking). */
  ranks: ReadonlyMap<number, VoteRank>;
  squadSize: number;
  onOpen: (key: string) => void;
}

const tagSx = (color: string) => ({
  fontFamily: fonts.mono,
  fontSize: 10,
  letterSpacing: "0.14em",
  px: "6px",
  py: "2px",
  border: `1px solid ${color}`,
  color,
});

/** One column per day listing its sessions as cards (mirrors the timeline). */
export function ScheduleDayCards({
  days,
  sessions,
  suggestions,
  ranks,
  squadSize,
  onOpen,
}: ScheduleDayCardsProps) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
        gap: "clamp(16px, 2vw, 24px)",
        alignItems: "start",
      }}
    >
      {days.map((day) => {
        const list = sessions.filter((s) => s.day === day.index);
        const headingId = `schedule-day-${day.index}`;
        return (
          <Box
            key={day.index}
            component="section"
            aria-labelledby={headingId}
            sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}
          >
            <Box
              sx={{
                display: "flex",
                alignItems: "baseline",
                gap: 1.5,
                pb: 0.75,
                borderBottom: `1px solid ${tint("cyan", 0.2)}`,
              }}
            >
              <Typography
                component="h2"
                id={headingId}
                sx={{
                  m: 0,
                  fontSize: 22,
                  fontWeight: 700,
                  textTransform: "uppercase",
                }}
              >
                {day.name}
              </Typography>
              <Box
                component="span"
                sx={{
                  flex: 1,
                  fontFamily: fonts.mono,
                  fontSize: 12,
                  color: colors.textDim,
                }}
              >
                {day.dateLabel}
              </Box>
              <Box
                component="span"
                sx={{
                  fontFamily: fonts.mono,
                  fontSize: 11,
                  color: colors.textDim,
                }}
              >
                {list.length} {list.length === 1 ? "SESSION" : "SESSIONS"}
              </Box>
            </Box>
            {list.length ? (
              <Box
                component="ul"
                sx={{
                  listStyle: "none",
                  m: 0,
                  p: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 1.25,
                }}
              >
                {list.map((s) => (
                  <SessionCard
                    key={s.key}
                    session={s}
                    day={day}
                    suggestion={suggestions.get(s.entry.gameId)}
                    trophy={ranks.get(s.entry.gameId)?.trophyRank}
                    squadSize={squadSize}
                    onOpen={onOpen}
                  />
                ))}
              </Box>
            ) : (
              <Box
                sx={{
                  p: 2.25,
                  border: `1px dashed ${tint("cyan", 0.2)}`,
                  fontSize: 14,
                  color: colors.textMuted,
                }}
              >
                Nothing scheduled yet.
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
}

function SessionCard({
  session: s,
  day,
  suggestion,
  trophy,
  squadSize,
  onOpen,
}: {
  session: Session;
  day: LanDay;
  suggestion?: GameSuggestion;
  trophy?: TrophyRank | null;
  squadSize: number;
  onOpen: (key: string) => void;
}) {
  const accent = s.pinned ? colors.cyan : colors.violet;
  const border = s.pinned ? tint("cyan", 0.25) : tint("violet", 0.25);
  const hover = s.pinned ? colors.cyan : colors.violetLight;
  const votes = suggestion?.votes ?? 0;
  const meta = suggestion
    ? `${fmtDur(s.dur)} · ${suggestion.gamerOwned.length} of ${squadSize} own it · ${votes} vote${votes === 1 ? "" : "s"}`
    : `${fmtDur(s.dur)} · not in the vote`;
  // After midnight the card still sits under the LAN day it belongs to, so
  // name the real calendar day ("SAT 00:30") to avoid reading as Friday 00:30.
  const startDay = clockDay(day, s.st);
  return (
    <Box component="li">
      <Box
        component="button"
        type="button"
        onClick={() => onOpen(s.key)}
        aria-label={`${s.entry.gameName}, ${spanLong(day, s.st, s.dur)}, ${s.pinned ? "pinned" : "suggested"}. ${meta}`}
        sx={{
          width: "100%",
          display: "flex",
          gap: 1.75,
          p: 1.5,
          border: `1px solid ${border}`,
          backgroundColor: colors.surface,
          cursor: "pointer",
          textAlign: "left",
          color: colors.text,
          font: "inherit",
          "&:hover": {
            borderColor: hover,
            backgroundColor: "rgba(16,20,32,0.95)",
          },
          "&:focus-visible": {
            outline: `2px solid ${colors.cyan}`,
            outlineOffset: 2,
          },
        }}
      >
        <Box
          component="span"
          aria-hidden="true"
          sx={{
            width: 4,
            flex: "none",
            alignSelf: "stretch",
            backgroundColor: accent,
          }}
        />
        <Box
          component="span"
          sx={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: 1,
          }}
        >
          <Box
            component="span"
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              flexWrap: "wrap",
            }}
          >
            <Box
              component="span"
              sx={{ fontFamily: fonts.mono, fontSize: 14, fontWeight: 700 }}
            >
              {startDay.nextDay ? `${startDay.short} ` : ""}
              {fmtClock(s.st)} → {fmtClock(s.st + s.dur)}
            </Box>
            {startDay.nextDay && (
              <Box component="span" sx={tagSx(colors.textMuted)}>
                {day.short} NIGHT
              </Box>
            )}
            <Box
              component="span"
              sx={tagSx(s.pinned ? colors.cyan : colors.violetLight)}
            >
              {s.pinned ? "PINNED" : "SUGGESTED"}
            </Box>
          </Box>
          <Box
            component="span"
            sx={{ display: "flex", alignItems: "center", gap: 1.5 }}
          >
            <GameCoverImage
              appid={s.entry.gameId}
              name={s.entry.gameName}
              width={84}
              height={39}
            />
            <Box
              component="span"
              sx={{
                minWidth: 0,
                display: "flex",
                flexDirection: "column",
                gap: "3px",
              }}
            >
              <Box
                component="span"
                sx={{ display: "flex", alignItems: "center", gap: 1 }}
              >
                <Box
                  component="span"
                  sx={{
                    fontSize: 16,
                    fontWeight: 600,
                    lineHeight: 1.25,
                    overflowWrap: "anywhere",
                  }}
                >
                  {s.entry.gameName}
                </Box>
                {trophy && <TrophyBadge rank={trophy} size={22} />}
              </Box>
              <Box
                component="span"
                sx={{ fontSize: 13, color: colors.textMuted }}
              >
                {meta}
              </Box>
            </Box>
          </Box>
        </Box>
        <ChevronRightSharp
          aria-hidden="true"
          sx={{
            flex: "none",
            alignSelf: "center",
            fontSize: 20,
            color: colors.textDim,
          }}
        />
      </Box>
    </Box>
  );
}

export default ScheduleDayCards;
