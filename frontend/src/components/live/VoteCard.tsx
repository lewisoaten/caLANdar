/**
 * An open vote, pinned at the top of the feed until final (README §1d):
 * tap an option to vote (or change your vote), tick "happy to split the
 * party", add an option, see who it's waiting on. Admins get FORCE per
 * option, FORCE SPLIT, and Veto.
 */
import * as React from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import { UserAvatar } from "../hl/UserAvatar";
import { colors, tint } from "../hl/tokens";
import type { LiveState } from "../../live/store";
import type { VoteView } from "../../live/types";
import { formatRemaining } from "../../live/clock";
import { personFor } from "../../live/selectors";
import { AvatarRow, Mono, coverBackground } from "./liveUi";
import type { LiveCommand } from "./LobbyActions";

const TYPE_LABEL: Record<string, string> = {
  slot: "WHAT'S ON",
  extend: "KEEP PLAYING",
  delay: "DELAY",
  change: "CHANGE",
  kickoff: "KICK OFF",
};

const TYPE_COLOR: Record<string, string> = {
  slot: colors.cyan,
  extend: colors.lime,
  delay: colors.pink,
  change: colors.cyan,
  kickoff: colors.cyan,
};

const OPTION_TAG: Record<string, [string, string]> = {
  lobby: ["PLAN", colors.textMuted],
  game: ["NEW", colors.cyan],
  food: ["FOOD", colors.violetText],
  keep_playing: ["KEEP PLAYING", colors.lime],
  yes: ["YES", colors.lime],
  no: ["NO", colors.textMuted],
};

