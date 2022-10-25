import * as React from "react";
import { useEffect, useState, useContext, useRef } from "react";
import {
  Autocomplete,
  Typography,
  Grid,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Avatar,
  TextField,
  CircularProgress,
  AutocompleteChangeReason,
  IconButton,
  Skeleton,
  Alert,
} from "@mui/material";
import LaunchIcon from "@mui/icons-material/Launch";
import { UserContext } from "../UserProvider";
import { dateParser } from "../utils";
import {
  GameSuggestion,
  defaultGameSuggestions,
  Game,
  defaultGames,
} from "../types/game_suggestions";

interface EventGameSuggestionsProps {
  event_id: number;
  responded: boolean;
}

export default function EventGameSuggestions(props: EventGameSuggestionsProps) {
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

  var typingTimer = useRef<NodeJS.Timeout>();
  const doneTypingInterval = 1000;

  useEffect(() => {
    fetch(
      `${process.env.REACT_APP_API_PROXY}/api/events/${props.event_id}/games`,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
      },
    )
      .then((response) => {
        return response
          .text()
          .then(
            (data) => JSON.parse(data, dateParser) as Array<GameSuggestion>,
          );
      })
      .then((data) => {
        sortAndAddGameSuggestions(data);
      });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.event_id, props.responded]);

  function sortAndAddGameSuggestions(
    newGameSuggestions: Array<GameSuggestion>,
  ) {
    newGameSuggestions.sort((a, b) => a.name.localeCompare(b.name));
    setGameSuggestions(newGameSuggestions);
  }

  const handleInputChange = (
    event: React.SyntheticEvent,
    value: string,
    reason: string,
  ) => {
    // Prevent page reload
    event.preventDefault();

    clearTimeout(typingTimer.current);

    setInputValue(value);
    setErrorMessage("");

    if (reason === "input") {
      setLoading(true);
      setOpen(true);

      typingTimer.current = setTimeout(function () {
        fetch(
          `${process.env.REACT_APP_API_PROXY}/api/steam-game?query=${value}`,
          {
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer " + token,
            },
          },
        )
          .then((response) => {
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
      fetch(
        `${process.env.REACT_APP_API_PROXY}/api/events/${props.event_id}/games`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + token,
          },
          body: JSON.stringify({
            appid: value.appid,
            name: value.name,
          }),
        },
      )
        .then((response) => {
          setInputValue("");
          return response
            .text()
            .then((data) => JSON.parse(data, dateParser) as GameSuggestion);
        })
        .then((data) => {
          sortAndAddGameSuggestions([...gameSuggestions, data]);
        });
    }
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
          {gameSuggestions.map((gameSuggestion) => (
            <ListItem
              secondaryAction={
                <IconButton
                  aria-label="steam link"
                  href={`https://store.steampowered.com/app/${gameSuggestion.appid}/`}
                  target="_blank"
                >
                  <LaunchIcon />
                </IconButton>
              }
              dense={true}
            >
              <ListItemAvatar>
                <Avatar
                  alt={gameSuggestion.name || "Game"}
                  src={`https://steamcdn-a.akamaihd.net/steam/apps/${gameSuggestion.appid}/header.jpg`}
                />
              </ListItemAvatar>
              <ListItemText
                primary={gameSuggestion.name}
                secondary={`Suggested: ${gameSuggestion.requested_at.format(
                  "ll",
                )}`}
              />
            </ListItem>
          ))}
        </List>
      </Grid>
    </Grid>
  );
}
