import * as React from "react";
import { useContext } from "react";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import DashboardIcon from "@mui/icons-material/Dashboard";
import PeopleIcon from "@mui/icons-material/People";
import { Link } from "react-router-dom";
import { UserContext } from "../UserProvider";

export default function MenuItems() {
  const { loggedIn } = useContext(UserContext);

  return (
    <React.Fragment>
      {loggedIn ? (
        <React.Fragment>
          <ListItemButton component={Link} to="/">
            <ListItemIcon>
              <DashboardIcon />
            </ListItemIcon>
            <ListItemText primary="Home" />
          </ListItemButton>
          <ListItemButton component={Link} to="/account">
            <ListItemIcon>
              <PeopleIcon />
            </ListItemIcon>
            <ListItemText primary="Account" />
          </ListItemButton>
        </React.Fragment>
      ) : (
        <React.Fragment>
          <ListItemButton component={Link} to="/">
            <ListItemIcon>
              <DashboardIcon />
            </ListItemIcon>
            <ListItemText primary="Sign In" />
          </ListItemButton>
        </React.Fragment>
      )}
    </React.Fragment>
  );
}
