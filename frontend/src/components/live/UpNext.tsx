/** Up next (README §1c right): the next three lobbies. */
import * as React from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import { Panel } from "../hl/Panel";
import { colors, tint } from "../hl/tokens";
import type { LiveState } from "../../live/store";
import {
  blockLook,
  clock,
  lobbyPeople,
  personFor,
  upNext,
} from "../../live/selectors";
import { AvatarRow, Cover, Mono } from "./liveUi";

export function UpNext({
  state,
  now,
  onSelect,
}: {
  state: LiveState;
  now: number;
  onSelect: (id: string) => void;
}) {
  const items = upNext(state, now, 3);
  return (
    <Panel kicker="Coming up" title="Up next" padding="none">
      {items.length === 0 ? (
        <Box sx={{ p: "14px 18px", color: colors.textMuted, fontSize: 14 }}>
          Nothing planned. Propose something!
        </Box>
      ) : (
        <Box component="ol" sx={{ m: 0, p: 0, listStyle: "none" }}>
          {items.map((l) => {
            const look = blockLook(l, state.votes, now);
            return (
              <Box
                component="li"
                key={l.id}
                sx={{ borderTop: `1px solid ${tint("cyan", 0.07)}` }}
              >
                <ButtonBase
                  onClick={() => onSelect(l.id)}
                  sx={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    p: "10px 16px",
                    textAlign: "left",
                    justifyContent: "flex-start",
                    "&:hover": { backgroundColor: tint("cyan", 0.05) },
                  }}
                >
                  <Mono
                    size={13}
                    color={colors.text}
                    weight={700}
                    spacing="0.02em"
                    sx={{ width: 44 }}
                  >
                    {clock(l.start)}
                  </Mono>
                  <Cover
                    gameId={l.gameId}
                    kind={l.kind}
                    width={56}
                    height={26}
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
                    <Box
                      component="span"
                      sx={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: colors.text,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {l.name}
                    </Box>
                    <Mono size={9} color={look.color}>
                      {look.label || "PLANNED"}
                    </Mono>
                  </Box>
                  <AvatarRow
                    people={lobbyPeople(l).map((pid) => personFor(state, pid))}
                    size={18}
                    max={4}
                    me={state.me}
                  />
                </ButtonBase>
              </Box>
            );
          })}
        </Box>
      )}
    </Panel>
  );
}

export default UpNext;
