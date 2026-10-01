import * as React from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import AddSharp from "@mui/icons-material/AddSharp";
import CloseSharp from "@mui/icons-material/CloseSharp";
import DeleteSharp from "@mui/icons-material/DeleteSharp";
import EmojiEventsSharp from "@mui/icons-material/EmojiEventsSharp";
import OpenInNewSharp from "@mui/icons-material/OpenInNewSharp";
import PushPinSharp from "@mui/icons-material/PushPinSharp";
import RemoveSharp from "@mui/icons-material/RemoveSharp";
import ScheduleSharp from "@mui/icons-material/ScheduleSharp";
import moment from "moment";
import { GameScheduleEntry } from "../types/game_schedule";
import { GameSuggestion, Gamer } from "../types/game_suggestions";
import { InvitationLiteData } from "../types/invitations";
import { getTrophyColor } from "../utils/trophyColors";
import {
  StatCell,
  StatGrid,
  UserAvatar,
  colors,
  fonts,
  hairline,
  tint,
} from "./hl";
import { fmtDur, squadOf, whoIsAround } from "./schedule/scheduleModel";
import GameCoverImage from "./GameCoverImage";

export interface TimingControls {
  /** Day buttons (FRI / SAT / SUN). */
  days: Array<{ label: string; active: boolean; onPick: () => void }>;
  start: string;
  end: string;
  /** Leave a handler undefined to disable that step. */
  onStartEarlier?: () => void;
  onStartLater?: () => void;
  onEndEarlier?: () => void;
  onEndLater?: () => void;
}

export interface GameScheduleDetailsProps {
  scheduleEntry: GameScheduleEntry;
  suggestion?: GameSuggestion;
  invitations?: InvitationLiteData[];
  eventStart?: string;
  eventEnd?: string;
  onClose: () => void;
  isAdmin?: boolean;
  /** Admin: pin a suggested session where it is. */
  onPin?: () => void;
  /** Admin: unpin a pinned session (it returns to auto-planning). */
  onUnpin?: () => void;
  /** Admin: remove a pinned session from the schedule. */
  onRemove?: () => void;
  rank?: number | null;
  /** e.g. `FRI 13 NOV · 18:30 → 20:30`; defaults to the entry's own times. */
  whenLabel?: string;
  /** Admin timing controls (day + start/end in 30-minute steps). */
  timing?: TimingControls;
  /** Session sits outside the auto-schedule window. */
  outsideWindow?: boolean;
  /** A change is being saved: footer actions are disabled. */
  busy?: boolean;
  /** Id for the heading, so a surrounding dialog can reference it. */
  titleId?: string;
}

type ChipTone = "lime" | "pink" | "cyan" | "neutral" | "neutralDim";

const chipTones: Record<ChipTone, { border: string; color: string }> = {
  lime: { border: tint("lime", 0.45), color: colors.text },
  pink: { border: tint("pink", 0.45), color: colors.text },
  cyan: { border: tint("cyan", 0.4), color: colors.cyan },
  neutral: { border: tint("neutral", 0.3), color: colors.textMuted },
  neutralDim: { border: tint("neutral", 0.25), color: colors.textMuted },
};

