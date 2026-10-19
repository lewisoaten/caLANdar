/**
 * Admin: people Steam shows playing who haven't checked in (they may have
 * forgotten, or be playing at home). Phase 3 folds this into the admin
 * popover with RSVP no / delay arrival / nudge.
 */
import * as React from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import { Panel } from "../hl/Panel";
import { UserAvatar } from "../hl/UserAvatar";
import { colors } from "../hl/tokens";
import type { LiveState } from "../../live/store";
import { personFor } from "../../live/selectors";
import { Mono } from "./liveUi";
import type { LiveCommand } from "./LobbyActions";

export function AdminQueuePanel({
  state,
  command,
  busy,
}: {
  state: LiveState;
  command: LiveCommand;
  busy?: boolean;
}) {
  if (!state.isAdmin || state.adminQueue.length === 0) return null;
  return (
    <Panel kicker="Admin" title="Check-in queue" tone="amber" padding="compact">
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {state.adminQueue.map((item) => {
          const p = personFor(state, item.pid);
          return (
            <Box
              key={item.pid}
              sx={{ display: "flex", alignItems: "center", gap: 1 }}
            >
              <UserAvatar
                name={p?.handle ?? "?"}
                src={p?.avatarUrl}
                size={28}
              />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ fontSize: 14, color: colors.text }}>
                  {p?.handle ?? "Someone"}
                </Box>
                <Mono size={10} color={colors.textMuted} weight={500}>
                  PLAYING {item.gameName?.toUpperCase() ?? "A GAME"} · NOT
                  CHECKED IN
                </Mono>
              </Box>
              <Button
                size="small"
                variant="outlined"
                color="warning"
                disabled={busy}
                onClick={() => void command("/checkin", { pid: item.pid })}
              >
                Check in
              </Button>
            </Box>
          );
        })}
      </Box>
    </Panel>
  );
}

export default AdminQueuePanel;
