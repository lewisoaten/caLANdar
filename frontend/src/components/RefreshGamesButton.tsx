import * as React from "react";
import { useContext, useState } from "react";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import SyncSharp from "@mui/icons-material/SyncSharp";
import TaskAltSharp from "@mui/icons-material/TaskAltSharp";
import { UserContext, UserDispatchContext } from "../UserProvider";

type BoolState = [boolean, React.Dispatch<React.SetStateAction<boolean>>];

interface RefreshGamesButtonProps {
  /** Optional externally-owned loading state (so it survives remounts). */
  loadingState?: BoolState;
  /** Optional externally-owned "finished" state. */
  doneState?: BoolState;
  /** Button label; defaults to "Refresh cache". */
  label?: string;
}

/**
 * Admin action: refresh the server's Steam game cache
 * (`POST /api/steam-game-update-v2?as_admin=true`).
 *
 * The HyperLAN design places this on the Gamers admin page (the amber "Steam
 * game cache" card) rather than in the navigation.
 */
export default function RefreshGamesButton(props: RefreshGamesButtonProps) {
  const { signOut } = useContext(UserDispatchContext);
  const userDetails = useContext(UserContext);
  const token = userDetails?.token;

  const ownLoading = useState(false);
  const ownDone = useState(false);
  const [loading, setLoading] = props.loadingState ?? ownLoading;
  const [done, setDone] = props.doneState ?? ownDone;

  function handleClick() {
    setLoading(true);
    setDone(false);
    fetch(`/api//steam-game-update-v2?as_admin=true`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: "Bearer " + token,
      },
    }).then((response) => {
      if (response.status === 200) {
        setLoading(false);
        setDone(true);
      } else if (response.status === 401) {
        signOut();
      } else {
        setLoading(false);
        response.text().then((data) => console.log(data));
        const error = `Something has gone wrong, please contact the administrator. More details: ${response.status}`;
        alert(error);
        throw new Error(error);
      }
    });
  }

  return (
    <Button
      variant="outlined"
      color="warning"
      onClick={handleClick}
      disabled={loading}
      aria-busy={loading || undefined}
      startIcon={
        loading ? (
          <CircularProgress size={18} thickness={6} color="inherit" />
        ) : done ? (
          <TaskAltSharp />
        ) : (
          <SyncSharp />
        )
      }
    >
      {props.label ?? "Refresh cache"}
    </Button>
  );
}
