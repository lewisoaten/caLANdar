import * as React from "react";
import { useContext, useEffect, useState } from "react";
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
import { UserContext, UserDispatchContext } from "../UserProvider";
import ListItem from "@mui/material/ListItem";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import RefreshGamesButton from "./RefreshGamesButton";
import { Collapse, Tooltip } from "@mui/material";
import { Event, SportsEsports, EventSeat } from "@mui/icons-material";
import { RSVP } from "../types/invitations";

interface MenuItemsProps {
  updateButtonLoadingState: [
    boolean,
    React.Dispatch<React.SetStateAction<boolean>>,
  ];
  updateButtonDoneState: [
    boolean,
    React.Dispatch<React.SetStateAction<boolean>>,
  ];
  rsvpRefreshTrigger?: number; // Optional trigger to force RSVP re-fetch
}

export default function MenuItems(props: MenuItemsProps) {
  const user = useContext(UserContext);
  const { signOut } = useContext(UserDispatchContext);
  const { loggedIn, isAdmin, token, email } = user;

  const location = useLocation();
  const eventMatch = location.pathname.match(/^\/events\/(\d+)/);
  const eventUrl = eventMatch?.[0];
  const eventId = eventMatch?.[1];
  const gamesUrl = eventUrl ? `${eventUrl}/games` : null;
  const seatMapUrl = eventUrl ? `${eventUrl}/seat-map` : null;

  const [eventAccess, setEventAccess] = useState({
    loading: false,
    attending: false,
  });

  useEffect(() => {
    if (!eventId || !token || !email) {
      setEventAccess({ loading: false, attending: false });
      return;
    }

    let isActive = true;
    const controller = new AbortController();
    setEventAccess((prev) => ({ ...prev, loading: true }));

    fetch(`/api/events/${eventId}/invitations/${encodeURIComponent(email)}`, {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    })
      .then((response) => {
        if (response.status === 401) {
          signOut();
          throw new Error("Unauthorized");
        }
        if (!response.ok) {
          throw new Error("Unable to load invitation");
        }
        return response.json() as Promise<{ response: RSVP | null }>;
      })
      .then((data) => {
        if (!isActive) return;
        const attending =
          data.response === RSVP.yes || data.response === RSVP.maybe;
        setEventAccess({ loading: false, attending });
      })
      .catch((error) => {
        if (!isActive) return;
        if (error.name === "AbortError") {
          return;
        }
        setEventAccess({ loading: false, attending: false });
      });

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [email, eventId, signOut, token, props.rsvpRefreshTrigger]);

  const tooltipTitle = eventAccess.loading
    ? "Checking RSVP status…"
    : 'RSVP "Yes" or "Maybe" to access this section.';

  const renderRestrictedNavItem = (
    to: string,
    icon: React.ReactNode,
    label: string,
    disabled: boolean,
  ) => {
    const button = (
      <ListItemButton
        sx={{ pl: 4 }}
        component={Link}
        to={to}
        disabled={disabled}
      >
        <ListItemIcon>{icon}</ListItemIcon>
        <ListItemText primary={label} />
      </ListItemButton>
    );

    if (!disabled) {
      return button;
    }

    return (
      <Tooltip title={tooltipTitle} placement="right" arrow>
        <span style={{ display: "block" }}>{button}</span>
      </Tooltip>
    );
  };

  const restrictEventExtras = Boolean(eventUrl) && !eventAccess.attending;

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
                {gamesUrl &&
                  renderRestrictedNavItem(
                    gamesUrl,
                    <SportsEsports />,
                    "Games",
                    restrictEventExtras,
                  )}
                {seatMapUrl &&
                  renderRestrictedNavItem(
                    seatMapUrl,
                    <EventSeat />,
                    "Seat Map",
                    restrictEventExtras,
                  )}
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
