import React from "react";
import {
  Button,
  Container,
  Grid,
  Paper,
  Typography,
  TextField,
  Card,
  CardMedia,
  CardContent,
  CardActions,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import { useContext } from "react";
import { UserDispatchContext, UserContext } from "../UserProvider";

import { defaultProfileData } from "../types/profile";

import { useState, useEffect } from "react";

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
        return response.json().then((data) => setProfile(data));
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
                <TextField
                  id="steamId"
                  name="steamId"
                  label="Steam ID"
                  type="number"
                  required
                  margin="dense"
                  value={profile.steamId}
                  onChange={handleInputChange}
                />
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
          <Grid item xs={12} md={6} lg={4}>
            <Card key={game.appid} sx={{ maxWidth: 345 }}>
              <CardMedia
                sx={{ height: 140 }}
                image={`https://steamcdn-a.akamaihd.net/steam/apps/${game.appid}/header.jpg`}
                title={game.appid.toString()}
              />
              <CardContent>
                <Typography gutterBottom variant="h5" component="div">
                  {game.appid.toString()}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {game.appid.toString()}
                </Typography>
              </CardContent>
              <CardActions>
                <Button size="small">Share</Button>
                <Button size="small">Learn More</Button>
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Container>
  );
};

export default Account;
