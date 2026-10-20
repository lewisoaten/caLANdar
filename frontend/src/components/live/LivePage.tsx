/**
 * The Live page, `/events/:id/live` (docs/live-event/DESIGN.md §7): the me
 * strip, the timeline, lobby details, up next, the floor and the feed, the
 * toast stack, the propose/vote sheet and the admin button, all fed by one
 * live store kept in step over SSE.
 */
import * as React from "react";
import { useCallback, useContext, useMemo, useState } from "react";
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
import {
  currentMembers,
  dayClock,
  defaultSelection,
  visibleLobbies,
} from "../../live/selectors";
import { deriveToasts, type Toast, type ToastAction } from "../../live/toasts";
import {
  notificationsSupported,
  useAlertNotifications,
  useClientTick,
} from "../../live/alerts";
import type { LobbyView, VoteView } from "../../live/types";
import { enablePush } from "../../live/push";
import { userFacingReason } from "../../utils/apiError";
import { ConnectionIndicator } from "./ConnectionIndicator";
import { MeStrip } from "./MeStrip";
import { LiveTimeline } from "./LiveTimeline";
import { LobbyDetails } from "./LobbyDetails";
import { UpNext } from "./UpNext";
import { LiveFloor } from "./LiveFloor";
import { LiveFeed } from "./LiveFeed";
import { AdminLobbyActions } from "./AdminLobbyActions";
import {
  LobbyActions,
  LobbyLog,
  SetupCard,
  type LiveCommand,
} from "./LobbyActions";
import { AuditTimeline } from "./AuditTimeline";
import { DevPresencePanel } from "./DevPresencePanel";
import { CallVoteMenu } from "./CallVoteMenu";
import { ProposeSheet, type SheetRequest } from "./ProposeSheet";
import { VoteCard } from "./VoteCard";
import { ProposalCard } from "./ProposalCard";
import { ToastStack, useToastPrefs } from "./ToastStack";
import { AdminFab } from "./AdminFab";
import { Mono } from "./liveUi";

