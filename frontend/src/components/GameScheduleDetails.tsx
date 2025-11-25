import * as React from "react";
import {
  Box,
  Typography,
  Button,
  Divider,
  Stack,
  Avatar,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Tooltip,
} from "@mui/material";
import {
  AccessTime as TimeIcon,
  OpenInNew as OpenInNewIcon,
  People as PeopleIcon,
  CheckCircle as ReadyIcon,
  ShoppingCart as BuyIcon,
  EventBusy as UnavailableIcon,
  Help as UnknownIcon,
  EmojiEvents as TrophyIcon,
} from "@mui/icons-material";
import moment from "moment";
import { GameScheduleEntry } from "../types/game_schedule";
import { GameSuggestion, Gamer } from "../types/game_suggestions";
import { InvitationLiteData, RSVP } from "../types/invitations";
import { getTrophyColor } from "../utils/trophyColors";

// Constants for attendance calculation
const MAX_EVENT_DURATION_DAYS = 14;
const ATTENDANCE_BUCKET_START_HOUR = 6; // First bucket starts at 6 AM
const ATTENDANCE_BUCKET_SIZE_HOURS = 6;
const MAX_BUCKET_ITERATIONS =
  MAX_EVENT_DURATION_DAYS * (24 / ATTENDANCE_BUCKET_SIZE_HOURS); // 56

interface GameScheduleDetailsProps {
  scheduleEntry: GameScheduleEntry;
  suggestion?: GameSuggestion;
  invitations?: InvitationLiteData[];
  eventStart?: string;
  eventEnd?: string;
  onClose: () => void;
  isAdmin?: boolean;
  onPin?: () => void;
  onUnpin?: () => void;
  rank?: number | null;
}

const GamerList = ({
  title,
  gamers,
  icon,
  color,
  tooltip,
}: {
  title: string;
  gamers: Gamer[];
  icon?: React.ReactNode;
  color?: "primary" | "secondary" | "error" | "info" | "success" | "warning";
  tooltip?: string;
}) => {
  if (!gamers || gamers.length === 0) return null;
  return (
    <Box sx={{ mb: 2 }}>
      <Tooltip title={tooltip || ""} placement="top" arrow>
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          sx={{
            mb: 0.5,
            cursor: tooltip ? "help" : "default",
            width: "fit-content",
          }}
        >
          {icon && (
            <Box
              sx={{
                color: color ? `${color}.main` : "text.secondary",
                display: "flex",
              }}
            >
              {icon}
            </Box>
          )}
          <Typography
            variant="subtitle2"
            color={color ? `${color}.main` : "text.secondary"}
            fontWeight="bold"
          >
            {title}
          </Typography>
        </Stack>
      </Tooltip>
      <List dense disablePadding>
        {gamers.map((gamer, index) => (
          <ListItem key={index} disablePadding sx={{ mb: 1, pl: icon ? 4 : 0 }}>
            <ListItemAvatar sx={{ minWidth: 40 }}>
              <Avatar
                alt={gamer.handle || "Gamer"}
                src={gamer.avatarUrl || undefined}
                sx={{ width: 32, height: 32 }}
              />
            </ListItemAvatar>
            <ListItemText
              primary={gamer.handle || "Unknown Gamer"}
              primaryTypographyProps={{ variant: "body2" }}
            />
          </ListItem>
        ))}
      </List>
    </Box>
  );
};

