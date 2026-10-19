/**
 * The Live page, `/events/:id/live` (docs/live-event/DESIGN.md §7): the me
 * strip, the timeline, lobby details, up next, the floor and the feed, all
 * fed by one live store kept in step over SSE.
 */
import * as React from "react";
import { useContext, useMemo, useState } from "react";
import { Link as RouterLink, useParams } from "react-router-dom";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Skeleton from "@mui/material/Skeleton";
import Typography from "@mui/material/Typography";
import EventBusySharp from "@mui/icons-material/EventBusySharp";
import { useSnackbar } from "notistack";
import { UserContext } from "../../UserProvider";
import { EmptyState, Panel } from "../hl";
import { colors, sectionGap, srOnly } from "../hl/tokens";
import { useLive } from "../../live/useLive";
import { useServerNow } from "../../live/clock";
import { sendLiveCommand } from "../../live/commands";
import { dayClock, defaultSelection } from "../../live/selectors";
import type { LobbyView } from "../../live/types";
import { userFacingReason } from "../../utils/apiError";
import { ConnectionIndicator } from "./ConnectionIndicator";
import { MeStrip } from "./MeStrip";
import { LiveTimeline } from "./LiveTimeline";
import { LobbyDetails } from "./LobbyDetails";
import { UpNext } from "./UpNext";
import { LiveFloor } from "./LiveFloor";
import { LiveFeed } from "./LiveFeed";
import { AdminLobbyActions } from "./AdminLobbyActions";
import { LiveSettingsPanel } from "./LiveSettingsPanel";
import { Mono } from "./liveUi";

export default function LivePage() {
  const { id } = useParams();
  const eventId = Number(id);
  const { token } = useContext(UserContext);
  const { connection, state } = useLive(
    Number.isFinite(eventId) ? eventId : null,
  );
  const now = useServerNow(state, 1000);
  const { enqueueSnackbar } = useSnackbar();
  const [selected, setSelected] = useState<string | null>(null);
  const [jumpKey, setJumpKey] = useState(0);
  const [busy, setBusy] = useState(false);

  const selectedId =
    selected && state.lobbies[selected]
      ? selected
      : defaultSelection(state, now);
  const lobby: LobbyView | null = selectedId
    ? (state.lobbies[selectedId] ?? null)
    : null;

  /** Run a live command, reporting a refusal as a toast. */
  const command = useMemo(
    () =>
      async (
        path: string,
        body?: unknown,
        options?: Parameters<typeof sendLiveCommand>[4],
      ) => {
        if (!connection) return null;
        setBusy(true);
        try {
          return await sendLiveCommand(connection, token, path, body, options);
        } catch (e) {
          enqueueSnackbar(
            userFacingReason(e) ?? "That didn't work. Try again.",
            {
              variant: "error",
            },
          );
          return null;
        } finally {
          setBusy(false);
        }
      },
    [connection, token, enqueueSnackbar],
  );

  if (state.error === "notFound") {
    return (
      <EmptyState
        variant="panel"
        icon={<EventBusySharp />}
        kicker="404"
        title="Live isn't available"
        description="The event may have been removed, or you haven't been invited to it."
        action={
          <Button variant="outlined" component={RouterLink} to="/events">
            Back to events
          </Button>
        }
      />
    );
  }

  if (!state.loaded) {
    return (
      <Box
        role="status"
        aria-label="Loading Live"
        sx={{ display: "flex", flexDirection: "column", gap: sectionGap }}
      >
        <Skeleton variant="rectangular" height={66} />
        <Skeleton variant="rectangular" height={300} />
        <Skeleton variant="rectangular" height={240} />
      </Box>
    );
  }

  const event = state.event;
  const kicker = event
    ? `${dayClock(event.timeBegin)} → ${dayClock(event.timeEnd)}`
    : "Schedule";

  return (
    <>
      <Typography variant="h1" sx={srOnly}>
        {event?.title ?? "Live"}: live
      </Typography>

      <MeStrip
        state={state}
        now={now}
        busy={busy}
        onCheckIn={() => void command("/checkin", {})}
        onSelect={setSelected}
      />

      <Panel
        kicker={kicker}
        title={event?.title ?? "Schedule"}
        padding="none"
        actions={
          <Box
            sx={{
              display: "flex",
              gap: 1,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <ConnectionIndicator
              status={state.status}
              lastUpdate={state.lastUpdate}
            />
            <Button
              size="small"
              variant="outlined"
              color="success"
              onClick={() => setJumpKey((k) => k + 1)}
              sx={{ minHeight: 32 }}
            >
              Now
            </Button>
          </Box>
        }
      >
        <LiveTimeline
          state={state}
          now={now}
          selectedId={selectedId}
          onSelect={setSelected}
          jumpKey={jumpKey}
        />
      </Panel>

      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          gap: "clamp(16px, 2vw, 24px)",
          alignItems: "flex-start",
        }}
      >
        <Box
          sx={{
            flex: "1.5 1 460px",
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: sectionGap,
          }}
        >
          <LobbyDetails
            state={state}
            lobby={lobby}
            now={now}
            adminActions={
              lobby && eventId ? (
                <AdminLobbyActions
                  eventId={eventId}
                  lobby={lobby}
                  token={token}
                />
              ) : undefined
            }
          />
          <LiveFeed state={state} />
        </Box>
        <Box
          sx={{
            flex: "1 1 300px",
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: sectionGap,
          }}
        >
          <UpNext state={state} now={now} onSelect={setSelected} />
          <LiveFloor state={state} />
          {state.isAdmin && connection && (
            <LiveSettingsPanel eventId={eventId} state={state} token={token} />
          )}
        </Box>
      </Box>

      <Mono
        size={9}
        color={colors.textDim}
        weight={400}
        sx={{ display: "block", textAlign: "right" }}
      >
        SEQ {state.seq}
      </Mono>
    </>
  );
}
