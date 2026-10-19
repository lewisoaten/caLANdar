/**
 * The admin button (README §1e): fixed bottom-right, amber and chamfered,
 * `● Admin [n]`. Its popover lists everything outstanding: post to
 * everyone, each open vote (force / split / veto), and the check-in queue
 * (check in, RSVP no, delay arrival, nudge).
 */
import * as React from "react";
import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import MenuItem from "@mui/material/MenuItem";
import Popover from "@mui/material/Popover";
import TextField from "@mui/material/TextField";
import { UserAvatar } from "../hl/UserAvatar";
import { chamfer, colors, fonts, tint } from "../hl/tokens";
import { TOAST_BOTTOM_VAR } from "../hl/HlSnackbarProvider";
import type { LiveState } from "../../live/store";
import { personFor } from "../../live/selectors";
import { Mono } from "./liveUi";
import type { LiveCommand } from "./LobbyActions";

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <ButtonBase
      aria-pressed={selected}
      onClick={onClick}
      sx={{
        px: "10px",
        py: "5px",
        fontFamily: fonts.mono,
        fontSize: 11,
        fontWeight: 700,
        color: selected ? colors.ink : colors.amber,
        border: `1px solid ${colors.amber}`,
        backgroundColor: selected ? colors.amber : "transparent",
      }}
    >
      {children}
    </ButtonBase>
  );
}

