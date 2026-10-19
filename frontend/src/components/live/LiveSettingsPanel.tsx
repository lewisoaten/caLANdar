/** Admin: the event's Live settings (Discord invite, time zone). */
import * as React from "react";
import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import { useSnackbar } from "notistack";
import { Panel } from "../hl/Panel";
import type { LiveState } from "../../live/store";
import { userFacingReason } from "../../utils/apiError";
import { adminFetch } from "./adminApi";

export function LiveSettingsPanel({
  eventId,
  state,
  token,
  children,
}: {
  eventId: number;
  state: LiveState;
  token: string;
  /** Extra settings (the wall-board link, phase 4). */
  children?: React.ReactNode;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const [discord, setDiscord] = useState(state.event?.discordInviteUrl ?? "");
  const [timezone, setTimezone] = useState(
    state.event?.timezone ?? "Europe/London",
  );
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await adminFetch(token, `/events/${eventId}/live/settings`, "PUT", {
        discordInviteUrl: discord,
        timezone,
      });
      enqueueSnackbar("Live settings saved", { variant: "success" });
    } catch (e) {
      enqueueSnackbar(userFacingReason(e) ?? "Couldn't save", {
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel kicker="Admin" title="Live settings" tone="amber" padding="compact">
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <TextField
          label="Discord invite link"
          placeholder="https://discord.gg/…"
          value={discord}
          onChange={(e) => setDiscord(e.target.value)}
          size="small"
        />
        <TextField
          label="Time zone"
          helperText="IANA name, e.g. Europe/London. The planner's day runs on this clock."
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          size="small"
        />
        <Box>
          <Button
            variant="contained"
            color="warning"
            size="small"
            onClick={save}
            disabled={busy}
          >
            Save
          </Button>
        </Box>
        {children}
      </Box>
    </Panel>
  );
}

export default LiveSettingsPanel;
