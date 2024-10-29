import * as React from "react";
import { useContext } from "react";
import { useLocation } from "react-router-dom";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import PeopleIcon from "@mui/icons-material/People";
import AccountBoxIcon from "@mui/icons-material/AccountBox";
import LoginIcon from "@mui/icons-material/Login";
import EventIcon from "@mui/icons-material/Event";
import Divider from "@mui/material/Divider";
import List from "@mui/material/List";
import { Link } from "react-router-dom";
import { UserContext } from "../UserProvider";
import ListItem from "@mui/material/ListItem";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import RefreshGamesButton from "./RefreshGamesButton";
import { Collapse } from "@mui/material";
import { Event, SportsEsports } from "@mui/icons-material";

interface MenuItemsProps {
  updateButtonLoadingState: [
    boolean,
    React.Dispatch<React.SetStateAction<boolean>>,
  ];
  updateButtonDoneState: [
    boolean,
    React.Dispatch<React.SetStateAction<boolean>>,
  ];
}

export default function MenuItems(props: MenuItemsProps) {
  const { loggedIn, isAdmin } = useContext(UserContext);

  const location = useLocation();
  const eventUrl = location.pathname.match(/^\/events\/[0-9]+/g)?.[0];
  const gamesUrl = eventUrl + "/games";

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
          {eventUrl && (
            <Collapse in={true}>
              <List>
                <ListItemButton sx={{ pl: 4 }} component={Link} to={eventUrl}>
                  <ListItemIcon>
                    <Event />
                  </ListItemIcon>
                  <ListItemText primary="Event" />
                </ListItemButton>
                <ListItemButton sx={{ pl: 4 }} component={Link} to={gamesUrl}>
                  <ListItemIcon>
                    <SportsEsports />
                  </ListItemIcon>
                  <ListItemText primary="Games" />
                </ListItemButton>
              </List>
            </Collapse>
          )}
          <ListItemButton component={Link} to="/account">
            <ListItemIcon>
              <AccountBoxIcon />
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
          <ListItemButton component={Link} to="/admin/gamers">
            <ListItemIcon>
              <PeopleIcon />
            </ListItemIcon>
            <ListItemText primary="Gamer Management" />
          </ListItemButton>
          <RefreshGamesButton
            loadingState={props.updateButtonLoadingState}
            doneState={props.updateButtonDoneState}
          />
        </React.Fragment>
      )}
    </List>
  );
}
