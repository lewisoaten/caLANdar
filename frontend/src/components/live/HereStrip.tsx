/**
 * Who's checked in right now: a count, and everyone's avatar with the people
 * linked to Steam first and highlighted (Steam is how their games are picked
 * up, so these are the ones lobbies fill by themselves).
 */
import Box from "@mui/material/Box";
import Tooltip from "@mui/material/Tooltip";
import { UserAvatar } from "../hl/UserAvatar";
import { colors, tint } from "../hl/tokens";
import type { LiveState } from "../../live/store";
import { hereSummary } from "../../live/selectors";
import { Mono } from "./liveUi";

/** Most people shown on the wall-board before "+N". */
export const TV_MAX_SHOWN = 14;

export function HereStrip({
  state,
  tv = false,
}: {
  state: LiveState;
  /** Bigger, for the wall-board: avatars are capped at TV_MAX_SHOWN. */
  tv?: boolean;
}) {
  const summary = hereSummary(state);
  const { steam, attending } = summary;
  if (attending === 0 && summary.here.length === 0) return null;
  const here = tv ? summary.here.slice(0, TV_MAX_SHOWN) : summary.here;
  const more = summary.here.length - here.length;
  const unit = tv ? 2 : 1;

  return (
    <Box
      component="section"
      aria-label="Who's here"
      sx={{
        display: "flex",
        alignItems: "center",
        gap: `${12 * unit}px`,
        flexWrap: "wrap",
        p: tv ? "10px 20px" : "8px 16px",
        border: `1px solid ${tint("cyan", 0.2)}`,
      }}
    >
      <Mono size={11 * unit} weight={700} color={colors.text} spacing="0.08em">
        HERE {summary.here.length}/{attending}
      </Mono>
      <Mono size={11 * unit} color={steam > 0 ? colors.cyan : colors.textMuted}>
        {steam} ON STEAM
      </Mono>
      {here.length === 0 ? (
        <Mono size={11 * unit} color={colors.textMuted}>
          NOBODY CHECKED IN YET
        </Mono>
      ) : (
        <Box
          component="ul"
          sx={{
            display: "flex",
            flexWrap: "wrap",
            gap: `${6 * unit}px`,
            listStyle: "none",
            m: 0,
            p: 0,
          }}
        >
          {here.map((p) => {
            const game = p.presence?.gameName;
            return (
              <Tooltip
                key={p.pid}
                title={[
                  p.handle,
                  p.hasSteam ? "on Steam" : "no Steam ID",
                  game ? `playing ${game}` : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              >
                <Box
                  component="li"
                  data-steam={p.hasSteam ? "true" : "false"}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    pr: "8px",
                    border: `1px solid ${p.hasSteam ? colors.cyan : "transparent"}`,
                    backgroundColor: p.hasSteam
                      ? tint("cyan", 0.1)
                      : "transparent",
                    opacity: p.hasSteam ? 1 : 0.65,
                  }}
                >
                  <UserAvatar
                    name={p.handle}
                    src={p.avatarUrl}
                    size={24 * unit}
                  />
                  <Box
                    component="span"
                    sx={{
                      fontSize: 12 * unit,
                      fontWeight: p.hasSteam ? 700 : 500,
                      color: colors.text,
                    }}
                  >
                    {p.handle}
                  </Box>
                </Box>
              </Tooltip>
            );
          })}
          {more > 0 && (
            <Mono component="li" size={11 * unit} color={colors.textMuted}>
              +{more}
            </Mono>
          )}
        </Box>
      )}
    </Box>
  );
}

export default HereStrip;
