import React, { ChangeEvent } from "react";
import {
  Container,
  Paper,
  Typography,
  Card,
  CardMedia,
  CardContent,
  Chip,
  Tooltip,
  Pagination,
  Stack,
  Grid,
} from "@mui/material";
import AccessTimeIcon from "@mui/icons-material/AccessTime";

import { EventGame } from "../types/game_suggestions";

import { useState, useEffect } from "react";
import moment from "moment";
import GameOwners from "./GameOwners";

// Create GamesList Props
interface GamesListProps {
  // Props Here
  loadNewPage: (page: number) => void;
  games: Map<number, EventGame[]>;
  gamesCount: number;
}

const GamesList = (props: GamesListProps) => {
  const [page, setPage] = useState(1);

  useEffect(() => {
    props.loadNewPage(0);
  }, []);

  const handleChangePage = (_event: ChangeEvent<unknown>, newPage: number) => {
    setPage(newPage);
    props.loadNewPage(newPage - 1);
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
        <Grid sx={{ gridColumn: { xs: 'span 12', md: 'span 12', lg: 'span 12' } }}>
          <Paper>
            <Container maxWidth="lg" sx={{ mt: 4, mb: 4, p: 3 }}>
              <Grid sx={{ gridColumn: { xs: 'span 12', md: 'span 12', lg: 'span 12' } }}>
                <Pagination
                  count={props.gamesCount}
                  page={page}
                  onChange={handleChangePage}
                  variant="outlined"
                  shape="rounded"
                />
              </Grid>
            </Container>
            <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
              <Grid container spacing={3}>
                {[...props.games.keys()].map((key) => (
                  <React.Fragment key={key}>
                    <Grid sx={{ gridColumn: { xs: 'span 12', md: 'span 12', lg: 'span 12' } }}>
                      <Typography variant="h4">
                        Owned by {key} Gamers
                      </Typography>
                    </Grid>
                    {props.games.get(key)?.map((game) => (
                      <Grid sx={{ gridColumn: { xs: 'span 12', md: 'span 6', lg: 'span 4' } }} key={game.appid}>
                        <Card sx={{ maxWidth: 345 }} elevation={4}>
                          <CardMedia
                            sx={{ height: 140 }}
                            image={`https://steamcdn-a.akamaihd.net/steam/apps/${game.appid}/header.jpg`}
                            title={game.name}
                          />
                          <CardContent>
                            <Typography
                              gutterBottom
                              variant="h5"
                              component="div"
                            >
                              {game.name}
                            </Typography>

                            <Stack
                              direction="row"
                              alignItems="baseline"
                              justifyContent="space-between"
                            >
                              {game.playtimeForever !== 0 ? (
                                <React.Fragment>
                                  <Tooltip
                                    title={formatDuration(
                                      moment.duration(
                                        game.playtimeForever,
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
                                          game.playtimeForever,
                                          "minutes",
                                        )
                                        .humanize()}
                                    />
                                  </Tooltip>
                                </React.Fragment>
                              ) : (
                                <React.Fragment></React.Fragment>
                              )}
                              <GameOwners
                                hideIfEmpty
                                gamerOwned={game.gamerOwned}
                              />
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
            <Container maxWidth="lg" sx={{ mt: 4, mb: 4, p: 3 }}>
              <Grid sx={{ gridColumn: { xs: 'span 12', md: 'span 12', lg: 'span 12' } }}>
                <Pagination
                  count={props.gamesCount}
                  page={page}
                  onChange={handleChangePage}
                  variant="outlined"
                  shape="rounded"
                />
              </Grid>
            </Container>
          </Paper>
        </Grid>
      </Grid>
    </Container>
  );
};

export default GamesList;
