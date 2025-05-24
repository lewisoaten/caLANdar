import * as React from "react";
import { useEffect, useState, useContext, useRef, ChangeEvent } from "react";
import {
  Autocomplete,
  Typography,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Avatar,
  TextField,
  CircularProgress,
  AutocompleteChangeReason,
  Skeleton,
  Alert,
  Checkbox,
  ListItemButton,
  Stack,
} from "@mui/material";
import Grid from "@mui/material/Unstable_Grid2";
import ThumbUpOffAltIcon from "@mui/icons-material/ThumbUpOffAlt";
import ThumbUpAltIcon from "@mui/icons-material/ThumbUpAlt";
import { UserContext, UserDispatchContext } from "../UserProvider";
import { dateParser } from "../utils";
import {
  GameSuggestion,
  defaultGameSuggestions,
  Game,
  defaultGames,
  GameVote,
} from "../types/game_suggestions";
import GameOwners from "./GameOwners";

interface EventGameSuggestionsProps {
  event_id: number;
  responded: boolean;
  disabled: boolean;
}

export default function EventGameSuggestions(props: EventGameSuggestionsProps) {
  const { signOut } = useContext(UserDispatchContext);
  const userDetails = useContext(UserContext);
  const token = userDetails?.token;

  const [gameSuggestions, setGameSuggestions] = useState(
    defaultGameSuggestions,
  );
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [options, setOptions] = useState(defaultGames);

  const typingTimer = useRef<null | NodeJS.Timeout>(null);
  const doneTypingInterval = 1000;

  useEffect(() => {
    fetch(`/api/events/${props.event_id}/suggested_games`, {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: "Bearer " + token,
      },
    })
      .then((response) => {
        if (response.status === 401) signOut();
        else if (response.ok)
          return response
            .text()
            .then(
              (data) => JSON.parse(data, dateParser) as Array<GameSuggestion>,
            );
      })
      .then((data) => {
        if (data) sortAndAddGameSuggestions(data);
      });
  }, [props.event_id, props.responded]);

  function sortAndAddGameSuggestions(
    newGameSuggestions: Array<GameSuggestion>,
  ) {
    newGameSuggestions.sort((a, b) => b.votes - a.votes);
    setGameSuggestions(newGameSuggestions);
  }

  const handleInputChange = (
    event: React.SyntheticEvent,
    value: string,
    reason: string,
  ) => {
    // Prevent page reload
    event.preventDefault();

    if (typingTimer.current !== null) {
      clearTimeout(typingTimer.current);
    }

    setInputValue(value);
    setErrorMessage("");

    if (reason === "input") {
      setLoading(true);
      setOpen(true);

      typingTimer.current = setTimeout(function () {
        fetch(`/api/steam-game?query=${value}`, {
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: "Bearer " + token,
          },
        })
          .then((response) => {
            if (response.status === 401) signOut();
            else if (response.ok)
              return response
                .text()
                .then((data) => JSON.parse(data, dateParser) as Array<Game>);
          })
          .then((data) => {
            setLoading(false);
            if (!data || data.length === 0) {
              setErrorMessage("No games found");
              setOptions(defaultGames);
              setOpen(false);
            } else {
              setOptions(data);
            }
          });
      }, doneTypingInterval);
    } else {
      setOpen(false);
      setOptions(defaultGames);
    }
  };

  const handleInputSelect = (
    event: React.SyntheticEvent<Element, Event>,
    value: Game | null,
    reason: AutocompleteChangeReason,
  ) => {
    // Prevent page reload
    event.preventDefault();
    setOpen(false);

    if (reason === "selectOption" && value) {
      fetch(`/api/events/${props.event_id}/suggested_games`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({
          appid: value.appid,
          name: value.name,
        }),
      })
        .then((response) => {
          if (response.status === 401) signOut();
          else if (response.ok) {
            setInputValue("");
            return response
              .text()
              .then((data) => JSON.parse(data, dateParser) as GameSuggestion);
          }
        })
        .then((data) => {
          if (data) sortAndAddGameSuggestions([...gameSuggestions, data]);
        });
    }
  };

  const handleVote = (
    event: ChangeEvent<HTMLInputElement>,
    checked: boolean,
  ) => {
    // Prevent page reload
    event.preventDefault();

    fetch(
      `/api/events/${props.event_id}/suggested_games/${event.target.value}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({
          vote: checked ? GameVote.yes : GameVote.noVote,
        }),
      },
    )
      .then((response) => {
        if (response.status === 401) signOut();
        else if (response.ok) {
          if (response.status === 200) {
            return response
              .text()
              .then((data) => JSON.parse(data, dateParser) as GameSuggestion);
          } else {
            alert("Unable to vote");
            throw new Error("Unable to vote");
          }
        }
      })
      .then((data) => {
        if (data) {
          const gameSuggestionIndex = gameSuggestions.findIndex(
            (game) => game.appid === parseInt(event.target.value),
          );
          const newGameSuggestions = [...gameSuggestions];
          newGameSuggestions[gameSuggestionIndex] = data;
          sortAndAddGameSuggestions(newGameSuggestions);
        }
      });
  };

  return (
    <Grid container spacing={2}>
      <Grid item xs={12}>
        <Typography component="h3" variant="h6" color="primary" gutterBottom>
          Game Suggestions
        </Typography>
      </Grid>
      {props.responded ? (
        <Grid item xs={12}>
          <Autocomplete
            id="game-suggestion"
            open={open}
            onOpen={() => {
              setOpen(true);
            }}
            onClose={() => {
              setOpen(false);
            }}
            isOptionEqualToValue={(option, value) => option.name === value.name}
            getOptionLabel={(option) => option.name}
            options={options}
            getOptionDisabled={(option) =>
              gameSuggestions.find((x) => x.appid === option.appid)
                ? true
                : false
            }
            handleHomeEndKeys={false}
            loading={loading}
            value={null}
            inputValue={inputValue}
            openOnFocus={false}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Suggest Game"
                error={errorMessage ? true : false}
                helperText={errorMessage}
                InputProps={{
                  ...params.InputProps,
                  endAdornment: (
                    <React.Fragment>
                      {loading ? (
                        <CircularProgress color="inherit" size={20} />
                      ) : null}
                      {params.InputProps.endAdornment}
                    </React.Fragment>
                  ),
                }}
              />
            )}
            filterOptions={(x) => x}
            onInputChange={handleInputChange}
            onChange={handleInputSelect}
            disabled={props.disabled}
          />
        </Grid>
      ) : (
        <React.Fragment>
          <Grid item xs={12}>
            <Alert severity="info">RSVP to make game suggestions.</Alert>
          </Grid>
          <Grid item xs={12}>
            <Skeleton variant="rectangular" width="100%" animation="wave">
              <Typography variant="body1" gutterBottom>
                Autocomplete
              </Typography>
            </Skeleton>
          </Grid>
        </React.Fragment>
      )}
      <Grid item xs={12}>
        <List>
          {gameSuggestions.map((gameSuggestion) => {
            const labelId = `checkbox-list-secondary-label-${gameSuggestion.appid}`;
            return (
              <ListItem
                key={gameSuggestion.appid}
                secondaryAction={
                  props.responded && (
                    <Stack
                      direction="row"
                      spacing={2}
                      sx={{
                        justifyContent: "center",
                        alignItems: "center",
                      }}
                    >
                      <GameOwners
                        gamerOwned={gameSuggestion.gamerOwned}
                        gamerUnowned={gameSuggestion.gamerUnowned}
                        gamerUnknown={gameSuggestion.gamerUnknown}
                      />
                      <Checkbox
                        value={gameSuggestion.appid}
                        edge="end"
                        icon={<ThumbUpOffAltIcon />}
                        checkedIcon={<ThumbUpAltIcon />}
                        onChange={handleVote}
                        checked={gameSuggestion.selfVote === GameVote.yes}
                        inputProps={{ "aria-labelledby": labelId }}
                        disabled={props.disabled}
                      />
                    </Stack>
                  )
                }
                dense={true}
              >
                <ListItemButton
                  aria-label="steam link"
                  href={`https://store.steampowered.com/app/${gameSuggestion.appid}/`}
                  target="_blank"
                >
                  <ListItemAvatar>
                    <Avatar
                      alt={gameSuggestion.name || "Game"}
                      src={`https://steamcdn-a.akamaihd.net/steam/apps/${gameSuggestion.appid}/header.jpg`}
                    />
                  </ListItemAvatar>
                  <ListItemText
                    primary={gameSuggestion.name}
                    secondary={`${gameSuggestion.votes} want to play!`}
                  />
                </ListItemButton>
                <ListItemButton></ListItemButton>
              </ListItem>
            );
          })}
        </List>
      </Grid>
    </Grid>
  );
}