export function VoteCard({
  state,
  vote,
  now,
  busy,
  command,
  onAddOption,
}: {
  state: LiveState;
  vote: VoteView;
  now: number;
  busy?: boolean;
  command: LiveCommand;
  onAddOption?: (vote: VoteView) => void;
}) {
  const me = state.me;
  const c = TYPE_COLOR[vote.type] ?? colors.cyan;
  const involved = me != null && vote.involved.includes(me);
  const myOption = vote.options.find((o) => o.voters.includes(me ?? ""))?.id;
  const mySplit = me != null && vote.splitOk.includes(me);
  const total = vote.options.reduce((n, o) => n + o.voters.length, 0);
  const opener = personFor(state, vote.openedBy);
  const status = vote.settleAt
    ? `OPEN · FINALISING ${formatRemaining(vote.settleAt, now)}`
    : `${formatRemaining(vote.deadline, now)} LEFT · NOT FINAL`;
  const admin = state.isAdmin;
  const path = `/votes/${vote.id}`;

  const ballot = (body: { optionId?: string; splitOk?: boolean }) =>
    void command(`${path}/ballot`, body, { method: "PUT" });

  return (
    <Box
      component="article"
      aria-label={`Vote: ${vote.title}`}
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
          {TYPE_LABEL[vote.type] ?? vote.type.toUpperCase()}
        </Mono>
        {opener && (
          <UserAvatar name={opener.handle} src={opener.avatarUrl} size={20} />
        )}
        <Box component="span" sx={{ fontSize: 12, color: colors.text2 }}>
          {opener ? `${opener.handle} called it` : "Called by the schedule"}
        </Box>
        <Box sx={{ flex: 1 }} />
        <Mono size={10} color={vote.settleAt ? colors.lime : c}>
          {status}
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
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: 1.25,
            flexWrap: "wrap",
          }}
        >
          <Box
            component="h3"
            sx={{ m: 0, fontSize: 18, fontWeight: 700, color: colors.text }}
          >
            {vote.title}
          </Box>
          <Mono size={10} color={colors.textMuted} weight={500}>
            {vote.involvedLabel}
          </Mono>
        </Box>

        {vote.options.map((o) => {
          const share = total ? o.voters.length / total : 0;
          const mine = o.id === myOption;
          const [tag, tagColor] = OPTION_TAG[o.kind] ?? ["", colors.textMuted];
          return (
            <Box
              key={o.id}
              sx={{ display: "flex", gap: "6px", alignItems: "stretch" }}
            >
              <ButtonBase
                disabled={!involved || busy}
                aria-pressed={mine}
                onClick={() => ballot({ optionId: o.id })}
                sx={{
                  position: "relative",
                  flex: 1,
                  minWidth: 0,
                  minHeight: 56,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-start",
                  gap: 1.5,
                  flexWrap: "wrap",
                  pr: 1.25,
                  textAlign: "left",
                  border: `1px solid ${mine ? colors.cyan : tint("cyan", 0.2)}`,
                  backgroundColor: colors.surfaceSolid,
                  "&.Mui-disabled": { opacity: 1 },
                }}
              >
                <Box
                  aria-hidden="true"
                  sx={{
                    position: "absolute",
                    inset: 0,
                    width: `${share * 100}%`,
                    backgroundColor: tint("cyan", mine ? 0.16 : 0.08),
                  }}
                />
                <Box
                  aria-hidden="true"
                  sx={{
                    position: "relative",
                    width: 112,
                    height: 56,
                    flex: "none",
                    backgroundColor: tint("cyan", 0.06),
                    backgroundImage:
                      o.kind === "yes" || o.kind === "no"
                        ? "none"
                        : coverBackground(
                            o.gameId,
                            o.kind === "food" ? "food" : "game",
                          ),
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  {(o.kind === "yes" || o.kind === "no") && (
                    <Mono
                      size={14}
                      color={o.kind === "yes" ? colors.lime : colors.textMuted}
                    >
                      {o.kind.toUpperCase()}
                    </Mono>
                  )}
                </Box>
                <Box
                  sx={{
                    position: "relative",
                    flex: "1 1 160px",
                    minWidth: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px",
                    py: "6px",
                  }}
                >
                  <Box
                    component="span"
                    sx={{ fontSize: 14, fontWeight: 700, color: colors.text }}
                  >
                    {o.name}
                  </Box>
                  <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                    {tag && (
                      <Mono
                        size={9}
                        color={tagColor}
                        sx={{ border: `1px solid ${tagColor}`, px: "5px" }}
                      >
                        {tag}
                      </Mono>
                    )}
                    {o.durationMin != null && o.kind !== "yes" && (
                      <Mono size={9} color={colors.textMuted} weight={500}>
                        {o.durationMin}M
                      </Mono>
                    )}
                  </Box>
                </Box>
                <Box sx={{ position: "relative", py: "6px" }}>
                  <AvatarRow
                    people={o.voters.map((pid) => personFor(state, pid))}
                    size={22}
                    me={me}
                    gap={3}
                  />
                </Box>
              </ButtonBase>
              {admin && (
                <ButtonBase
                  title="Admin: force this option"
                  disabled={busy}
                  onClick={() =>
                    void command(
                      `${path}/resolve`,
                      { force: o.id },
                      { admin: true },
                    )
                  }
                  sx={{
                    flex: "none",
                    width: 62,
                    border: `1px solid ${tint("amber", 0.55)}`,
                    backgroundColor: tint("amber", 0.07),
                    color: colors.amber,
                    fontFamily: "inherit",
                  }}
                >
                  <Mono size={10} color={colors.amber}>
                    FORCE
                  </Mono>
                </ButtonBase>
              )}
            </Box>
          );
        })}

        {vote.type === "slot" && (
          <Box sx={{ display: "flex", gap: "6px", alignItems: "stretch" }}>
            <ButtonBase
              disabled={!involved || busy}
              aria-pressed={mySplit}
              onClick={() => ballot({ splitOk: !mySplit })}
              sx={{
                flex: 1,
                minWidth: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-start",
                gap: 1.25,
                flexWrap: "wrap",
                p: "8px 12px",
                border: `1px dashed ${colors.violetLight}`,
                "&.Mui-disabled": { opacity: 1 },
              }}
            >
              <Box
                aria-hidden="true"
                sx={{
                  width: 18,
                  height: 18,
                  flex: "none",
                  display: "grid",
                  placeItems: "center",
                  border: `2px solid ${colors.violetText}`,
                  backgroundColor: mySplit ? colors.violetText : "transparent",
                  color: colors.ink,
                  fontWeight: 700,
                  fontSize: 12,
                }}
              >
                {mySplit ? "✓" : ""}
              </Box>
              <Box
                component="span"
                sx={{ fontSize: 14, fontWeight: 700, color: colors.text }}
              >
                ⇄ Happy to split the party
              </Box>
              <Mono size={10} color={colors.violetText}>
                {vote.splitOk.length} OF {total} VOTERS
              </Mono>
              <Box sx={{ flex: 1 }} />
              <AvatarRow
                people={vote.splitOk.map((pid) => personFor(state, pid))}
                size={20}
                me={me}
              />
            </ButtonBase>
            {admin && (
              <ButtonBase
                title="Admin: split into one lobby per option"
                disabled={busy}
                onClick={() =>
                  void command(
                    `${path}/resolve`,
                    { split: true },
                    { admin: true },
                  )
                }
                sx={{
                  flex: "none",
                  width: 62,
                  border: `1px solid ${tint("amber", 0.55)}`,
                  backgroundColor: tint("amber", 0.07),
                }}
              >
                <Mono
                  size={9}
                  color={colors.amber}
                  sx={{ whiteSpace: "normal", textAlign: "center" }}
                >
                  FORCE SPLIT
                </Mono>
              </ButtonBase>
            )}
          </Box>
        )}

        {vote.waitingOn.length > 0 && (
          <Box
            sx={{
              display: "flex",
              gap: "4px",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <Mono size={10} color={colors.textMuted} sx={{ mr: "4px" }}>
              WAITING ON
            </Mono>
            <AvatarRow
              people={vote.waitingOn.map((pid) => personFor(state, pid))}
              size={20}
              max={12}
              me={me}
            />
          </Box>
        )}

        {vote.type === "slot" && involved && onAddOption && (
          <ButtonBase
            onClick={() => onAddOption(vote)}
            sx={{
              display: "flex",
              justifyContent: "flex-start",
              gap: 1.25,
              p: "9px 12px",
              border: `1px dashed ${tint("cyan", 0.4)}`,
            }}
          >
            <Mono size={11} color={colors.cyan}>
              + ADD AN OPTION
            </Mono>
          </ButtonBase>
        )}

        {!involved && (
          <Mono
            size={10}
            color={colors.textMuted}
            weight={500}
            sx={{ whiteSpace: "normal" }}
          >
            {vote.type === "slot"
              ? "CHECK IN TO VOTE ON THIS"
              : "THIS VOTE IS FOR THE PEOPLE IN THAT LOBBY"}
          </Mono>
        )}

        {admin && (
          <Box
            sx={{
              display: "flex",
              gap: 1,
              alignItems: "center",
              p: "8px 10px",
              border: `1px solid ${tint("amber", 0.45)}`,
              backgroundColor: tint("amber", 0.06),
            }}
          >
            <Mono size={10} color={colors.amber} spacing="0.16em">
              ADMIN
            </Mono>
            <Button
              size="small"
              variant="outlined"
              color="warning"
              disabled={busy}
              onClick={() =>
                void command(`${path}/resolve`, { veto: true }, { admin: true })
              }
            >
              Veto
            </Button>
          </Box>
        )}
      </Box>
    </Box>
  );
}

export default VoteCard;
