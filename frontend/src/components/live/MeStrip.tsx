/**
 * The "me" strip (README §1a): who you are, your NOW and NEXT lobbies, the
 * check-in button while doors are open, and your actions.
 */
import * as React from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import { UserAvatar } from "../hl/UserAvatar";
import { colors, tint } from "../hl/tokens";
import type { LiveState } from "../../live/store";
import type { LobbyView } from "../../live/types";
import {
  checkInOpen,
  clock,
  dayClock,
  myNext,
  myNow,
} from "../../live/selectors";
import { Cover, Mono } from "./liveUi";
import { formatRemaining } from "../../live/clock";

export interface MeStripProps {
  state: LiveState;
  now: number;
  busy?: boolean;
  onCheckIn: () => void;
  /** Step out for this many minutes (checking in again comes back early). */
  onCheckOut?: (minutes: number) => void;
  onSelect: (id: string) => void;
  /** Leave your NOW lobby (phase 2). */
  onLeave?: (lobby: LobbyView) => void;
  /** The Call vote menu (phase 3). */
  callVote?: React.ReactNode;
}

/** How long someone can step out for. */
export const AWAY_CHOICES = [
  { minutes: 30, label: "30 minutes" },
  { minutes: 60, label: "1 hour" },
  { minutes: 120, label: "2 hours" },
];

