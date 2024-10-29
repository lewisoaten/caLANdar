import React, { ChangeEvent } from "react";
import {
  Container,
  Grid,
  Paper,
  Typography,
  Card,
  CardMedia,
  CardContent,
  Chip,
  Tooltip,
  Pagination,
  useTheme,
  useMediaQuery,
  Stack,
} from "@mui/material";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import { useContext } from "react";
import { UserDispatchContext, UserContext } from "../UserProvider";

import { defaultEventGamesMap, EventGame } from "../types/game_suggestions";

import { useState, useEffect } from "react";
import moment from "moment";
import { useLocation } from "react-router-dom";
import GameOwners from "./GameOwners";

const Account = () => {
  const { signOut } = useContext(UserDispatchContext);
  const userDetails = useContext(UserContext);
  const token = userDetails?.token;

  const [eventGames, setEventGames] = useState(defaultEventGamesMap);
  const [eventGamesCount, setEventGamesCount] = useState(0);

  const location = useLocation();

  useEffect(() => {
    loadNewPage(0);
  }, []);

  const loadNewPage = (page: number) => {
    fetch(`/api${location.pathname}?page=${page}&count=12`, {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: "Bearer " + token,
      },
    }).then((response) => {
      if (response.status === 401) signOut();
      if (response.status === 404) setEventGames(defaultEventGamesMap);
      else if (response.ok)
        return response.json().then((data) => {
          let eventGames = new Map<number, EventGame[]>();

          // Iterate over items in data, putting them into the correct eventGames key based on the number of gamers who own the game
          for (let i = 0; i < data.eventGames.length; i++) {
            const item = data.eventGames[i];

            const owner_count = item.gamerOwned.length;

            let eventGamesForOwners = eventGames.get(owner_count);
            if (!eventGamesForOwners) {
              eventGamesForOwners = [];
            }
            eventGamesForOwners.push(item);
            eventGames.set(owner_count, eventGamesForOwners);
          }

          setEventGames(eventGames);
          setEventGamesCount(data.totalCount);
        });
    });
  };

  const handleChangePage = (event: ChangeEvent<unknown>, newPage: number) => {
    loadNewPage(newPage - 1);
  };

  const formatDuration = (duration: moment.Duration) => {
    const parts = [];

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
          <Paper>
            <Container maxWidth="lg" sx={{ mt: 4, mb: 4, p: 3 }}>
              <Grid item xs={12} md={12} lg={12}>
                <Pagination
                  count={eventGamesCount}
                  onChange={handleChangePage}
                  variant="outlined"
                  shape="rounded"
                />
              </Grid>
            </Container>
            <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
              <Grid container spacing={3}>
                {[...eventGames.keys()].map((key) => (
                  <React.Fragment>
                    <Grid item xs={12} md={12} lg={12}>
                      <Typography variant="h4" key={key}>
                        Owned by {key} Gamers
                      </Typography>
                    </Grid>
                    {eventGames.get(key)?.map((eventGame) => (
                      <Grid item xs={12} md={6} lg={4} key={eventGame.appid}>
                        <Card sx={{ maxWidth: 345 }} elevation={4}>
                          <CardMedia
                            sx={{ height: 140 }}
                            image={`https://steamcdn-a.akamaihd.net/steam/apps/${eventGame.appid}/header.jpg`}
                            title={eventGame.name}
                          />
                          <CardContent>
                            <Typography
                              gutterBottom
                              variant="h5"
                              component="div"
                            >
                              {eventGame.name}
                            </Typography>

                            <Stack
                              direction="row"
                              alignItems="baseline"
                              justifyContent="space-between"
                            >
                              {eventGame.playtimeForever !== 0 ? (
                                <React.Fragment>
                                  <Tooltip
                                    title={formatDuration(
                                      moment.duration(
                                        eventGame.playtimeForever,
                                        "minutes",
                                      ),
                                    )}
                                  >
                                    <Chip
                                      color="success"
                                      size="small"
                                      icon={<AccessTimeIcon />}
                                      label={moment
                                        .duration(
                                          eventGame.playtimeForever,
                                          "minutes",
                                        )
                                        .humanize()}
                                    />
                                  </Tooltip>
                                </React.Fragment>
                              ) : (
                                <React.Fragment></React.Fragment>
                              )}
                              <GameOwners gamerOwned={eventGame.gamerOwned} />
                            </Stack>
                          </CardContent>
                          {/* <CardActions>
              <Button size="small">Share</Button>
              <Button size="small">Learn More</Button>
            </CardActions> */}
                        </Card>
                      </Grid>
                    ))}
                  </React.Fragment>
                ))}
              </Grid>
            </Container>
          </Paper>
        </Grid>
      </Grid>
    </Container>
  );
};

export default Account;
