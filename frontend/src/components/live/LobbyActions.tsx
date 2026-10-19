/**
 * What you can do with the selected lobby (README §1c "Actions"):
 * join a running lobby, leave the one you're in, pre-join (or leave a
 * pre-join) for upcoming ones, plus the team cards and the Steam setup.
 */
import * as React from "react";
import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import { colors, tint } from "../hl/tokens";
import type { LiveState } from "../../live/store";
import type { LobbyView } from "../../live/types";
import {
  activePrejoins,
  clock,
  currentMembers,
  plannedEnd,
  personFor,
} from "../../live/selectors";
import { Mono } from "./liveUi";
import { TeamCards } from "./TeamCards";
import {
  PlayersTeamsBlock,
  teamsForSave,
  type PlayersTeams,
} from "./PlayersTeamsBlock";

const EARLY_JOIN_MS = 15 * 60_000;

export type LiveCommand = (
  path: string,
  body?: unknown,
  options?: { method?: "POST" | "PUT" | "PATCH" | "DELETE"; admin?: boolean },
) => Promise<unknown>;

/** Can someone be in this lobby now (not just pre-join it)? */
export function joinableNow(l: LobbyView, now: number): boolean {
  if (l.virtual) return false;
  if (["waiting", "grace", "live", "empty"].includes(l.status)) return true;
  return (
    ["planned", "confirmed", "delayed"].includes(l.status) &&
    now >= Date.parse(l.start) - EARLY_JOIN_MS &&
    now < plannedEnd(l)
  );
}

export function canPrejoinLobby(l: LobbyView): boolean {
  return (
    l.virtual ||
    [
      "planned",
      "proposed",
      "confirmed",
      "delayed",
      "waiting",
      "grace",
    ].includes(l.status)
  );
}

export function LobbyActions({
  state,
  lobby,
  now,
  busy,
  command,
}: {
  state: LiveState;
  lobby: LobbyView;
  now: number;
  busy?: boolean;
  command: LiveCommand;
}) {
  const me = state.me ? state.people[state.me] : null;
  const attending = me?.rsvp === "yes" || me?.rsvp === "maybe";
  const isMember = currentMembers(lobby).some((m) => m.pid === state.me);
  const prejoined = activePrejoins(lobby).some((p) => p.pid === state.me);
  const encoded = encodeURIComponent(lobby.id);
  const prejoinable = canPrejoinLobby(lobby);
  const hasTeams = (lobby.teams?.length ?? 0) > 0;

  const prejoin = (team: string | null, random: boolean) =>
    void command(`/lobbies/${encoded}/prejoin`, { team, random });

  if (!me || !attending) {
    return (
      <Box sx={{ color: colors.textMuted, fontSize: 14 }}>
        RSVP yes or maybe to join lobbies.
      </Box>
    );
  }

  return (
    <Box
      sx={{ display: "flex", flexDirection: "column", gap: 1.5, width: "100%" }}
    >
      {hasTeams && (
        <TeamCards
          state={state}
          lobby={lobby}
          canPrejoin={prejoinable}
          busy={busy}
          onPrejoin={prejoin}
        />
      )}
      <Box
        sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}
      >
        {joinableNow(lobby, now) && !isMember && (
          <Button
            variant="contained"
            color="success"
            disabled={busy || !me.checkedIn}
            title={me.checkedIn ? undefined : "Check in first"}
            onClick={() => void command("/presence", { lobbyId: lobby.id })}
          >
            Join now
          </Button>
        )}
        {isMember && (
          <Button
            variant="outlined"
            color="inherit"
            disabled={busy}
            onClick={() => void command("/presence", { none: true })}
          >
            Leave lobby
          </Button>
        )}
        {prejoinable && !hasTeams && !prejoined && (
          <Button
            variant="contained"
            disabled={busy}
            onClick={() => prejoin(null, false)}
          >
            Pre-join
          </Button>
        )}
        {prejoinable && prejoined && (
          <Button
            variant="outlined"
            color="inherit"
            disabled={busy}
            onClick={() =>
              void command(`/lobbies/${encoded}/prejoin`, undefined, {
                method: "DELETE",
              })
            }
          >
            Leave pre-join
          </Button>
        )}
        {!me.checkedIn && joinableNow(lobby, now) && (
          <Mono size={10} color={colors.textMuted} weight={500}>
            CHECK IN TO JOIN
          </Mono>
        )}
      </Box>
    </Box>
  );
}

