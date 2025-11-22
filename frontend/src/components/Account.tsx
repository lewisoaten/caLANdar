import React from "react";
import {
  Button,
  Container,
  Paper,
  Typography,
  FormControl,
  InputLabel,
  Input,
  FormHelperText,
  Link,
  Grid,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import { useContext } from "react";
import { UserDispatchContext, UserContext } from "../UserProvider";

import { defaultProfileData } from "../types/profile";
import { EventGame } from "../types/game_suggestions";

import { useState } from "react";
import moment from "moment";
import GamesList from "./GamesList";

const Account = () => {
  const { signOut } = useContext(UserDispatchContext);
  const userDetails = useContext(UserContext);
  const token = userDetails?.token;
  const [profile, setProfile] = useState(defaultProfileData);
  const [games, setGames] = useState(new Map<number, EventGame[]>());
  const [gamesCount, setGamesCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const refreshGames = () => {
    fetch(`/api/profile/games/update`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
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
    fetch(`/api/profile`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({ steamId: profile.steamId }),
    });
  };

  const loadNewPage = (page: number) => {
    setLoading(true);
    fetch(`/api/profile?page=${page}&count=12`, {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: "Bearer " + token,
      },
    })
      .then((response) => {
        if (response.status === 401) signOut();
        if (response.status === 404) {
          setProfile(defaultProfileData);
          setLoading(false);
        } else if (response.ok)
          return response.json().then((data) => {
            setProfile(data);
            // Sort Games
            let games = data.games.sort(
              (
                a: { playtimeForever: number },
                b: { playtimeForever: number },
              ) => b.playtimeForever - a.playtimeForever,
            );

            // Map UserGame to EventGame
            games = games.map(
              (game: {
                appid: number;
                name: string;
                playtimeForever: number;
              }) => {
                return {
                  appid: game.appid,
                  name: game.name,
                  gamerOwned: [],
                  playtimeForever: game.playtimeForever,
                  lastModified: moment(),
                } as EventGame;
              },
            );

            const gamesMap = new Map<number, EventGame[]>();

            gamesMap.set(1, games);

            setGames(gamesMap);

            setGamesCount(data.gameCount);
            setLoading(false);
          });
      })
      .catch((error) => {
        console.error("Error loading profile games:", error);
        setLoading(false);
      });
  };

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 12, lg: 12 }}>
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
              <Grid size={12}>
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
              <Grid size={4}>
                <Button
                  variant="contained"
                  color="success"
                  onClick={handleSteamidSave}
                >
                  Save
                </Button>
              </Grid>
              <Grid size={4}>
                <Button
                  variant="outlined"
                  startIcon={<RefreshIcon />}
                  onClick={refreshGames}
                >
                  Refresh Games
                </Button>
              </Grid>
              <Grid size={4}>
                <Button variant="outlined" color="error" onClick={signOut}>
                  Sign Out
                </Button>
              </Grid>
            </Grid>
          </Paper>
        </Grid>
        <GamesList
          loadNewPage={loadNewPage}
          games={games}
          gamesCount={gamesCount}
          loading={loading}
        />
      </Grid>
    </Container>
  );
};

export default Account;