export function AdminFab({
  state,
  command,
  busy,
  extra,
}: {
  state: LiveState;
  command: LiveCommand;
  busy?: boolean;
  /** More admin tools (wall-board link, dev tools). */
  extra?: React.ReactNode;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [text, setText] = useState("");
  const [ttl, setTtl] = useState<"10m" | "dismiss">("10m");
  const [tv, setTv] = useState(false);
  const [discord, setDiscord] = useState(false);
  if (!state.isAdmin) return null;
  const openVotes = Object.values(state.votes).filter(
    (v) => v.status === "open",
  );
  const count = openVotes.length + state.adminQueue.length;

  const post = async () => {
    const ok = await command(
      "/posts",
      { text, ttl, tv, discord },
      { admin: true },
    );
    if (ok) setText("");
  };

  return (
    <>
      <ButtonBase
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-haspopup="dialog"
        aria-label={`Admin: ${count} outstanding`}
        sx={{
          position: "fixed",
          right: 24,
          bottom: `calc(var(${TOAST_BOTTOM_VAR}, 0px) + 24px)`,
          zIndex: 1100,
          display: "flex",
          alignItems: "center",
          gap: 1,
          px: 2.25,
          py: 1.5,
          backgroundColor: colors.amber,
          color: colors.ink,
          clipPath: chamfer(12),
          fontWeight: 700,
          fontSize: 14,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          boxShadow: `0 10px 40px -10px ${colors.amber}`,
        }}
      >
        <Box
          component="span"
          sx={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            backgroundColor: colors.ink,
          }}
        />
        Admin
        {count > 0 && (
          <Box
            component="span"
            sx={{
              fontFamily: fonts.mono,
              backgroundColor: colors.ink,
              color: colors.amber,
              px: "6px",
            }}
          >
            {count}
          </Box>
        )}
      </ButtonBase>
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "top", horizontal: "right" }}
        transformOrigin={{ vertical: "bottom", horizontal: "right" }}
        slotProps={{
          paper: {
            role: "dialog",
            "aria-label": "Admin",
            sx: {
              width: "min(400px, calc(100vw - 32px))",
              maxHeight: "80vh",
              border: `1px solid ${colors.amber}`,
              p: 2,
              display: "flex",
              flexDirection: "column",
              gap: 2,
            },
          },
        }}
      >
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <Mono size={10} color={colors.amber} spacing="0.16em">
            POST TO EVERYONE
          </Mono>
          <TextField
            multiline
            minRows={2}
            size="small"
            placeholder="Pizza's at the front desk"
            value={text}
            onChange={(e) => setText(e.target.value)}
            slotProps={{
              htmlInput: { maxLength: 280, "aria-label": "Message" },
            }}
          />
          <Box
            sx={{
              display: "flex",
              gap: 1,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <Chip selected={ttl === "10m"} onClick={() => setTtl("10m")}>
              10 MIN
            </Chip>
            <Chip
              selected={ttl === "dismiss"}
              onClick={() => setTtl("dismiss")}
            >
              UNTIL DISMISSED
            </Chip>
            <Chip selected={tv} onClick={() => setTv(!tv)}>
              ALSO ON TV
            </Chip>
            {state.event?.discordWebhookUrl && (
              <Chip selected={discord} onClick={() => setDiscord(!discord)}>
                ALSO ON DISCORD
              </Chip>
            )}
            <Box sx={{ flex: 1 }} />
            <Button
              variant="contained"
              color="warning"
              size="small"
              disabled={!text.trim() || busy}
              onClick={() => void post()}
            >
              Post
            </Button>
          </Box>
        </Box>

        {openVotes.map((v) => (
          <Box
            key={v.id}
            sx={{
              border: `1px solid ${tint("amber", 0.45)}`,
              p: 1.5,
              display: "flex",
              flexDirection: "column",
              gap: 1,
            }}
          >
            <Mono size={10} color={colors.amber}>
              OPEN VOTE · {v.involvedLabel}
            </Mono>
            <Box sx={{ fontWeight: 700, color: colors.text }}>{v.title}</Box>
            <TextField
              select
              size="small"
              label="Force an option…"
              value=""
              onChange={(e) =>
                void command(
                  `/votes/${v.id}/resolve`,
                  { force: e.target.value },
                  { admin: true },
                )
              }
            >
              {v.options.map((o) => (
                <MenuItem key={o.id} value={o.id}>
                  {o.name} · {o.voters.length}
                </MenuItem>
              ))}
            </TextField>
            <Box sx={{ display: "flex", gap: 1 }}>
              {v.type === "slot" && (
                <Button
                  size="small"
                  variant="outlined"
                  color="warning"
                  disabled={busy}
                  onClick={() =>
                    void command(
                      `/votes/${v.id}/resolve`,
                      { split: true },
                      { admin: true },
                    )
                  }
                >
                  Split · {v.options.filter((o) => o.voters.length).length}{" "}
                  lobbies
                </Button>
              )}
              <Button
                size="small"
                variant="outlined"
                color="warning"
                disabled={busy}
                onClick={() =>
                  void command(
                    `/votes/${v.id}/resolve`,
                    { veto: true },
                    { admin: true },
                  )
                }
              >
                Veto
              </Button>
            </Box>
          </Box>
        ))}

        {state.adminQueue.map((item) => {
          const p = personFor(state, item.pid);
          const act = (action: string) =>
            void command(`/people/${item.pid}/${action}`, undefined, {
              admin: true,
            });
          return (
            <Box
              key={item.pid}
              sx={{
                border: `1px solid ${tint("amber", 0.45)}`,
                p: 1.5,
                display: "flex",
                flexDirection: "column",
                gap: 1,
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <UserAvatar
                  name={p?.handle ?? "?"}
                  src={p?.avatarUrl}
                  size={28}
                />
                <Box sx={{ minWidth: 0 }}>
                  <Box sx={{ color: colors.text, fontWeight: 700 }}>
                    {p?.handle ?? "Someone"}
                  </Box>
                  <Mono
                    size={10}
                    color={colors.textMuted}
                    weight={500}
                    sx={{ whiteSpace: "normal" }}
                  >
                    {item.kind === "expected-not-checked-in"
                      ? "EXPECTED NOW · NOT CHECKED IN"
                      : `PLAYING ${item.gameName?.toUpperCase() ?? "A GAME"} ON STEAM · NOT CHECKED IN`}
                  </Mono>
                </Box>
              </Box>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                <Button
                  size="small"
                  variant="contained"
                  color="warning"
                  disabled={busy}
                  onClick={() => void command("/checkin", { pid: item.pid })}
                >
                  Check in
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  color="warning"
                  disabled={busy}
                  onClick={() => act("rsvp-no")}
                >
                  RSVP no
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  color="warning"
                  disabled={busy}
                  onClick={() => act("delay-arrival")}
                >
                  Delay arrival
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  color="warning"
                  disabled={busy}
                  onClick={() => act("nudge")}
                >
                  Nudge
                </Button>
              </Box>
            </Box>
          );
        })}

        {count === 0 && (
          <Box sx={{ color: colors.textMuted, fontSize: 14 }}>
            Nothing needs you right now.
          </Box>
        )}
        {extra}
      </Popover>
    </>
  );
}

export default AdminFab;
