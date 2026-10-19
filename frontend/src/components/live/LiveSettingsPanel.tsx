/**
 * Admin: the event's Live settings: Discord invite and webhook, time zone,
 * the venue (for food near it), and the wall-board link and sleep hours.
 */
import * as React from "react";
import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import { useSnackbar } from "notistack";
import { Panel } from "../hl/Panel";
import { colors } from "../hl/tokens";
import type { LiveState } from "../../live/store";
import { userFacingReason } from "../../utils/apiError";
import { adminFetch } from "./adminApi";
import { Mono } from "./liveUi";

export function LiveSettingsPanel({
  eventId,
  state,
  token,
}: {
  eventId: number;
  state: LiveState;
  token: string;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const e = state.event;
  const [discord, setDiscord] = useState(e?.discordInviteUrl ?? "");
  const [webhook, setWebhook] = useState(e?.discordWebhookUrl ?? "");
  const [timezone, setTimezone] = useState(e?.timezone ?? "Europe/London");
  const [venueName, setVenueName] = useState(e?.venueName ?? "");
  const [venueLocation, setVenueLocation] = useState(e?.venueLocation ?? "");
  const [sleep, setSleep] = useState(e?.wallboardSleep ?? "");
  const [wallToken, setWallToken] = useState(e?.wallboardToken ?? null);
  const [busy, setBusy] = useState(false);

  const save = async (
    extra: Record<string, unknown> = {},
    done = "Live settings saved",
  ) => {
    setBusy(true);
    try {
      const view = (await adminFetch(
        token,
        `/events/${eventId}/live/settings`,
        "PUT",
        {
          discordInviteUrl: discord,
          discordWebhookUrl: webhook,
          timezone,
          wallboardSleep: sleep,
          venueName,
          venueLocation,
          ...extra,
        },
      )) as { wallboardToken?: string | null } | null;
      if (view?.wallboardToken !== undefined) setWallToken(view.wallboardToken);
      enqueueSnackbar(done, { variant: "success" });
    } catch (err) {
      enqueueSnackbar(userFacingReason(err) ?? "Couldn't save", {
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  const wallUrl = wallToken
    ? `${window.location.origin}/live/${wallToken}`
    : null;

  return (
    <Panel kicker="Admin" title="Live settings" tone="amber" padding="compact">
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <TextField
          label="Discord invite link"
          placeholder="https://discord.gg/…"
          value={discord}
          onChange={(ev) => setDiscord(ev.target.value)}
          size="small"
        />
        <TextField
          label="Discord webhook"
          placeholder="https://discord.com/api/webhooks/…"
          helperText="Results, proposals and posts you mark for Discord go here."
          value={webhook}
          onChange={(ev) => setWebhook(ev.target.value)}
          size="small"
        />
        <TextField
          label="Time zone"
          helperText="IANA name, e.g. Europe/London. The planner's day runs on this clock."
          value={timezone}
          onChange={(ev) => setTimezone(ev.target.value)}
          size="small"
        />
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          <TextField
            label="Venue"
            value={venueName}
            onChange={(ev) => setVenueName(ev.target.value)}
            size="small"
            sx={{ flex: "1 1 160px" }}
          />
          <TextField
            label="Venue location"
            placeholder="51.5072,-0.1276"
            helperText="Latitude,longitude: food near here"
            value={venueLocation}
            onChange={(ev) => setVenueLocation(ev.target.value)}
            size="small"
            sx={{ flex: "1 1 160px" }}
          />
        </Box>
        <TextField
          label="Wall-board sleeps"
          placeholder="03:00-09:00"
          helperText="The TV turns its stream off between these times. Empty to never sleep."
          value={sleep}
          onChange={(ev) => setSleep(ev.target.value)}
          size="small"
        />
        <Box>
          <Button
            variant="contained"
            color="warning"
            size="small"
            onClick={() => void save()}
            disabled={busy}
          >
            Save
          </Button>
        </Box>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <Mono size={10} color={colors.amber} spacing="0.16em">
            WALL-BOARD
          </Mono>
          {wallUrl ? (
            <>
              <Box
                sx={{
                  fontFamily: "monospace",
                  fontSize: 12,
                  color: colors.text2,
                  overflowWrap: "anywhere",
                }}
              >
                {wallUrl}
              </Box>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                <Button
                  size="small"
                  variant="outlined"
                  color="warning"
                  href={wallUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  color="warning"
                  onClick={() =>
                    void navigator.clipboard
                      ?.writeText(wallUrl)
                      .then(() =>
                        enqueueSnackbar("Link copied", { variant: "success" }),
                      )
                  }
                >
                  Copy link
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  color="warning"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Make a new link? The TV's current link stops working.",
                      )
                    )
                      void save(
                        { rotateWallboard: true },
                        "New wall-board link made",
                      );
                  }}
                >
                  New link
                </Button>
              </Box>
            </>
          ) : (
            <Box>
              <Button
                size="small"
                variant="outlined"
                color="warning"
                disabled={busy}
                onClick={() =>
                  void save({ rotateWallboard: true }, "Wall-board link made")
                }
              >
                Make a wall-board link
              </Button>
            </Box>
          )}
        </Box>
      </Box>
    </Panel>
  );
}

export default LiveSettingsPanel;