/** Lobby-specific actions that open the sheet or run a command (phase 3). */
function MoreLobbyActions({
  lobby,
  me,
  now,
  busy,
  command,
  openSheet,
}: {
  lobby: LobbyView;
  me: string | null;
  now: number;
  busy: boolean;
  command: LiveCommand;
  openSheet: (r: SheetRequest) => void;
}) {
  const inIt = currentMembers(lobby).some((m) => m.pid === me);
  const wasIn = lobby.members.some((m) => m.pid === me);
  const upcoming =
    !lobby.virtual &&
    (lobby.status === "planned" || lobby.status === "confirmed");
  const mineProposal =
    lobby.proposedBy === me &&
    (lobby.status === "proposed" || lobby.status === "confirmed");
  return (
    <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
      {upcoming && (
        <Button
          variant="outlined"
          disabled={busy}
          onClick={() => openSheet({ mode: "change", lobby })}
        >
          Propose a change
        </Button>
      )}
      {lobby.virtual && (
        <Button
          variant="outlined"
          disabled={busy}
          onClick={() => openSheet({ mode: "game", lobby })}
        >
          Propose something else
        </Button>
      )}
      {lobby.status === "waiting" && (
        <Button
          variant="outlined"
          color="error"
          disabled={busy}
          onClick={() => openSheet({ mode: "delay", lobby })}
        >
          Delay start…
        </Button>
      )}
      {inIt && lobby.status === "live" && (
        <Button
          variant="outlined"
          color="success"
          disabled={busy}
          onClick={() => openSheet({ mode: "extend", lobby })}
        >
          Keep playing…
        </Button>
      )}
      {lobby.status === "empty" && (wasIn || lobby.proposedBy === me) && (
        <Button
          variant="outlined"
          color="secondary"
          disabled={busy}
          onClick={() => void command(`/lobbies/${lobby.id}/close`)}
        >
          Close now
        </Button>
      )}
      {lobby.status === "empty" && (wasIn || lobby.proposedBy === me) && (
        <Button
          variant="outlined"
          color="secondary"
          disabled={busy}
          onClick={() => void command(`/lobbies/${lobby.id}/more-time`)}
        >
          Keep open +5 min
        </Button>
      )}
      {lobby.status === "done" && lobby.gameId && (
        <Button
          variant="outlined"
          disabled={busy}
          onClick={() => openSheet({ mode: "game", gameId: lobby.gameId })}
        >
          Propose again
        </Button>
      )}
      {mineProposal && Date.parse(lobby.start) > now - 60_000 && (
        <Button
          variant="outlined"
          color="inherit"
          disabled={busy}
          onClick={() =>
            void command(`/lobbies/${lobby.id}`, undefined, {
              method: "DELETE",
            })
          }
        >
          Remove
        </Button>
      )}
    </Box>
  );
}

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
  const [lens, setLens] = useState<"lobbies" | "players">("lobbies");
  const [sheet, setSheet] = useState<SheetRequest | null>(null);
  const [notifyAsked, setNotifyAsked] = useState(false);
  const toastPrefs = useToastPrefs(eventId);

  const selectedId =
    selected && state.lobbies[selected]
      ? selected
      : defaultSelection(state, now);
  const lobby: LobbyView | null = selectedId
    ? (state.lobbies[selectedId] ?? null)
    : null;

  /** Run a live command, reporting a refusal as a toast. */
  const command: LiveCommand = useMemo(
    () => async (path, body, options) => {
      if (!connection) return null;
      setBusy(true);
      try {
        const result = await sendLiveCommand(
          connection,
          token,
          path,
          body,
          options,
        );
        // Pre-joining a suggestion stores it under a new id: follow it.
        const stored = result.lobbies?.find((l) => !l.virtual);
        if (
          selected &&
          state.lobbies[selected]?.virtual &&
          stored &&
          path.includes(encodeURIComponent(selected))
        )
          setSelected(stored.id);
        return result;
      } catch (e) {
        enqueueSnackbar(userFacingReason(e) ?? "That didn't work. Try again.", {
          variant: "error",
        });
        return null;
      } finally {
        setBusy(false);
      }
    },
    [connection, token, enqueueSnackbar, selected, state.lobbies],
  );

  const toasts = useMemo(() => deriveToasts(state, now), [state, now]);
  useAlertNotifications(toasts);
  const serverNow = useCallback(
    () => connection?.store.serverNow() ?? Date.now(),
    [connection],
  );
  const tick = useCallback(() => {
    if (!connection) return;
    void fetch(`/api/events/${eventId}/live/tick`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => undefined);
  }, [connection, eventId, token]);
  useClientTick(state, serverNow, tick);

  const onToastAction = (t: Toast, a: ToastAction) => {
    const target = a.lobbyId ? state.lobbies[a.lobbyId] : null;
    switch (a.kind) {
      case "join":
      case "rejoin":
        void command("/presence", { lobbyId: a.lobbyId });
        break;
      case "delay":
        setSheet({ mode: "delay", lobby: target });
        break;
      case "close":
        void command(`/lobbies/${a.lobbyId}/close`);
        break;
      case "ballot":
        void command(
          `/votes/${a.voteId}/ballot`,
          { optionId: a.optionId },
          { method: "PUT" },
        );
        break;
      case "showVote":
        document
          .getElementById(`vote-${a.voteId}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
        if (t.cls !== "alert") toastPrefs.toggleMinimised(t.id);
        break;
      case "moreTime":
        void command(
          `/lobbies/${encodeURIComponent(a.lobbyId ?? "")}/more-time`,
        );
        break;
      case "prejoin":
        void command(
          `/lobbies/${encodeURIComponent(a.lobbyId ?? "")}/prejoin`,
          {
            team: null,
            random: (target?.teams?.length ?? 0) > 0,
          },
        );
        break;
      case "stillPlaying":
        void command("/presence", { stillPlaying: a.lobbyId });
        break;
      case "leave":
        void command("/presence", { none: true });
        break;
      case "select":
      case "setup":
        if (a.lobbyId) setSelected(a.lobbyId);
        if (t.cls !== "alert") toastPrefs.toggleMinimised(t.id);
        break;
    }
  };

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
  const openVotes = Object.values(state.votes)
    .filter((v) => v.status === "open")
    .sort((a, b) => Date.parse(a.deadline) - Date.parse(b.deadline));
  const openProposals = visibleLobbies(state)
    .filter((l) => l.status === "proposed")
    .sort(
      (a, b) => Date.parse(a.graceUntil ?? "") - Date.parse(b.graceUntil ?? ""),
    );
  const canNotify =
    notificationsSupported() &&
    Notification.permission === "default" &&
    !notifyAsked;

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
        onLeave={() => void command("/presence", { none: true })}
        callVote={
          <CallVoteMenu
            state={state}
            now={now}
            selected={lobby}
            onOpen={setSheet}
            onLeave={() => void command("/presence", { none: true })}
          />
        }
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
            {state.isAdmin && (
              <Box
                sx={{ display: "flex", border: `1px solid ${colors.amber}66` }}
              >
                {(["lobbies", "players"] as const).map((l) => (
                  <Button
                    key={l}
                    size="small"
                    color="warning"
                    variant={lens === l ? "contained" : "text"}
                    aria-pressed={lens === l}
                    onClick={() => setLens(l)}
                    sx={{ minHeight: 32, borderRadius: 0 }}
                  >
                    {l === "lobbies" ? "Lobbies" : "Audit"}
                  </Button>
                ))}
              </Box>
            )}
            {canNotify && (
              <Button
                size="small"
                variant="text"
                onClick={() => {
                  setNotifyAsked(true);
                  void enablePush(eventId, token).then((r) =>
                    enqueueSnackbar(
                      r === "enabled"
                        ? "Alerts will reach this device, even when it's locked"
                        : r === "notifications-only"
                          ? "Alerts will show while this tab is open"
                          : "Notifications are blocked in this browser",
                      {
                        variant:
                          r === "denied" || r === "unsupported"
                            ? "warning"
                            : "success",
                      },
                    ),
                  );
                }}
                sx={{ minHeight: 32 }}
              >
                Notify me
              </Button>
            )}
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
        {lens === "players" && state.isAdmin ? (
          <AuditTimeline state={state} now={now} />
        ) : (
          <LiveTimeline
            state={state}
            now={now}
            selectedId={selectedId}
            onSelect={setSelected}
            jumpKey={jumpKey}
          />
        )}
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
            setup={
              lobby?.needsSetup &&
              lobby.gameId &&
              currentMembers(lobby).some((m) => m.pid === state.me) ? (
                <SetupCard
                  lobby={lobby}
                  eventId={eventId}
                  busy={busy}
                  command={(body) =>
                    command(`/api/games/${lobby.gameId}/lobby-defaults`, body, {
                      method: "PUT",
                    })
                  }
                />
              ) : undefined
            }
            actions={
              lobby ? (
                <Box
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 1.5,
                    width: "100%",
                  }}
                >
                  {lobby.status !== "done" && (
                    <LobbyActions
                      state={state}
                      lobby={lobby}
                      now={now}
                      busy={busy}
                      command={command}
                    />
                  )}
                  <MoreLobbyActions
                    lobby={lobby}
                    me={state.me}
                    now={now}
                    busy={busy}
                    command={command}
                    openSheet={setSheet}
                  />
                </Box>
              ) : undefined
            }
            log={lobby ? <LobbyLog state={state} lobby={lobby} /> : undefined}
            adminActions={
              lobby && eventId ? (
                <>
                  <AdminLobbyActions
                    eventId={eventId}
                    lobby={lobby}
                    token={token}
                  />
                  {(lobby.status === "live" ||
                    lobby.status === "grace" ||
                    lobby.status === "empty") && (
                    <Button
                      size="small"
                      variant="outlined"
                      color="warning"
                      disabled={busy}
                      onClick={() =>
                        void command(`/lobbies/${lobby.id}/end`, undefined, {
                          admin: true,
                        })
                      }
                    >
                      End lobby
                    </Button>
                  )}
                </>
              ) : undefined
            }
          />
          <LiveFeed
            state={state}
            openVotes={
              openVotes.length + openProposals.length > 0 ? (
                <Box
                  sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}
                >
                  <Mono size={10} color={colors.cyan} spacing="0.16em">
                    {openProposals.length > 0
                      ? `OPEN VOTES & PROPOSALS · ${openVotes.length + openProposals.length}`
                      : `OPEN VOTES · ${openVotes.length}`}
                  </Mono>
                  {openProposals.map((l) => (
                    <ProposalCard
                      key={l.id}
                      state={state}
                      lobby={l}
                      now={now}
                      busy={busy}
                      command={command}
                      onShow={setSelected}
                    />
                  ))}
                  {openVotes.map((v: VoteView) => (
                    <VoteCard
                      key={v.id}
                      state={state}
                      vote={v}
                      now={now}
                      busy={busy}
                      command={command}
                      onAddOption={(vote) => setSheet({ mode: "add", vote })}
                    />
                  ))}
                </Box>
              ) : undefined
            }
          />
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
          <DevPresencePanel state={state} command={command} />
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

      <ToastStack
        state={state}
        toasts={toasts}
        now={now}
        onAction={onToastAction}
        prefs={toastPrefs}
      />
      <ProposeSheet
        request={sheet}
        state={state}
        now={now}
        busy={busy}
        command={command}
        onClose={() => setSheet(null)}
      />
      <AdminFab
        state={state}
        command={command}
        busy={busy}
        extra={
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            {state.event?.wallboardToken && (
              <Button
                size="small"
                variant="outlined"
                color="warning"
                href={`/live/${state.event.wallboardToken}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open wall-board
              </Button>
            )}
            <Button
              size="small"
              variant="text"
              color="warning"
              component={RouterLink}
              to={`/admin/events/${eventId}?tab=live`}
            >
              Live settings
            </Button>
          </Box>
        }
      />
    </>
  );
}
