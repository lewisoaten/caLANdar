/**
 * An open proposal, pinned at the top of the feed beside the open votes
 * until someone backs it or it lapses (DESIGN.md §5.2): one pre-join from
 * anyone but the proposer and it's on. The proposer can give it more time.
 */
import * as React from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import { UserAvatar } from "../hl/UserAvatar";
import { colors, tint } from "../hl/tokens";
import type { LiveState } from "../../live/store";
import type { LobbyView } from "../../live/types";
import { formatRemaining } from "../../live/clock";
import { activePrejoins, clock, personFor } from "../../live/selectors";
import { Mono } from "./liveUi";
import type { LiveCommand } from "./LobbyActions";

export function ProposalCard({
  state,
  lobby,
  now,
  busy,
  command,
  onShow,
}: {
  state: LiveState;
  lobby: LobbyView;
  now: number;
  busy?: boolean;
  command: LiveCommand;
  onShow?: (lobbyId: string) => void;
}) {
  const me = state.me;
  const mine = me != null && lobby.proposedBy === me;
  const proposer = personFor(state, lobby.proposedBy);
  const prejoined = activePrejoins(lobby).some((p) => p.pid === me);
  const person = me ? state.people[me] : null;
  const attending = person?.rsvp === "yes" || person?.rsvp === "maybe";
  const c = lobby.kind === "food" ? colors.violetLight : colors.cyan;
  const encoded = encodeURIComponent(lobby.id);
  const when =
    Date.parse(lobby.start) <= now ? "now" : `at ${clock(lobby.start)}`;
  const left = lobby.graceUntil
    ? `${formatRemaining(lobby.graceUntil, now)} LEFT`
    : "";

  return (
    <Box
      component="article"
      aria-label={`Proposal: ${lobby.name}`}
      sx={{
        border: `2px solid ${c}`,
        backgroundColor: "rgba(12,15,24,0.9)",
        boxShadow: `0 0 30px -18px ${c}`,
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.25,
          flexWrap: "wrap",
          p: "9px 14px",
          borderBottom: `1px solid ${tint("cyan", 0.1)}`,
        }}
      >
        <Mono
          size={10}
          color={colors.ink}
          sx={{ backgroundColor: c, px: "7px", py: "2px" }}
        >
          {lobby.kind === "food" ? "FOOD PROPOSAL" : "PROPOSAL"}
        </Mono>
        {proposer && (
          <UserAvatar
            name={proposer.handle}
            src={proposer.avatarUrl}
            size={20}
          />
        )}
        <Box component="span" sx={{ fontSize: 12, color: colors.text2 }}>
          {mine
            ? "You proposed it"
            : `${proposer?.handle ?? "Someone"} proposed it`}
        </Box>
        <Box sx={{ flex: 1 }} />
        <Mono size={10} color={c}>
          NEEDS ONE BACKER · {left}
        </Mono>
      </Box>
      <Box
        sx={{
          p: "12px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 1,
        }}
      >
        <Box
          component="h3"
          sx={{ m: 0, fontSize: 18, fontWeight: 700, color: colors.text }}
        >
          {lobby.name} {when}
        </Box>
        {lobby.food?.freeText && (
          <Box sx={{ fontSize: 13, color: colors.text2 }}>
            {lobby.food.freeText}
          </Box>
        )}
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          {!mine && attending && !prejoined && (
            <Button
              variant="contained"
              size="small"
              disabled={busy}
              onClick={() =>
                void command(`/lobbies/${encoded}/prejoin`, {
                  team: null,
                  random: (lobby.teams?.length ?? 0) > 0,
                })
              }
            >
              I&apos;m in
            </Button>
          )}
          {mine && (
            <Button
              variant="outlined"
              size="small"
              disabled={busy}
              onClick={() => void command(`/lobbies/${encoded}/more-time`)}
            >
              +5 min
            </Button>
          )}
          {onShow && (
            <Button
              variant="text"
              size="small"
              color="inherit"
              onClick={() => onShow(lobby.id)}
            >
              Show
            </Button>
          )}
        </Box>
      </Box>
    </Box>
  );
}

export default ProposalCard;
