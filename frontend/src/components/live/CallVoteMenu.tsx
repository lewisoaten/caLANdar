/**
 * "Call vote ▾" (README §1a): one row per vote type with a colour bar.
 * Keep playing shows while you're in a live lobby; Kick off early only in
 * the lead-up. Leaving isn't a vote: it's on the NOW chip and the lobby
 * details (DESIGN.md §5.1.1).
 */
import * as React from "react";
import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import { colors } from "../hl/tokens";
import type { LiveState } from "../../live/store";
import type { LobbyView } from "../../live/types";
import { myNow, upNext, visibleLobbies } from "../../live/selectors";
import type { SheetRequest } from "./ProposeSheet";

export function CallVoteMenu({
  state,
  now,
  selected,
  onOpen,
}: {
  state: LiveState;
  now: number;
  selected: LobbyView | null;
  onOpen: (r: SheetRequest) => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const mine = myNow(state);
  const leadUp = state.event != null && now < Date.parse(state.event.timeBegin);
  const changeTarget =
    selected &&
    (selected.status === "planned" || selected.status === "confirmed") &&
    !selected.virtual
      ? selected
      : (upNext(state, now, 3).find(
          (l) => !l.virtual && l.status !== "proposed",
        ) ?? null);
  const first = visibleLobbies(state)
    .filter(
      (l) => !l.virtual && (l.status === "planned" || l.status === "confirmed"),
    )
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))[0];

  const items: {
    label: string;
    hint: string;
    color: string;
    onClick: () => void;
    show: boolean;
  }[] = [
    {
      label: "Propose a game",
      hint: "ANY STEAM GAME · NOW OR LATER",
      color: colors.cyan,
      onClick: () => onOpen({ mode: "game" }),
      show: true,
    },
    {
      label: "Propose food",
      hint: "PIZZA, TAKE-OUT, A WALK INTO TOWN",
      color: colors.violetLight,
      onClick: () => onOpen({ mode: "food" }),
      show: true,
    },
    {
      label: `Keep playing ${mine?.name ?? ""}`,
      hint: "PEOPLE IN THE LOBBY VOTE",
      color: colors.lime,
      onClick: () => onOpen({ mode: "extend", lobby: mine }),
      show: Boolean(mine && mine.status === "live"),
    },
    {
      label: "Change a lobby",
      hint: changeTarget
        ? `${changeTarget.name.toUpperCase()} · START OR LENGTH`
        : "NOTHING UPCOMING",
      color: colors.textMuted,
      onClick: () => onOpen({ mode: "change", lobby: changeTarget }),
      show: Boolean(changeTarget),
    },
    {
      label: "Kick off early",
      hint: first
        ? `${first.name.toUpperCase()} · EVERYONE AT THE START VOTES`
        : "",
      color: colors.cyan,
      onClick: () => onOpen({ mode: "kickoff", lobby: first }),
      show: leadUp && Boolean(first),
    },
  ];

  return (
    <>
      <Button
        variant="contained"
        size="small"
        aria-haspopup="menu"
        aria-expanded={Boolean(anchor)}
        onClick={(e) => setAnchor(e.currentTarget)}
      >
        Call vote ▾
      </Button>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{
          paper: { sx: { width: 290, border: `1px solid ${colors.cyan}73` } },
        }}
      >
        {items
          .filter((i) => i.show)
          .map((i) => (
            <MenuItem
              key={i.label}
              onClick={() => {
                setAnchor(null);
                i.onClick();
              }}
              sx={{
                gap: 1.5,
                py: "11px",
                alignItems: "center",
                whiteSpace: "normal",
              }}
            >
              <Box
                sx={{
                  width: 6,
                  height: 28,
                  flex: "none",
                  backgroundColor: i.color,
                }}
              />
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "2px",
                  minWidth: 0,
                }}
              >
                <Box
                  component="span"
                  sx={{ fontSize: 14, fontWeight: 700, color: colors.text }}
                >
                  {i.label}
                </Box>
                <Box
                  component="span"
                  sx={{
                    fontFamily: "JetBrains Mono, monospace",
                    fontSize: 10,
                    letterSpacing: "0.06em",
                    color: colors.textMuted,
                  }}
                >
                  {i.hint}
                </Box>
              </Box>
            </MenuItem>
          ))}
      </Menu>
    </>
  );
}

export default CallVoteMenu;
