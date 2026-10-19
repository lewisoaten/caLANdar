/**
 * The admin strip in lobby details: Edit, Remove, Pin a suggestion. Edits go
 * through the schedule endpoints, which run the live engine, so every screen
 * (and the feed) sees them at once.
 */
import * as React from "react";
import { useState } from "react";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import TextField from "@mui/material/TextField";
import { useSnackbar } from "notistack";
import type { LobbyView } from "../../live/types";
import { userFacingReason } from "../../utils/apiError";
import { adminFetch } from "./adminApi";

const pad = (n: number) => String(n).padStart(2, "0");
/** ISO → `YYYY-MM-DDTHH:mm` in local time (for datetime-local). */
export const toLocalInput = (iso: string) => {
  const d = new Date(Date.parse(iso));
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function AdminLobbyActions({
  eventId,
  lobby,
  token,
}: {
  eventId: number;
  lobby: LobbyView;
  token: string;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const [editing, setEditing] = useState(false);
  const [start, setStart] = useState(toLocalInput(lobby.start));
  const [minutes, setMinutes] = useState(String(lobby.minutes));
  const [busy, setBusy] = useState(false);

  const run = async (f: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await f();
      enqueueSnackbar(done, { variant: "success" });
      setEditing(false);
    } catch (e) {
      enqueueSnackbar(userFacingReason(e) ?? "That didn't work", {
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  const base = `/events/${eventId}/game_schedule`;
  const isGame = lobby.kind === "game" && lobby.gameId != null;
  const editable = isGame && lobby.status !== "done";

  return (
    <>
      {lobby.virtual ? (
        <Button
          size="small"
          variant="outlined"
          color="warning"
          disabled={busy || !isGame}
          onClick={() =>
            run(
              () =>
                adminFetch(token, `${base}/pin`, "POST", {
                  gameId: lobby.gameId,
                  startTime: lobby.start,
                  durationMinutes: lobby.minutes,
                }),
              "Pinned to the schedule",
            )
          }
        >
          Pin
        </Button>
      ) : (
        <>
          {editable && (
            <Button
              size="small"
              variant="outlined"
              color="warning"
              disabled={busy}
              onClick={() => {
                setStart(toLocalInput(lobby.start));
                setMinutes(String(lobby.minutes));
                setEditing(true);
              }}
            >
              Edit
            </Button>
          )}
          <Button
            size="small"
            variant="outlined"
            color="warning"
            disabled={busy}
            onClick={() => {
              if (
                lobby.status === "done" &&
                !window.confirm(
                  `${lobby.name} has been played. Remove it from the history?`,
                )
              )
                return;
              void run(
                () => adminFetch(token, `${base}/${lobby.id}`, "DELETE"),
                "Removed",
              );
            }}
          >
            Remove
          </Button>
        </>
      )}
      <Dialog
        open={editing}
        onClose={() => setEditing(false)}
        aria-labelledby="edit-lobby-title"
      >
        <DialogTitle id="edit-lobby-title">Edit {lobby.name}</DialogTitle>
        <DialogContent
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            pt: "8px !important",
          }}
        >
          <TextField
            label="Start"
            type="datetime-local"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label="Length (minutes)"
            type="number"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            slotProps={{ htmlInput: { min: 5, max: 1440, step: 15 } }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditing(false)} color="inherit">
            Cancel
          </Button>
          <Button
            variant="contained"
            color="warning"
            disabled={busy}
            onClick={() =>
              run(
                () =>
                  adminFetch(token, `${base}/${lobby.id}`, "PATCH", {
                    gameId: lobby.gameId,
                    startTime: new Date(start).toISOString(),
                    durationMinutes: Number(minutes),
                  }),
                "Saved",
              )
            }
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

export default AdminLobbyActions;
