/**
 * Lobby details (README §1c left): whatever is selected on the timeline:
 * cover header, members or teams, plan vs actual and log for past lobbies,
 * actions, and the inline admin strip.
 */
import * as React from "react";
import Box from "@mui/material/Box";
import { Panel } from "../hl/Panel";
import { UserAvatar } from "../hl/UserAvatar";
import { colors, tint } from "../hl/tokens";
import type { LiveState } from "../../live/store";
import type { LobbyView } from "../../live/types";
import {
  activePrejoins,
  blockLook,
  clock,
  currentMembers,
  dayClock,
  lengthLabel,
  lobbyPeople,
  lobbySpan,
  personFor,
} from "../../live/selectors";
import { Mono, coverBackground } from "./liveUi";

const SOURCE_LABEL: Record<string, string> = {
  plan: "FROM THE SCHEDULE",
  suggestion: "SUGGESTED BY THE PLANNER",
  proposal: "PROPOSED",
  steam: "STARTED ON STEAM",
  split: "SPLIT FROM A VOTE",
  vote: "VOTED IN",
};

export interface LobbyDetailsProps {
  state: LiveState;
  lobby: LobbyView | null;
  now: number;
  /** Gamer actions (pre-join, propose a change...). */
  actions?: React.ReactNode;
  /** Admin actions for the amber strip. */
  adminActions?: React.ReactNode;
  /** Teams block (phase 2). */
  teams?: React.ReactNode;
  /** Log rows for past lobbies (phase 2). */
  log?: React.ReactNode;
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <Mono size={10} color={colors.textDim} spacing="0.16em">
        {title}
      </Mono>
      {children}
    </Box>
  );
}

function TimeCell({
  label,
  start,
  end,
  dashed,
}: {
  label: string;
  start: number;
  end: number | null;
  dashed: boolean;
}) {
  return (
    <Box
      sx={{
        flex: "1 1 160px",
        p: "10px 12px",
        border: `1px ${dashed ? "dashed" : "solid"} ${dashed ? tint("neutral", 0.5) : tint("lime", 0.5)}`,
        display: "flex",
        flexDirection: "column",
        gap: "2px",
      }}
    >
      <Mono
        size={9}
        color={dashed ? colors.textMuted : colors.lime}
        spacing="0.14em"
      >
        {label}
      </Mono>
      <Mono size={15} color={colors.text} weight={700} spacing="0.02em">
        {clock(start)}–{end != null ? clock(end) : "…"}
      </Mono>
    </Box>
  );
}

