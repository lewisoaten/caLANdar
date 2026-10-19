/**
 * Local development only (`LIVE_DEV_TOOLS=1` on the API): pretend Steam
 * reported someone's game, to try the presence rules without Steam.
 */
import * as React from "react";
import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import { Panel } from "../hl/Panel";
import type { LiveState } from "../../live/store";
import type { LiveCommand } from "./LobbyActions";

const GAMES: [number, string][] = [
  [730, "Counter-Strike 2"],
  [548430, "Deep Rock Galactic"],
  [550, "Left 4 Dead 2"],
  [739630, "Phasmophobia"],
  [381210, "Dead by Daylight"],
  [427520, "Factorio"],
  [431240, "Golf With Friends"],
  [945360, "Among Us"],
];

export function DevPresencePanel({
  state,
  command,
}: {
  state: LiveState;
  command: LiveCommand;
}) {
  const people = Object.values(state.people).sort((a, b) =>
    a.handle.localeCompare(b.handle),
  );
  const [pid, setPid] = useState(people[0]?.pid ?? "");
  const [game, setGame] = useState(String(GAMES[0][0]));
  if (!state.devTools || !state.isAdmin) return null;
  const send = (gameId: number | null, personaState = 1) => {
    const name = GAMES.find(([id]) => id === gameId)?.[1] ?? null;
    void command(
      "/dev/presence",
      { pid, gameId, gameName: name, personaState },
      { admin: true },
    );
  };
  return (
    <Panel
      kicker="Dev tools"
      title="Simulate Steam"
      tone="violet"
      padding="compact"
    >
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
        <TextField
          select
          size="small"
          label="Gamer"
          value={pid}
          onChange={(e) => setPid(e.target.value)}
        >
          {people.map((p) => (
            <MenuItem key={p.pid} value={p.pid}>
              {p.handle}
              {p.checkedIn ? "" : " (not checked in)"}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label="Game"
          value={game}
          onChange={(e) => setGame(e.target.value)}
        >
          {GAMES.map(([id, name]) => (
            <MenuItem key={id} value={String(id)}>
              {name}
            </MenuItem>
          ))}
        </TextField>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          <Button
            size="small"
            variant="contained"
            color="secondary"
            onClick={() => send(Number(game))}
          >
            Playing
          </Button>
          <Button
            size="small"
            variant="outlined"
            color="secondary"
            onClick={() => send(null)}
          >
            Stopped
          </Button>
          <Button
            size="small"
            variant="outlined"
            color="secondary"
            onClick={() => send(Number(game), 3)}
          >
            Away
          </Button>
        </Box>
      </Box>
    </Panel>
  );
}

export default DevPresencePanel;