/** Avatar + handle chip. */
export function PersonChip({ gamer, tone }: { gamer: Gamer; tone: ChipTone }) {
  const t = chipTones[tone];
  return (
    <Box
      component="li"
      sx={{
        height: 30,
        display: "inline-flex",
        alignItems: "center",
        gap: "7px",
        pl: "3px",
        pr: "10px",
        border: `1px solid ${t.border}`,
        fontSize: 13,
        fontWeight: 500,
        color: t.color,
        maxWidth: "100%",
      }}
    >
      <UserAvatar name={gamer.handle} src={gamer.avatarUrl} size={22} />
      <Box
        component="span"
        sx={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {gamer.handle || "Unknown gamer"}
      </Box>
    </Box>
  );
}

function ChipList({
  gamers,
  tone,
  label,
  labelColor,
}: {
  gamers: Gamer[];
  tone: ChipTone;
  label?: string;
  labelColor?: string;
}) {
  return (
    <Box
      sx={{
        display: "flex",
        flexWrap: "wrap",
        gap: "6px",
        alignItems: "center",
      }}
    >
      {label && (
        <Box
          component="span"
          sx={{
            width: 84,
            flex: "none",
            fontFamily: fonts.mono,
            fontSize: 10,
            letterSpacing: "0.14em",
            color: labelColor ?? colors.textDim,
          }}
        >
          {label}
        </Box>
      )}
      <Box
        component="ul"
        aria-label={label ? label.toLowerCase() : undefined}
        sx={{
          listStyle: "none",
          m: 0,
          p: 0,
          display: "flex",
          flexWrap: "wrap",
          gap: "6px",
          minWidth: 0,
        }}
      >
        {gamers.map((g, i) => (
          <PersonChip key={`${g.handle}-${i}`} gamer={g} tone={tone} />
        ))}
      </Box>
    </Box>
  );
}

function SectionHeading({
  children,
  count,
  countColor,
}: {
  children: React.ReactNode;
  count?: React.ReactNode;
  countColor?: string;
}) {
  return (
    <Typography
      component="h3"
      sx={{
        m: 0,
        display: "flex",
        alignItems: "baseline",
        gap: 1.25,
        fontFamily: fonts.mono,
        fontSize: 11,
        fontWeight: 400,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color: colors.textDim,
      }}
    >
      <span>{children}</span>
      {count != null && (
        <Box component="span" sx={{ color: countColor ?? colors.cyan }}>
          {count}
        </Box>
      )}
    </Typography>
  );
}

const Section = ({ children }: { children: React.ReactNode }) => (
  <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
    {children}
  </Box>
);

function Note({
  tone,
  icon,
  children,
}: {
  tone: "amber" | "violet" | "pink";
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const border =
    tone === "amber"
      ? colors.amber
      : tone === "pink"
        ? colors.pink
        : colors.violetLight;
  return (
    <Box
      sx={{
        display: "flex",
        gap: 1.25,
        alignItems: "flex-start",
        px: 1.5,
        py: 1.25,
        border: `1px solid ${border}`,
        backgroundColor: tint(tone, 0.08),
        fontSize: 13,
        lineHeight: 1.5,
        color: colors.text,
        "& > svg": { fontSize: 18, color: border, flex: "none" },
      }}
    >
      {icon}
      <span>{children}</span>
    </Box>
  );
}

export { Note as ScheduleNote };

function Stepper({
  label,
  value,
  onEarlier,
  onLater,
}: {
  label: string;
  value: string;
  onEarlier?: () => void;
  onLater?: () => void;
}) {
  const btn = {
    width: 44,
    minWidth: 44,
    minHeight: 44,
    color: colors.cyan,
    "&:hover": { backgroundColor: tint("cyan", 0.1) },
    "&.Mui-disabled": { color: colors.disabled },
  } as const;
  return (
    <Box
      role="group"
      aria-label={`${label} time`}
      sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}
    >
      <Box
        component="span"
        aria-hidden="true"
        sx={{
          fontFamily: fonts.mono,
          fontSize: 10,
          letterSpacing: "0.16em",
          color: colors.textDim,
        }}
      >
        {label.toUpperCase()}
      </Box>
      <Box
        sx={{
          display: "flex",
          alignItems: "stretch",
          border: `1px solid ${hairline.control}`,
        }}
      >
        <IconButton
          aria-label={`${label} 30 minutes earlier`}
          onClick={onEarlier}
          disabled={!onEarlier}
          sx={btn}
        >
          <RemoveSharp fontSize="small" />
        </IconButton>
        <Box
          component="output"
          aria-live="polite"
          sx={{
            flex: 1,
            display: "grid",
            placeItems: "center",
            fontFamily: fonts.mono,
            fontSize: 16,
            fontWeight: 700,
          }}
        >
          {value}
        </Box>
        <IconButton
          aria-label={`${label} 30 minutes later`}
          onClick={onLater}
          disabled={!onLater}
          sx={btn}
        >
          <AddSharp fontSize="small" />
        </IconButton>
      </Box>
    </Box>
  );
}

/**
 * Details of one scheduled session: status, time, cover, rank / around /
 * duration readouts, admin timing controls, who suggested it, who is around,
 * who owns it and who voted. Rendered inside the schedule's drawer (desktop)
 * or bottom sheet (mobile).
 */
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
  onRemove,
  rank,
  whenLabel,
  timing,
  outsideWindow,
  busy,
  titleId,
}: GameScheduleDetailsProps) {
  const start = moment(scheduleEntry.startTime);
  const end = start.clone().add(scheduleEntry.durationMinutes, "minutes");
  const when =
    whenLabel ??
    `${start.format("ddd D MMM").toUpperCase()} · ${start.format("HH:mm")} → ${end.format("HH:mm")}`;
  const pinned = scheduleEntry.isPinned;
  const trophyColor = getTrophyColor(rank);

  const around = React.useMemo(
    () =>
      invitations && eventStart && eventEnd
        ? whoIsAround(
            invitations,
            eventStart,
            eventEnd,
            scheduleEntry.startTime,
          )
        : null,
    [invitations, eventStart, eventEnd, scheduleEntry.startTime],
  );
  const squadSize = invitations ? squadOf(invitations).length : 0;
  const hereCount =
    around && around.known ? `${around.here.length}/${squadSize}` : "—";

  const showFooter = isAdmin && (onPin || onUnpin || onRemove);

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
        width: "100%",
      }}
    >
      <Box
        sx={{
          px: "22px",
          py: "18px",
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          borderBottom: `1px solid ${hairline.chrome}`,
        }}
      >
        <Box
          sx={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            gap: 1.25,
            flexWrap: "wrap",
            minWidth: 0,
          }}
        >
          <Box
            component="span"
            sx={{
              fontFamily: fonts.mono,
              fontSize: 10,
              letterSpacing: "0.14em",
              fontWeight: 700,
              px: "7px",
              py: "3px",
              ...(pinned
                ? { backgroundColor: colors.cyan, color: colors.ink }
                : {
                    border: `1px dashed ${colors.violetLight}`,
                    color: colors.violetText,
                  }),
            }}
          >
            {pinned ? "PINNED" : "SUGGESTED"}
          </Box>
          <Box
            component="span"
            data-testid="session-when"
            sx={{
              fontFamily: fonts.mono,
              fontSize: 12,
              letterSpacing: "0.1em",
              color: colors.textMuted,
            }}
          >
            {when}
          </Box>
        </Box>
        <IconButton
          onClick={onClose}
          aria-label="Close details"
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
        sx={{
          flex: 1,
          overflowY: "auto",
          px: "22px",
          pt: 2.5,
          pb: 3,
          display: "flex",
          flexDirection: "column",
          gap: "22px",
        }}
      >
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.75 }}>
          <GameCoverImage
            appid={scheduleEntry.gameId}
            name={scheduleEntry.gameName}
            loading="eager"
            sx={{ border: `1px solid ${tint("cyan", 0.2)}` }}
          />
          <Typography
            component="h2"
            id={titleId}
            sx={{
              m: 0,
              fontSize: "clamp(24px,3vw,30px)",
              fontWeight: 700,
              lineHeight: 1.1,
              textTransform: "uppercase",
              overflowWrap: "anywhere",
            }}
          >
            {scheduleEntry.gameName}
          </Typography>
          <StatGrid columns={3}>
            <StatCell
              size="lg"
              label="Vote rank"
              value={
                <Box
                  component="span"
                  sx={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 0.75,
                    color: trophyColor || colors.cyan,
                  }}
                >
                  {trophyColor && (
                    <EmojiEventsSharp
                      aria-hidden="true"
                      sx={{ fontSize: 20 }}
                    />
                  )}
                  {rank ? `#${rank}` : "—"}
                </Box>
              }
              sx={{ backgroundColor: colors.surfaceSolid }}
            />
            <StatCell
              size="lg"
              label="Around"
              tone="lime"
              value={hereCount}
              sx={{ backgroundColor: colors.surfaceSolid }}
            />
            <StatCell
              size="lg"
              label="Duration"
              value={fmtDur(scheduleEntry.durationMinutes / 60)}
              sx={{ backgroundColor: colors.surfaceSolid }}
            />
          </StatGrid>
          <Button
            variant="outlined"
            size="small"
            startIcon={<OpenInNewSharp />}
            href={`https://store.steampowered.com/app/${scheduleEntry.gameId}/`}
            target="_blank"
            rel="noopener noreferrer"
            sx={{ alignSelf: "flex-start" }}
          >
            View on Steam Store
          </Button>
        </Box>

        {isAdmin && timing && (
          <Section>
            <SectionHeading>Timing · 30 min steps</SectionHeading>
            <Box
              role="group"
              aria-label="Day"
              sx={{ display: "flex", border: `1px solid ${hairline.control}` }}
            >
              {timing.days.map((d) => (
                <Button
                  key={d.label}
                  onClick={d.onPick}
                  aria-pressed={d.active}
                  disabled={busy}
                  sx={{
                    flex: 1,
                    minHeight: 44,
                    minWidth: 0,
                    fontFamily: fonts.mono,
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: "0.12em",
                    border: 0,
                    ...(d.active
                      ? {
                          backgroundColor: colors.cyan,
                          color: colors.ink,
                          "&:hover": { backgroundColor: colors.cyan },
                        }
                      : {
                          backgroundColor: "transparent",
                          color: colors.textMuted,
                          "&:hover": {
                            color: colors.text,
                            backgroundColor: tint("cyan", 0.06),
                          },
                        }),
                  }}
                >
                  {d.label}
                </Button>
              ))}
            </Box>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 1.25,
              }}
            >
              <Stepper
                label="Start"
                value={timing.start}
                onEarlier={busy ? undefined : timing.onStartEarlier}
                onLater={busy ? undefined : timing.onStartLater}
              />
              <Stepper
                label="End"
                value={timing.end}
                onEarlier={busy ? undefined : timing.onEndEarlier}
                onLater={busy ? undefined : timing.onEndLater}
              />
            </Box>
            {!pinned && (
              <Box sx={{ fontSize: 13, color: colors.textMuted }}>
                Changing the time pins this session.
              </Box>
            )}
          </Section>
        )}

        {outsideWindow && (
          <Note tone="amber" icon={<ScheduleSharp aria-hidden="true" />}>
            Outside the auto-schedule window. Fewer of the squad may be around.
          </Note>
        )}

        {suggestion ? (
          <>
            <Section>
              <SectionHeading>Suggested by</SectionHeading>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.25,
                  fontSize: 16,
                  fontWeight: 600,
                }}
              >
                <UserAvatar
                  name={suggestion.suggester?.handle}
                  src={suggestion.suggester?.avatarUrl}
                  size={32}
                />
                {suggestion.suggester?.handle || "Unknown"}
              </Box>
              {suggestion.comment && (
                <Box
                  component="blockquote"
                  sx={{
                    m: 0,
                    px: 1.75,
                    py: 1.5,
                    borderLeft: `2px solid ${colors.violetLight}`,
                    backgroundColor: tint("violet", 0.08),
                    fontSize: 15,
                    lineHeight: 1.5,
                    color: "#d9ceff",
                    overflowWrap: "anywhere",
                  }}
                >
                  “{suggestion.comment}”
                </Box>
              )}
            </Section>
          </>
        ) : (
          <Box
            sx={{
              p: 1.5,
              border: `1px dashed ${tint("cyan", 0.2)}`,
              fontSize: 14,
              color: colors.textMuted,
            }}
          >
            Not in this LAN&apos;s vote, so there is no owner or voter data for
            it yet.
          </Box>
        )}

        {around && (
          <Section>
            <SectionHeading count={hereCount} countColor={colors.lime}>
              Who&apos;s around
            </SectionHeading>
            {!around.known ? (
              <Box sx={{ fontSize: 14, color: colors.textMuted }}>
                This time is outside the event&apos;s attendance slots.
              </Box>
            ) : around.here.length ? (
              <ChipList gamers={around.here} tone="lime" />
            ) : (
              <Box sx={{ fontSize: 14, color: colors.textMuted }}>
                Nobody has said they&apos;ll be around then.
              </Box>
            )}
            {around.away.length > 0 && (
              <ChipList
                gamers={around.away}
                tone="neutralDim"
                label="NOT THERE"
              />
            )}
          </Section>
        )}

        {suggestion && (
          <>
            <Section>
              <SectionHeading>Who owns it</SectionHeading>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {suggestion.gamerOwned.length > 0 ? (
                  <ChipList
                    gamers={suggestion.gamerOwned}
                    tone="lime"
                    label="OWNS"
                    labelColor={colors.lime}
                  />
                ) : (
                  <Box sx={{ fontSize: 14, color: colors.textMuted }}>
                    Nobody in the squad owns it yet.
                  </Box>
                )}
                {suggestion.gamerUnowned.length > 0 && (
                  <ChipList
                    gamers={suggestion.gamerUnowned}
                    tone="pink"
                    label="NEEDS IT"
                    labelColor={colors.pinkText}
                  />
                )}
                {suggestion.gamerUnknown.length > 0 && (
                  <ChipList
                    gamers={suggestion.gamerUnknown}
                    tone="neutral"
                    label="UNKNOWN"
                    labelColor={colors.textMuted}
                  />
                )}
              </Box>
            </Section>
            <Section>
              <SectionHeading count={suggestion.voters.length}>
                Voted for it
              </SectionHeading>
              {suggestion.voters.length ? (
                <ChipList gamers={suggestion.voters} tone="cyan" />
              ) : (
                <Box sx={{ fontSize: 14, color: colors.textMuted }}>
                  No votes yet.
                </Box>
              )}
            </Section>
          </>
        )}
      </Box>

      {showFooter && (
        <Box
          sx={{
            px: "22px",
            pt: 1.75,
            pb: "calc(18px + env(safe-area-inset-bottom))",
            borderTop: `1px solid ${hairline.chrome}`,
            display: "flex",
            flexWrap: "wrap",
            gap: 1.25,
            alignItems: "center",
          }}
        >
          {pinned && onRemove && (
            <Button
              variant="outlined"
              color="error"
              startIcon={<DeleteSharp />}
              onClick={onRemove}
              disabled={busy}
            >
              Remove
            </Button>
          )}
          {!pinned && (
            <Box
              sx={{ fontSize: 13, color: colors.textMuted, flex: "1 1 180px" }}
            >
              Suggested slots are re-planned from votes and attendance. Pin it
              to keep it here.
            </Box>
          )}
          <Box sx={{ flex: pinned ? 1 : "none" }} />
          {!pinned && onPin && (
            <Button
              variant="contained"
              startIcon={<PushPinSharp />}
              onClick={onPin}
              disabled={busy}
            >
              Pin
            </Button>
          )}
          {pinned && onUnpin && (
            <Button
              variant="outlined"
              color="warning"
              startIcon={<PushPinSharp />}
              onClick={onUnpin}
              disabled={busy}
            >
              Unpin
            </Button>
          )}
        </Box>
      )}
    </Box>
  );
}