function StepOutButton({
  busy,
  onCheckOut,
}: {
  busy?: boolean;
  onCheckOut: (minutes: number) => void;
}) {
  const [anchor, setAnchor] = React.useState<HTMLElement | null>(null);
  return (
    <>
      <Button
        variant="outlined"
        color="inherit"
        size="small"
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={anchor ? "true" : undefined}
        onClick={(e) => setAnchor(e.currentTarget)}
      >
        Step out
      </Button>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
      >
        {AWAY_CHOICES.map((choice) => (
          <MenuItem
            key={choice.minutes}
            onClick={() => {
              setAnchor(null);
              onCheckOut(choice.minutes);
            }}
          >
            For {choice.label}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

function SlotChip({
  kicker,
  kickerColor,
  lobby,
  dashed,
  tag,
  tagColor,
  onClick,
  action,
}: {
  kicker: string;
  kickerColor: string;
  lobby: LobbyView | null;
  dashed: boolean;
  tag?: string;
  tagColor?: string;
  onClick?: () => void;
  action?: React.ReactNode;
}) {
  return (
    <Box
      sx={{
        flex: "1 1 200px",
        minWidth: 0,
        display: "flex",
        alignItems: "center",
        gap: "10px",
        p: "5px 8px 5px 5px",
        border: `1px ${dashed ? "dashed" : "solid"} ${dashed ? tint("cyan", 0.45) : tint("lime", 0.45)}`,
        backgroundColor: "rgba(6,7,11,0.5)",
        cursor: onClick ? "pointer" : "default",
      }}
      onClick={onClick}
    >
      <Cover
        gameId={lobby?.gameId ?? null}
        kind={lobby?.kind ?? "game"}
        width={64}
        height={30}
      />
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          gap: "2px",
        }}
      >
        <Box sx={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <Mono size={9} color={kickerColor} spacing="0.14em">
            {kicker}
          </Mono>
          {tag && (
            <Mono
              size={9}
              color={tagColor ?? colors.textMuted}
              sx={{
                border: `1px solid ${tagColor ?? colors.textMuted}`,
                px: "4px",
              }}
            >
              {tag}
            </Mono>
          )}
        </Box>
        <Box
          component="span"
          sx={{
            fontSize: 13,
            fontWeight: 700,
            color: lobby ? colors.text : colors.textMuted,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {lobby ? lobby.name : "Nothing yet"}
        </Box>
      </Box>
      {action}
    </Box>
  );
}

export function MeStrip({
  state,
  now,
  busy,
  onCheckIn,
  onCheckOut,
  onSelect,
  onLeave,
  callVote,
}: MeStripProps) {
  const me = state.me ? state.people[state.me] : null;
  const nowLobby = myNow(state);
  const next = myNext(state, now);
  const open = checkInOpen(state, now);
  const attending = me?.rsvp === "yes" || me?.rsvp === "maybe";
  const away = me?.awayUntil ?? null;
  const needsCheckIn = Boolean(me && attending && !me.checkedIn && !away);
  const highlight = needsCheckIn && open;

  const status = away
    ? `STEPPED OUT · BACK ${clock(away)}`
    : me?.checkedIn
      ? `CHECKED IN ${me.checkedInAt ? dayClock(me.checkedInAt) : ""}`
      : open
        ? "NOT CHECKED IN"
        : state.event
          ? `DOORS ${dayClock(state.event.timeBegin)}`
          : "";
  const myVia = me?.presence?.via;

  return (
    <Box
      component="section"
      aria-label="You"
      sx={{
        display: "flex",
        alignItems: "center",
        gap: "14px",
        flexWrap: "wrap",
        p: "12px 16px",
        border: `1px solid ${highlight ? colors.lime : tint("cyan", 0.3)}`,
        backgroundColor: highlight ? tint("lime", 0.08) : tint("cyan", 0.05),
      }}
    >
      <UserAvatar name={me?.handle ?? "You"} src={me?.avatarUrl} size={40} />
      <Box
        sx={{
          flex: "0 1 180px",
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          gap: "2px",
        }}
      >
        <Box
          component="span"
          sx={{ fontWeight: 700, fontSize: 16, color: colors.text }}
        >
          {me?.handle ?? "Spectator"}
        </Box>
        <Mono
          size={10}
          weight={500}
          color={colors.textMuted}
          spacing="0.06em"
          sx={{ whiteSpace: "normal" }}
        >
          {me?.seat ? `SEAT ${me.seat.label} · ` : ""}
          {status}
        </Mono>
      </Box>

      {!highlight && (
        <Box
          sx={{
            display: "flex",
            gap: 1,
            flexWrap: "wrap",
            flex: "2 1 420px",
            minWidth: 0,
          }}
        >
          <SlotChip
            kicker="NOW"
            kickerColor={colors.lime}
            lobby={nowLobby}
            dashed={false}
            tag={
              nowLobby ? (myVia === "steam" ? "STEAM" : "MANUAL") : undefined
            }
            tagColor={myVia === "steam" ? colors.textMuted : colors.violetText}
            onClick={nowLobby ? () => onSelect(nowLobby.id) : undefined}
            action={
              nowLobby && onLeave ? (
                <Button
                  size="small"
                  variant="text"
                  color="inherit"
                  onClick={(e) => {
                    e.stopPropagation();
                    onLeave(nowLobby);
                  }}
                  sx={{ minHeight: 30, px: 1 }}
                >
                  Leave
                </Button>
              ) : undefined
            }
          />
          <SlotChip
            kicker={next ? `NEXT · ${clock(next.start)}` : "NEXT"}
            kickerColor={colors.cyan}
            lobby={next}
            dashed
            tag={next ? "PRE-JOINED" : undefined}
            tagColor={colors.lime}
            onClick={next ? () => onSelect(next.id) : undefined}
          />
        </Box>
      )}

      {me?.presence?.switchLobbyId &&
        me.presence.switchGraceUntil &&
        Date.parse(me.presence.switchGraceUntil) > now && (
          <Mono
            size={11}
            color={colors.pinkText}
            sx={{
              border: `1px solid ${colors.pink}`,
              px: 1,
              py: "4px",
              whiteSpace: "normal",
            }}
          >
            LAUNCH{" "}
            {state.lobbies[me.presence.switchLobbyId]?.name.toUpperCase() ??
              "THE GAME"}{" "}
            TO SWITCH · {formatRemaining(me.presence.switchGraceUntil, now)}
          </Mono>
        )}
      <Box
        sx={{
          display: "flex",
          gap: 1,
          flexWrap: "wrap",
          alignItems: "center",
          ml: highlight ? "auto" : 0,
        }}
      >
        {needsCheckIn &&
          (open ? (
            <Button
              variant="contained"
              color="success"
              size="large"
              onClick={onCheckIn}
              disabled={busy}
            >
              I&apos;m here
            </Button>
          ) : (
            <Button variant="outlined" color="success" disabled>
              I&apos;m here ·{" "}
              {state.event ? dayClock(state.event.timeBegin) : ""}
            </Button>
          ))}
        {away && (
          <Button
            variant="contained"
            color="success"
            size="small"
            onClick={onCheckIn}
            disabled={busy}
          >
            I&apos;m back
          </Button>
        )}
        {me?.checkedIn && onCheckOut && (
          <StepOutButton busy={busy} onCheckOut={onCheckOut} />
        )}
        {callVote}
        {state.event?.discordInviteUrl && (
          <Button
            variant="contained"
            color="secondary"
            size="small"
            href={state.event.discordInviteUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Discord
          </Button>
        )}
      </Box>
    </Box>
  );
}

export default MeStrip;