export default function GameScheduleDetails({
  scheduleEntry,
  suggestion,
  invitations,
  eventStart,
  eventEnd,
  onClose,
  isAdmin,
  onPin,
  onUnpin,
  rank,
}: GameScheduleDetailsProps) {
  const startTime = moment(scheduleEntry.startTime);
  const endTime = moment(scheduleEntry.startTime).add(
    scheduleEntry.durationMinutes,
    "minutes",
  );
  const durationHuman = moment
    .duration(scheduleEntry.durationMinutes, "minutes")
    .humanize();

  const trophyColor = getTrophyColor(rank);

  // Calculate attendees
  const attendees = React.useMemo(() => {
    if (!invitations || !eventStart || !eventEnd) return [];

    const eventStartMoment = moment(eventStart);
    const eventEndMoment = moment(eventEnd);
    const eventStartDay = moment(eventStart).startOf("day");

    // Find the first valid bucket index for the event
    let firstValidBucketIndex = -1;
    // We assume a reasonable max number of days to avoid infinite loops if something is wrong
    for (let i = 0; i < MAX_BUCKET_ITERATIONS; i++) {
      const bucketStart = moment(eventStartDay).add(
        ATTENDANCE_BUCKET_START_HOUR + i * ATTENDANCE_BUCKET_SIZE_HOURS,
        "hours",
      );
      const bucketEnd = moment(bucketStart).add(
        ATTENDANCE_BUCKET_SIZE_HOURS,
        "hours",
      );

      // Check for overlap: start < bucketEnd && end >= bucketStart
      if (
        eventStartMoment.isBefore(bucketEnd) &&
        eventEndMoment.isSameOrAfter(bucketStart)
      ) {
        firstValidBucketIndex = i;
        break;
      }
    }

    if (firstValidBucketIndex === -1) return [];

    // Calculate the bucket index for the game start time
    const gameStartDiffHours = startTime.diff(eventStartDay, "hours");
    const gameBucketIndex = Math.floor(
      (gameStartDiffHours - ATTENDANCE_BUCKET_START_HOUR) /
        ATTENDANCE_BUCKET_SIZE_HOURS,
    );

    const attendanceIndex = gameBucketIndex - firstValidBucketIndex;

    if (attendanceIndex < 0) return [];

    return invitations
      .filter((invitation) => {
        if (invitation.response !== RSVP.yes) return false;
        if (!invitation.attendance) return false;

        // Check if the user is attending during this bucket
        if (attendanceIndex >= invitation.attendance.length) return false;

        return invitation.attendance[attendanceIndex] === 1;
      })
      .map(
        (inv) =>
          ({
            handle: inv.handle,
            avatarUrl: inv.avatarUrl,
          }) as Gamer,
      );
  }, [invitations, eventStart, eventEnd, startTime]);

  // Helper to check if a gamer is in a list
  const isGamerInList = (gamer: Gamer, list: Gamer[]) => {
    return list.some((g) => g.handle === gamer.handle);
  };

  // Calculate player status categories
  const playerStatus = React.useMemo(() => {
    if (!suggestion) return null;

    const voters = suggestion.voters || [];
    const owners = suggestion.gamerOwned || [];
    // const unowned = suggestion.gamerUnowned || [];

    const readyToPlay: Gamer[] = [];
    const needToBuy: Gamer[] = [];
    const availableButNoVote: Gamer[] = [];
    const votedButUnavailable: Gamer[] = [];

    // Process attendees
    attendees.forEach((attendee) => {
      const voted = isGamerInList(attendee, voters);
      const owns = isGamerInList(attendee, owners);

      if (voted && owns) {
        readyToPlay.push(attendee);
      } else if (voted && !owns) {
        needToBuy.push(attendee);
      } else if (!voted) {
        availableButNoVote.push(attendee);
      }
    });

    // Process voters not attending
    voters.forEach((voter) => {
      if (!isGamerInList(voter, attendees)) {
        votedButUnavailable.push(voter);
      }
    });

    return {
      readyToPlay,
      needToBuy,
      availableButNoVote,
      votedButUnavailable,
    };
  }, [suggestion, attendees]);

  return (
    <Box sx={{ p: 3, width: "100%", maxWidth: 400 }}>
      {/* Game Banner */}
      <Box
        sx={{
          width: "100%",
          height: 150,
          backgroundImage: `url(https://cdn.akamai.steamstatic.com/steam/apps/${scheduleEntry.gameId}/header.jpg)`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          borderRadius: 2,
          mb: 2,
          boxShadow: 3,
        }}
      />

      {/* Game Title */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
        {rank && rank <= 3 && (
          <Tooltip title={`Rank #${rank} Most Voted Game`}>
            <TrophyIcon sx={{ color: trophyColor, fontSize: 32 }} />
          </Tooltip>
        )}
        <Typography variant="h5" fontWeight="bold">
          {scheduleEntry.gameName}
        </Typography>
      </Box>

      {/* Suggester & Comment */}
      {suggestion && (
        <Box sx={{ mb: 2 }}>
          {suggestion.suggester && (
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              sx={{ mb: 1 }}
            >
              <Avatar
                alt={suggestion.suggester.handle || "Suggester"}
                src={suggestion.suggester.avatarUrl || undefined}
                sx={{ width: 24, height: 24 }}
              />
              <Typography variant="body2" color="text.secondary">
                Suggested by{" "}
                <strong>{suggestion.suggester.handle || "Unknown"}</strong>
              </Typography>
            </Stack>
          )}
          {suggestion.comment && (
            <Box sx={{ p: 1.5, bgcolor: "action.hover", borderRadius: 1 }}>
              <Typography variant="body2" fontStyle="italic">
                "{suggestion.comment}"
              </Typography>
            </Box>
          )}
        </Box>
      )}

      {/* Steam Link */}
      <Button
        variant="outlined"
        startIcon={<OpenInNewIcon />}
        href={`https://store.steampowered.com/app/${scheduleEntry.gameId}/`}
        target="_blank"
        rel="noopener noreferrer"
        fullWidth
        sx={{ mb: 3 }}
      >
        View on Steam Store
      </Button>

      <Divider sx={{ mb: 2 }} />

      {/* Schedule Details */}
      <Typography
        variant="h6"
        gutterBottom
        sx={{ display: "flex", alignItems: "center", gap: 1 }}
      >
        <TimeIcon color="primary" /> Schedule
      </Typography>

      <Box sx={{ mb: 3, pl: 1 }}>
        <Typography variant="body1" gutterBottom>
          <strong>Start:</strong> {startTime.format("dddd, D MMM HH:mm")}
        </Typography>
        <Typography variant="body1" gutterBottom>
          <strong>End:</strong> {endTime.format("dddd, D MMM HH:mm")}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Duration: {durationHuman}
        </Typography>
      </Box>

      <Divider sx={{ mb: 2 }} />

      {/* Game Details from Suggestion */}
      {suggestion && playerStatus ? (
        <>
          <Box sx={{ mb: 3 }}>
            <Typography
              variant="h6"
              gutterBottom
              sx={{ display: "flex", alignItems: "center", gap: 1 }}
            >
              <PeopleIcon color="primary" /> Player Status
            </Typography>

            <GamerList
              title="Ready to Play"
              gamers={playerStatus.readyToPlay}
              icon={<ReadyIcon fontSize="small" />}
              color="success"
              tooltip="These players own the game, voted for it, and are attending at this time."
            />
            <GamerList
              title="Need to Buy"
              gamers={playerStatus.needToBuy}
              icon={<BuyIcon fontSize="small" />}
              color="warning"
              tooltip="These players voted for the game and are attending, but don't own it yet."
            />
            <GamerList
              title="Available but Didn't Vote"
              gamers={playerStatus.availableButNoVote}
              icon={<UnknownIcon fontSize="small" />}
              color="info"
              tooltip="These players are attending at this time but didn't vote for this game."
            />
            <GamerList
              title="Voted but Unavailable"
              gamers={playerStatus.votedButUnavailable}
              icon={<UnavailableIcon fontSize="small" />}
              color="error"
              tooltip="These players voted for the game but are not attending at this time."
            />
          </Box>
        </>
      ) : (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ fontStyle: "italic" }}
        >
          Additional details not available.
        </Typography>
      )}

      <Box sx={{ mt: 4, display: "flex", justifyContent: "space-between" }}>
        {isAdmin && onPin && !scheduleEntry.isPinned && (
          <Button variant="contained" color="secondary" onClick={onPin}>
            Pin to Schedule
          </Button>
        )}
        {isAdmin && onUnpin && scheduleEntry.isPinned && (
          <Button variant="outlined" color="error" onClick={onUnpin}>
            Unpin Game
          </Button>
        )}
        <Button onClick={onClose} sx={{ ml: "auto" }}>
          Close
        </Button>
      </Box>
    </Box>
  );
}
