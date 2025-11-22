import React, { ChangeEvent, useEffect, useState } from "react";
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
  Skeleton,
} from "@mui/material";
import AccessTimeIcon from "@mui/icons-material/AccessTime";

import { EventGame } from "../types/game_suggestions";

import moment from "moment";
import GameOwners from "./GameOwners";

// Create GamesList Props
interface GamesListProps {
  // Props Here
  loadNewPage: (page: number) => void;
  games: Map<number, EventGame[]>;
  gamesCount: number;
  loading: boolean;
}

// Helper function to format duration - moved outside component to prevent recreations
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

// Memoized game card component to prevent unnecessary re-renders
const GameCard = React.memo(({ game }: { game: EventGame }) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  const imageUrl = `https://cdn.akamai.steamstatic.com/steam/apps/${game.appid}/header.jpg`;

  const handleImageLoad = () => {
    setImageLoaded(true);
  };

  const handleImageError = () => {
    setImageError(true);
  };

  return (
    <Card sx={{ maxWidth: 345 }} elevation={4}>
      <div style={{ position: "relative", height: 140 }}>
        {!imageLoaded && !imageError && (
          <Skeleton variant="rectangular" height={140} animation="wave" />
        )}
        {imageError && (
          <Skeleton variant="rectangular" height={140} animation={false} />
        )}
        <CardMedia
          sx={{
            height: 140,
            position: imageLoaded ? "static" : "absolute",
            top: 0,
            left: 0,
            width: "100%",
            opacity: imageLoaded ? 1 : 0,
            visibility: imageError ? "hidden" : "visible",
            transition: "opacity 0.3s ease-in-out",
          }}
          component="img"
          image={imageUrl}
          title={game.name}
          loading="lazy"
          onLoad={handleImageLoad}
          onError={handleImageError}
        />
      </div>
      <CardContent>
        <Typography gutterBottom variant="h5" component="div">
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
          <GameOwners hideIfEmpty gamerOwned={game.gamerOwned} />
        </Stack>
      </CardContent>
    </Card>
  );
});

GameCard.displayName = "GameCard";

// Loading skeleton for game cards
const GameCardSkeleton = () => (
  <Card sx={{ maxWidth: 345 }} elevation={4}>
    <Skeleton variant="rectangular" height={140} animation="wave" />
    <CardContent>
      <Skeleton variant="text" width="80%" height={32} animation="wave" />
      <Stack
        direction="row"
        alignItems="baseline"
        justifyContent="space-between"
        sx={{ mt: 2 }}
      >
        <Skeleton variant="rounded" width={100} height={24} animation="wave" />
        <Skeleton variant="circular" width={24} height={24} animation="wave" />
      </Stack>
    </CardContent>
  </Card>
);

const GamesList = (props: GamesListProps) => {
  const [page, setPage] = useState(1);

  useEffect(() => {
    props.loadNewPage(0);
  }, []);

  const handleChangePage = (_event: ChangeEvent<unknown>, newPage: number) => {
    setPage(newPage);
    props.loadNewPage(newPage - 1);
  };

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 12, lg: 12 }}>
          <Paper>
            <Container maxWidth="lg" sx={{ mt: 4, mb: 4, p: 3 }}>
              <Grid size={{ xs: 12, md: 12, lg: 12 }}>
                <Pagination
                  count={props.gamesCount}
                  page={page}
                  onChange={handleChangePage}
                  variant="outlined"
                  shape="rounded"
                  disabled={props.loading}
                />
              </Grid>
            </Container>
            <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
              {props.loading ? (
                <Grid container spacing={3}>
                  {/* Show 12 skeleton cards while loading */}
                  {Array.from({ length: 12 }).map((_, index) => (
                    <Grid size={{ xs: 12, md: 6, lg: 4 }} key={index}>
                      <GameCardSkeleton />
                    </Grid>
                  ))}
                </Grid>
              ) : (
                <Grid container spacing={3}>
                  {[...props.games.keys()].map((key) => (
                    <React.Fragment key={key}>
                      <Grid size={{ xs: 12, md: 12, lg: 12 }}>
                        <Typography variant="h4">
                          Owned by {key} Gamers
                        </Typography>
                      </Grid>
                      {props.games.get(key)?.map((game) => (
                        <Grid size={{ xs: 12, md: 6, lg: 4 }} key={game.appid}>
                          <GameCard game={game} />
                        </Grid>
                      ))}
                    </React.Fragment>
                  ))}
                </Grid>
              )}
            </Container>
            <Container maxWidth="lg" sx={{ mt: 4, mb: 4, p: 3 }}>
              <Grid size={{ xs: 12, md: 12, lg: 12 }}>
                <Pagination
                  count={props.gamesCount}
                  page={page}
                  onChange={handleChangePage}
                  variant="outlined"
                  shape="rounded"
                  disabled={props.loading}
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
