import React from "react";
import {
  Button,
  Container,
  Grid,
  Paper,
  Typography,
  Card,
  CardMedia,
  CardContent,
  FormControl,
  InputLabel,
  Input,
  FormHelperText,
  Link,
  Chip,
  Tooltip,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import { useContext } from "react";
import { UserDispatchContext, UserContext } from "../UserProvider";

import { defaultProfileData } from "../types/profile";

import { useState, useEffect } from "react";
import moment from "moment";

const Account = () => {
  const { signOut } = useContext(UserDispatchContext);
  const userDetails = useContext(UserContext);
  const token = userDetails?.token;
  const [profile, setProfile] = useState(defaultProfileData);

  useEffect(() => {
    fetch(`${process.env.REACT_APP_API_PROXY}/api/profile`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
    }).then((response) => {
      if (response.status === 401) signOut();
      if (response.status === 404) setProfile(defaultProfileData);
      else if (response.ok)
        return response.json().then((data) => {
          data.games = data.games.sort(
            (a: { playtimeForever: number }, b: { playtimeForever: number }) =>
              b.playtimeForever - a.playtimeForever,
          );
          setProfile(data);
        });
    });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshGames = () => {
    fetch(`${process.env.REACT_APP_API_PROXY}/api/profile/games/update`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({}),
    });
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setProfile({
      ...profile,
      [name]: value,
    });
  };

  const handleSteamidSave = () => {
    fetch(`${process.env.REACT_APP_API_PROXY}/api/profile`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({ steamId: profile.steamId }),
    });
  };

  const formatDuration = (duration: moment.Duration) => {
    let parts = [];

    // return nothing when the duration is falsy or not correctly parsed (P0D)
    if (!duration || duration.toISOString() === "P0D") return;

    if (duration.years() >= 1) {
      const years = Math.floor(duration.years());
      parts.push(years + " " + (years > 1 ? "years" : "year"));
    }

    if (duration.months() >= 1) {
      const months = Math.floor(duration.months());
      parts.push(months + " " + (months > 1 ? "months" : "month"));
    }

    if (duration.days() >= 1) {
      const days = Math.floor(duration.days());
      parts.push(days + " " + (days > 1 ? "days" : "day"));
    }

    if (duration.hours() >= 1) {
      const hours = Math.floor(duration.hours());
      parts.push(hours + " " + (hours > 1 ? "hours" : "hour"));
    }

    if (duration.minutes() >= 1) {
      const minutes = Math.floor(duration.minutes());
      parts.push(minutes + " " + (minutes > 1 ? "minutes" : "minute"));
    }

    if (duration.seconds() >= 1) {
      const seconds = Math.floor(duration.seconds());
      parts.push(seconds + " " + (seconds > 1 ? "seconds" : "second"));
    }

    return parts.join(", ");
  };

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Grid container spacing={3}>
        <Grid item xs={12} md={12} lg={12}>
          <Paper
            sx={{
              p: 2,
              display: "flex",
              flexDirection: "column",
              height: 240,
            }}
          >
            <Typography
              component="h2"
              variant="h6"
              color="primary"
              gutterBottom
            >
              Account page
            </Typography>
            <Typography variant="subtitle1" gutterBottom>
              {userDetails.email}
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <FormControl variant="standard">
                  <InputLabel htmlFor="steamId">Steam ID</InputLabel>
                  <Input
                    id="steamId"
                    name="steamId"
                    type="number"
                    required
                    margin="dense"
                    value={profile.steamId}
                    onChange={handleInputChange}
                    aria-describedby="steamIdHelperText"
                  />
                  <FormHelperText id="steamIdHelperText">
                    Get your Steam ID from your{" "}
                    <Link
                      href="https://store.steampowered.com/account/#:~:text=lewisajoaten%27s%20Account-,Steam%20ID,-%3A%20"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Account Page
                    </Link>
                  </FormHelperText>
                </FormControl>
              </Grid>
              <Grid item xs={4}>
                <Button
                  variant="contained"
                  color="success"
                  onClick={handleSteamidSave}
                >
                  Save
                </Button>
              </Grid>
              <Grid item xs={4}>
                <Button
                  variant="outlined"
                  startIcon={<RefreshIcon />}
                  onClick={refreshGames}
                >
                  Refresh Games
                </Button>
              </Grid>
              <Grid item xs={4}>
                <Button variant="outlined" color="error" onClick={signOut}>
                  Sign Out
                </Button>
              </Grid>
            </Grid>
          </Paper>
        </Grid>
        {/* Render game cards for each game in profile */}
        {profile.games.map((game) => (
          <Grid item xs={12} md={6} lg={4} key={game.appid}>
            <Card key={game.appid} sx={{ maxWidth: 345 }}>
              <CardMedia
                sx={{ height: 140 }}
                image={`https://steamcdn-a.akamaihd.net/steam/apps/${game.appid}/header.jpg`}
                title={game.name}
              />
              <CardContent>
                <Typography gutterBottom variant="h5" component="div">
                  {game.name}
                </Typography>

                {game.playtimeForever !== 0 ? (
                  <React.Fragment>
                    <Tooltip
                      title={formatDuration(
                        moment.duration(game.playtimeForever, "minutes"),
                      )}
                    >
                      <Chip
                        color="success"
                        size="small"
                        icon={<AccessTimeIcon />}
                        label={moment
                          .duration(game.playtimeForever, "minutes")
                          .humanize()}
                      />
                    </Tooltip>
                  </React.Fragment>
                ) : (
                  <React.Fragment></React.Fragment>
                )}
              </CardContent>
              {/* <CardActions>
                <Button size="small">Share</Button>
                <Button size="small">Learn More</Button>
              </CardActions> */}
            </Card>
          </Grid>
        ))}
      </Grid>
    </Container>
  );
};

export default Account;