/**
 * First time this game is seen on Steam: ask for players and teams once,
 * saved for everyone (README §3 "Setup").
 */
export function SetupCard({
  lobby,
  eventId,
  busy,
  command,
}: {
  lobby: LobbyView;
  eventId: number;
  busy?: boolean;
  command: (body: unknown) => Promise<unknown>;
}) {
  const [value, setValue] = useState<PlayersTeams>({
    maxPlayers: 4,
    teams: null,
  });
  return (
    <Box
      sx={{
        border: `2px solid ${colors.cyan}`,
        backgroundColor: tint("cyan", 0.06),
        p: "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 1.5,
      }}
    >
      <Mono size={10} color={colors.cyan} spacing="0.16em">
        NEW GAME · SET IT UP ONCE
      </Mono>
      <Box sx={{ fontSize: 14, color: colors.text2 }}>
        {lobby.name} is new here. How many play, and in what teams? It&apos;s
        saved for everyone, for next time too.
      </Box>
      <PlayersTeamsBlock value={value} onChange={setValue} />
      <Box>
        <Button
          variant="contained"
          size="small"
          disabled={busy}
          onClick={() =>
            void command({ eventId, lobbyId: lobby.id, ...teamsForSave(value) })
          }
        >
          Save for everyone
        </Button>
      </Box>
    </Box>
  );
}

/** Who joined and left a lobby, and when (README §1c "Log"). */
export function LobbyLog({
  state,
  lobby,
}: {
  state: LiveState;
  lobby: LobbyView;
}) {
  const rows: { t: number; text: string; via?: string }[] = [];
  for (const m of lobby.members) {
    const who = personFor(state, m.pid)?.handle ?? "Someone";
    rows.push({
      t: Date.parse(m.joinedAt),
      text: `${who} joined`,
      via: m.via.toUpperCase(),
    });
    if (m.leftAt)
      rows.push({
        t: Date.parse(m.leftAt),
        text: `${who} left${m.leftReason && m.leftReason !== "left" ? ` (${m.leftReason})` : ""}`,
      });
  }
  for (const p of lobby.prejoins)
    if (p.droppedAt && p.dropReason === "elsewhere") {
      const who = personFor(state, p.pid)?.handle ?? "Someone";
      rows.push({
        t: Date.parse(p.droppedAt),
        text: `${who} dropped out (still elsewhere)`,
      });
    }
  rows.sort((a, b) => a.t - b.t);
  if (!rows.length) return null;
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <Mono size={10} color={colors.textDim} spacing="0.16em">
        LOG
      </Mono>
      <Box
        component="ol"
        sx={{
          m: 0,
          p: 0,
          listStyle: "none",
          display: "flex",
          flexDirection: "column",
          gap: "4px",
        }}
      >
        {rows.map((r, i) => (
          <Box
            component="li"
            key={i}
            sx={{
              display: "flex",
              gap: 1.5,
              alignItems: "baseline",
              fontSize: 13,
              color: colors.text2,
            }}
          >
            <Mono size={11} color={colors.textMuted} weight={500}>
              {clock(r.t)}
            </Mono>
            <span>{r.text}</span>
            {r.via && (
              <Mono
                size={9}
                color={r.via === "STEAM" ? colors.textMuted : colors.violetText}
              >
                {r.via}
              </Mono>
            )}
          </Box>
        ))}
      </Box>
    </Box>
  );
}
