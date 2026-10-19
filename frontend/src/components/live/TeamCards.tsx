/**
 * Team cards (README §1c "Teams"): one card per team with slot rows.
 * Filled slots show an avatar, random pre-joins a dashed violet `?`, open
 * slots a dashed `+`. Each card has "Pre-join <team>"; a dashed violet
 * "Pre-join a random team" runs underneath.
 */
import * as React from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import { UserAvatar } from "../hl/UserAvatar";
import { colors, tint } from "../hl/tokens";
import type { LiveState } from "../../live/store";
import type { LobbyView } from "../../live/types";
import {
  activePrejoins,
  currentMembers,
  personFor,
} from "../../live/selectors";
import { Mono } from "./liveUi";

const TEAM_COLORS = [
  colors.cyan,
  colors.pink,
  colors.lime,
  colors.amber,
  colors.violetLight,
];

export function teamColor(i: number) {
  return TEAM_COLORS[i % TEAM_COLORS.length];
}

export function TeamCards({
  state,
  lobby,
  canPrejoin,
  busy,
  onPrejoin,
}: {
  state: LiveState;
  lobby: LobbyView;
  canPrejoin: boolean;
  busy?: boolean;
  onPrejoin: (team: string | null, random: boolean) => void;
}) {
  const teams = lobby.teams ?? [];
  const running =
    lobby.status === "live" ||
    lobby.status === "grace" ||
    lobby.status === "empty";
  const randoms = activePrejoins(lobby).filter((p) => p.random && !p.team);
  const mine = activePrejoins(lobby).find((p) => p.pid === state.me);

  const inTeam = (name: string) => {
    const pids: string[] = [];
    for (const m of running ? currentMembers(lobby) : [])
      if (m.team === name && !pids.includes(m.pid)) pids.push(m.pid);
    for (const p of activePrejoins(lobby))
      if (p.team === name && !pids.includes(p.pid)) pids.push(p.pid);
    return pids;
  };

  const teamNames = new Set(teams.map((t) => t.name));
  const unassigned = (running ? currentMembers(lobby) : [])
    .filter((m) => !m.team || !teamNames.has(m.team))
    .map((m) => m.pid)
    .filter(
      (pid) => !activePrejoins(lobby).some((p) => p.pid === pid && p.team),
    );

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(min(100%, 180px), 1fr))",
          gap: 1,
        }}
      >
        {teams.map((team, i) => {
          const c = teamColor(i);
          const pids = inTeam(team.name);
          const open = Math.max(0, team.size - pids.length);
          const mineHere = mine?.team === team.name;
          return (
            <Box
              key={team.name}
              sx={{
                border: `1px solid ${tint("cyan", 0.16)}`,
                backgroundColor: colors.surfaceSolid,
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  p: "8px 10px",
                  borderBottom: `1px solid ${tint("cyan", 0.08)}`,
                }}
              >
                <Box sx={{ width: 4, height: 18, backgroundColor: c }} />
                <Box
                  component="span"
                  sx={{
                    flex: 1,
                    fontWeight: 700,
                    fontSize: 14,
                    color: colors.text,
                  }}
                >
                  {team.name}
                </Box>
                <Mono size={10} color={colors.textMuted}>
                  {pids.length}/{team.size}
                </Mono>
              </Box>
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                  p: "6px 10px",
                }}
              >
                {pids.map((pid) => {
                  const p = personFor(state, pid);
                  return (
                    <Box
                      key={pid}
                      sx={{
                        height: 32,
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                      }}
                    >
                      <UserAvatar
                        name={p?.handle ?? "?"}
                        src={p?.avatarUrl}
                        size={24}
                      />
                      <Box
                        component="span"
                        sx={{
                          fontSize: 13,
                          color: pid === state.me ? colors.cyan : colors.text,
                        }}
                      >
                        {p?.handle ?? "Someone"}
                      </Box>
                    </Box>
                  );
                })}
                {Array.from({ length: Math.min(open, 6) }).map((_, n) => (
                  <Box
                    key={`open-${n}`}
                    sx={{
                      height: 32,
                      display: "grid",
                      placeItems: "center",
                      border: `1px dashed ${tint("neutral", 0.35)}`,
                      color: colors.textDim,
                      fontSize: 14,
                    }}
                    aria-hidden="true"
                  >
                    +
                  </Box>
                ))}
                {open > 6 && (
                  <Mono size={9} color={colors.textDim}>
                    +{open - 6} MORE OPEN
                  </Mono>
                )}
              </Box>
              {canPrejoin && (
                <Box sx={{ p: "0 10px 10px" }}>
                  <Button
                    fullWidth
                    size="small"
                    variant={mineHere ? "contained" : "outlined"}
                    disabled={busy || (open === 0 && !mineHere) || mineHere}
                    onClick={() => onPrejoin(team.name, false)}
                  >
                    {mineHere ? "You're in" : `Pre-join ${team.name}`}
                  </Button>
                </Box>
              )}
            </Box>
          );
        })}
      </Box>
      {unassigned.length > 0 && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            flexWrap: "wrap",
          }}
        >
          <Mono size={10} color={colors.textMuted}>
            NOT IN A TEAM YET
          </Mono>
          {unassigned.map((pid) => {
            const p = personFor(state, pid);
            return (
              <Box
                key={pid}
                sx={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <UserAvatar
                  name={p?.handle ?? "?"}
                  src={p?.avatarUrl}
                  size={20}
                />
                <Box
                  component="span"
                  sx={{ fontSize: 13, color: colors.text2 }}
                >
                  {p?.handle ?? "Someone"}
                </Box>
              </Box>
            );
          })}
        </Box>
      )}
      {(randoms.length > 0 || canPrejoin) && (
        <ButtonBase
          disabled={!canPrejoin || busy || (mine?.random ?? false)}
          onClick={() => onPrejoin(null, true)}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            justifyContent: "flex-start",
            p: "8px 12px",
            border: `1px dashed ${colors.violetLight}`,
            color: colors.violetText,
            fontWeight: 700,
            fontSize: 14,
            "&.Mui-disabled": { opacity: 0.8 },
          }}
        >
          <Box
            component="span"
            sx={{
              width: 22,
              height: 22,
              display: "grid",
              placeItems: "center",
              border: `1px dashed ${colors.violetLight}`,
            }}
          >
            ?
          </Box>
          {mine?.random ? "You're in · random team" : "Pre-join a random team"}
          <Box sx={{ flex: 1 }} />
          <Box sx={{ display: "flex", gap: "3px" }}>
            {randoms.map((r) => {
              const p = personFor(state, r.pid);
              return (
                <UserAvatar
                  key={r.pid}
                  name={p?.handle ?? "?"}
                  src={p?.avatarUrl}
                  size={20}
                />
              );
            })}
          </Box>
        </ButtonBase>
      )}
    </Box>
  );
}

export default TeamCards;
