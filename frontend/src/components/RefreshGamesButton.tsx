import {
  CircularProgress,
  ListItemButton,
  ListItemIcon,
  ListItemText,
} from "@mui/material";
import UpdateIcon from "@mui/icons-material/Update";
import TaskAltIcon from "@mui/icons-material/TaskAlt";
import React, { useContext } from "react";
import { UserContext, UserDispatchContext } from "../UserProvider";

interface RefreshGamesButtonProps {
  loadingState: [boolean, React.Dispatch<React.SetStateAction<boolean>>];
  doneState: [boolean, React.Dispatch<React.SetStateAction<boolean>>];
}

export default function RefreshGamesButton(props: RefreshGamesButtonProps) {
  const { signOut } = useContext(UserDispatchContext);
  const userDetails = useContext(UserContext);
  const token = userDetails?.token;

  const [loading, setLoading] = props.loadingState;
  const [done, setDone] = props.doneState;

  function handleClick() {
    setLoading(true);
    setDone(false);
    fetch(`/api//steam-game-update-v2?as_admin=true`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
    }).then((response) => {
      if (response.status === 200) {
        setLoading(false);
        setDone(true);
      } else if (response.status === 401) {
        signOut();
      } else {
        response.text().then((data) => console.log(data));
        const error = `Something has gone wrong, please contact the administrator. More details: ${response.status}`;
        alert(error);
        throw new Error(error);
      }
    });
  }

  return (
    <ListItemButton onClick={handleClick} disabled={loading}>
      <ListItemIcon>
        {!loading && !done && <UpdateIcon />}
        {loading && (
          <React.Fragment>
            <svg width={0} height={0}>
              <defs>
                <linearGradient
                  id="my_gradient"
                  x1="0%"
                  y1="0%"
                  x2="0%"
                  y2="100%"
                >
                  <stop offset="0%" stopColor="#e01cd5" />
                  <stop offset="100%" stopColor="#1CB5E0" />
                </linearGradient>
              </defs>
            </svg>
            <CircularProgress
              sx={{ "svg circle": { stroke: "url(#my_gradient)" } }}
              size={25}
              thickness={6}
            />
          </React.Fragment>
        )}
        {!loading && done && <TaskAltIcon color="success" />}
      </ListItemIcon>
      <ListItemText primary="Update Games" />
    </ListItemButton>
  );
}