export function LobbyDetails({
  state,
  lobby,
  now,
  actions,
  adminActions,
  teams,
  log,
}: LobbyDetailsProps) {
  if (!lobby) {
    return (
      <Panel kicker="Lobby" title="Nothing selected" padding="compact">
        <Box sx={{ color: colors.textMuted, fontSize: 14 }}>
          Pick a lobby on the timeline to see who&apos;s in it.
        </Box>
      </Panel>
    );
  }
  const look = blockLook(lobby, state.votes, now);
  const [start, end] = lobbySpan(lobby, now);
  const past = lobby.status === "done";
  const members = past
    ? [...new Set(lobby.members.map((m) => m.pid))]
    : lobby.status === "live" ||
        lobby.status === "grace" ||
        lobby.status === "empty"
      ? currentMembers(lobby).map((m) => m.pid)
      : lobbyPeople(lobby);
  const prejoined = activePrejoins(lobby).filter(
    (p) => !members.includes(p.pid),
  );
  const kicker = `${look.label || "PLAYED"} · ${dayClock(start)}–${clock(end)} · ${lengthLabel(Math.round((end - start) / 60000))}`;

  return (
    <Box
      component="section"
      aria-label={`Lobby: ${lobby.name}`}
      sx={{
        position: "relative",
        border: `1px solid ${tint("cyan", 0.16)}`,
        backgroundColor: colors.surface,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Box
        sx={{
          position: "relative",
          minHeight: 120,
          backgroundImage: coverBackground(lobby.gameId, lobby.kind),
          backgroundSize: "cover",
          backgroundPosition: "center",
          display: "flex",
          alignItems: "flex-end",
        }}
      >
        <Box
          aria-hidden="true"
          sx={{
            position: "absolute",
            inset: 0,
            background: `linear-gradient(180deg, rgba(11,14,22,0.2) 0%, ${colors.surfaceSolid} 100%)`,
          }}
        />
        <Box
          sx={{
            position: "relative",
            p: "14px 18px",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            minWidth: 0,
          }}
        >
          <Mono
            size={10}
            color={look.color}
            spacing="0.14em"
            sx={{ whiteSpace: "normal" }}
          >
            {kicker}
          </Mono>
          <Box
            component="h2"
            sx={{
              m: 0,
              fontSize: "clamp(22px, 2.4vw, 28px)",
              fontWeight: 700,
              lineHeight: 1.05,
              textTransform: "uppercase",
              color: colors.text,
              overflowWrap: "anywhere",
            }}
          >
            {lobby.name}
          </Box>
          <Mono size={10} color={colors.textMuted} weight={500}>
            {SOURCE_LABEL[lobby.source] ?? ""}
            {lobby.virtual ? " · NOT FIXED YET" : ""}
          </Mono>
        </Box>
      </Box>

      <Box
        sx={{
          p: "16px 18px",
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        {teams}
        {!teams && (
          <Section
            title={
              past
                ? "PLAYED BY"
                : members.length
                  ? "IN THE LOBBY"
                  : "WHO'S COMING"
            }
          >
            {members.length + prejoined.length === 0 ? (
              <Box sx={{ color: colors.textMuted, fontSize: 14 }}>
                {past
                  ? "Nobody played this one."
                  : "Nobody yet. Pre-join to say you're in."}
              </Box>
            ) : (
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                {[...members, ...prejoined.map((p) => p.pid)].map((pid) => {
                  const p = personFor(state, pid);
                  if (!p) return null;
                  const isPre = !members.includes(pid);
                  return (
                    <Box
                      key={pid}
                      sx={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 1,
                        p: "4px 10px 4px 4px",
                        border: `1px ${isPre ? "dashed" : "solid"} ${pid === state.me ? colors.cyan : tint("cyan", 0.2)}`,
                      }}
                    >
                      <UserAvatar name={p.handle} src={p.avatarUrl} size={24} />
                      <Box
                        component="span"
                        sx={{ fontSize: 13, color: colors.text }}
                      >
                        {p.handle}
                      </Box>
                      {isPre && (
                        <Mono size={9} color={colors.lime}>
                          PRE-JOINED
                        </Mono>
                      )}
                    </Box>
                  );
                })}
              </Box>
            )}
          </Section>
        )}

        {(past || lobby.plannedStart) && (
          <Section title="PLAN VS ACTUAL">
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
              <TimeCell
                label="PLANNED"
                start={Date.parse(lobby.plannedStart ?? lobby.start)}
                end={
                  Date.parse(lobby.plannedStart ?? lobby.start) +
                  (lobby.plannedMinutes ?? lobby.minutes) * 60000
                }
                dashed
              />
              <TimeCell
                label="ACTUAL"
                start={
                  lobby.actualStart ? Date.parse(lobby.actualStart) : start
                }
                end={
                  lobby.actualEnd
                    ? Date.parse(lobby.actualEnd)
                    : past
                      ? end
                      : null
                }
                dashed={false}
              />
            </Box>
          </Section>
        )}

        {log}

        {actions && (
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            {actions}
          </Box>
        )}
      </Box>

      {adminActions && state.isAdmin && (
        <Box
          sx={{
            display: "flex",
            gap: 1,
            alignItems: "center",
            flexWrap: "wrap",
            p: "8px 18px",
            borderTop: `1px solid ${tint("amber", 0.45)}`,
            backgroundColor: tint("amber", 0.06),
          }}
        >
          <Mono size={10} color={colors.amber} spacing="0.16em">
            ADMIN
          </Mono>
          {adminActions}
        </Box>
      )}
    </Box>
  );
}

export default LobbyDetails;
