import * as React from "react";
import { useContext } from "react";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import PeopleIcon from "@mui/icons-material/People";
import LoginIcon from "@mui/icons-material/Login";
import EventIcon from "@mui/icons-material/Event";
import Divider from "@mui/material/Divider";
import List from "@mui/material/List";
import { Link } from "react-router-dom";
import { UserContext } from "../UserProvider";
import ListItem from "@mui/material/ListItem";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import AlertTitle from "@mui/material/AlertTitle";

export default function MenuItems() {
  const { loggedIn, isAdmin } = useContext(UserContext);

  return (
    <List component="nav">
      {loggedIn ? (
        <React.Fragment>
          <ListItemButton component={Link} to="/events">
            <ListItemIcon>
              <CalendarMonthIcon />
            </ListItemIcon>
            <ListItemText primary="Events" />
          </ListItemButton>
          <ListItemButton component={Link} to="/account">
            <ListItemIcon>
              <PeopleIcon />
            </ListItemIcon>
            <ListItemText primary="Account" />
          </ListItemButton>
          <Divider sx={{ my: 1 }} />
          <ListItem>
            <Alert variant="outlined" severity="info">
              <AlertTitle>New feature!</AlertTitle>
              See what games you have in common with other gamers.{" "}
              <Link to="/account">Add your Steam ID</Link> to your profile to
              find out.
            </Alert>
          </ListItem>
        </React.Fragment>
      ) : (
        <React.Fragment>
          <ListItemButton component={Link} to="/">
            <ListItemIcon>
              <LoginIcon />
            </ListItemIcon>
            <ListItemText primary="Sign In" />
          </ListItemButton>
        </React.Fragment>
      )}
      {isAdmin && (
        <React.Fragment>
          <Divider sx={{ my: 1 }} />
          <ListItemButton component={Link} to="/admin/events">
            <ListItemIcon>
              <EventIcon />
            </ListItemIcon>
            <ListItemText primary="Event Management" />
          </ListItemButton>
        </React.Fragment>
      )}
    </List>
  );
}
