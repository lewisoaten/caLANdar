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
  Grid,
  Button,
  IconButton,
} from "@mui/material";
import ThumbUpOffAltIcon from "@mui/icons-material/ThumbUpOffAlt";
import ThumbUpAltIcon from "@mui/icons-material/ThumbUpAlt";
import EditIcon from "@mui/icons-material/Edit";
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

const COMMENT_MAX_LENGTH = 500;

interface EventGameSuggestionsProps {
  event_id: number;
  responded: number;
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
  const [commentValue, setCommentValue] = useState("");
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [options, setOptions] = useState(defaultGames);
  const [editingGameId, setEditingGameId] = useState<number | null>(null);
  const [editCommentValue, setEditCommentValue] = useState("");

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
      // Store the selected game but don't submit yet
      setSelectedGame(value);
    } else if (reason === "clear") {
      // Clear selection when autocomplete is cleared
      setSelectedGame(null);
      setCommentValue("");
    }
  };

  const handleSubmit = () => {
    if (!selectedGame) return;

    const trimmedComment = commentValue.trim();

    fetch(`/api/events/${props.event_id}/suggested_games`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({
        appid: selectedGame.appid,
        comment: trimmedComment || null,
      }),
    })
      .then((response) => {
        if (response.status === 401) signOut();
        else if (response.ok) {
          setInputValue("");
          setCommentValue("");
          setSelectedGame(null);
          return response
            .text()
            .then((data) => JSON.parse(data, dateParser) as GameSuggestion);
        }
      })
      .then((data) => {
        if (data) sortAndAddGameSuggestions([...gameSuggestions, data]);
      });
  };

  const handleCancel = () => {
    setSelectedGame(null);
    setCommentValue("");
    setInputValue("");
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

  const handleEditClick = (gameId: number, currentComment: string | null) => {
    setEditingGameId(gameId);
    setEditCommentValue(currentComment || "");
  };

  const handleEditCancel = () => {
    setEditingGameId(null);
    setEditCommentValue("");
  };

  const handleEditSave = (gameId: number) => {
    const trimmedComment = editCommentValue.trim();

    fetch(`/api/events/${props.event_id}/suggested_games/${gameId}/comment`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({
        comment: trimmedComment || null,
      }),
    })
      .then((response) => {
        if (response.status === 401) {
          signOut();
        } else if (response.status === 403) {
          alert("Permission denied: You can only edit your own suggestions");
          throw new Error("Permission denied");
        } else if (response.status === 404) {
          alert("Game suggestion not found");
          throw new Error("Game suggestion not found");
        } else if (response.ok) {
          return response
            .text()
            .then((data) => JSON.parse(data, dateParser) as GameSuggestion);
        } else {
          alert("Unable to update comment. Please try again.");
          throw new Error("Unable to update comment");
        }
      })
      .then((data) => {
        if (data) {
          const gameSuggestionIndex = gameSuggestions.findIndex(
            (game) => game.appid === gameId,
          );
          const newGameSuggestions = [...gameSuggestions];
          newGameSuggestions[gameSuggestionIndex] = data;
          sortAndAddGameSuggestions(newGameSuggestions);
          setEditingGameId(null);
          setEditCommentValue("");
        }
      });
  };

  return (
    <Grid container spacing={2}>
      <Grid size={12}>
        <Typography component="h3" variant="h6" color="primary" gutterBottom>
          Game Suggestions
        </Typography>
      </Grid>
      {props.responded ? (
        <>
          <Grid size={12}>
            <Autocomplete
              id="game-suggestion"
              open={open}
              onOpen={() => {
                setOpen(true);
              }}
              onClose={() => {
                setOpen(false);
              }}
              isOptionEqualToValue={(option, value) =>
                option.name === value.name
              }
              getOptionLabel={(option) => option.name}
              options={options}
              getOptionDisabled={(option) =>
                gameSuggestions.find((x) => x.appid === option.appid)
                  ? true
                  : false
              }
              handleHomeEndKeys={false}
              loading={loading}
              value={selectedGame}
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
          {selectedGame && (
            <>
              <Grid size={12}>
                <TextField
                  id="game-comment"
                  label="Comment (optional)"
                  placeholder="e.g., Game supports 3 players per squad"
                  fullWidth
                  multiline
                  rows={2}
                  value={commentValue}
                  onChange={(e) => setCommentValue(e.target.value)}
                  disabled={props.disabled}
                  helperText="Explain why you're suggesting this game"
                  inputProps={{ maxLength: COMMENT_MAX_LENGTH }}
                />
              </Grid>
              <Grid size={12}>
                <Stack direction="row" spacing={2}>
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={handleSubmit}
                    disabled={props.disabled}
                  >
                    Submit
                  </Button>
                  <Button
                    variant="outlined"
                    onClick={handleCancel}
                    disabled={props.disabled}
                  >
                    Cancel
                  </Button>
                </Stack>
              </Grid>
            </>
          )}
        </>
      ) : (
        <React.Fragment>
          <Grid size={12}>
            <Alert severity="info">RSVP to make game suggestions.</Alert>
          </Grid>
          <Grid size={12}>
            <Skeleton variant="rectangular" width="100%" animation="wave">
              <Typography variant="body1" gutterBottom>
                Autocomplete
              </Typography>
            </Skeleton>
          </Grid>
        </React.Fragment>
      )}
      <Grid size={12}>
        <List>
          {gameSuggestions.map((gameSuggestion) => {
            const labelId = `checkbox-list-secondary-label-${gameSuggestion.appid}`;
            const isOwner =
              userDetails?.email?.toLowerCase() ===
              gameSuggestion.userEmail.toLowerCase();
            const isEditing = editingGameId === gameSuggestion.appid;

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
                      {isOwner && !isEditing && (
                        <IconButton
                          edge="end"
                          aria-label="edit"
                          onClick={() =>
                            handleEditClick(
                              gameSuggestion.appid,
                              gameSuggestion.comment,
                            )
                          }
                          disabled={props.disabled}
                        >
                          <EditIcon />
                        </IconButton>
                      )}
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
                {!isEditing ? (
                  <ListItemButton
                    aria-label="steam link"
                    href={`https://store.steampowered.com/app/${gameSuggestion.appid}/`}
                    target="_blank"
                  >
                    <ListItemAvatar>
                      <Avatar
                        alt={gameSuggestion.name || "Game"}
                        src={`https://cdn.akamai.steamstatic.com/steam/apps/${gameSuggestion.appid}/header.jpg`}
                      />
                    </ListItemAvatar>
                    <ListItemText
                      primary={gameSuggestion.name}
                      secondary={
                        <>
                          {`${gameSuggestion.votes} want to play!`}
                          {gameSuggestion.comment && (
                            <>
                              <br />
                              {gameSuggestion.comment}
                            </>
                          )}
                        </>
                      }
                    />
                  </ListItemButton>
                ) : (
                  <Stack
                    direction="column"
                    spacing={2}
                    sx={{ width: "100%", py: 1 }}
                  >
                    <Typography variant="h6">{gameSuggestion.name}</Typography>
                    <TextField
                      fullWidth
                      multiline
                      rows={2}
                      label="Comment"
                      value={editCommentValue}
                      onChange={(e) => setEditCommentValue(e.target.value)}
                      inputProps={{ maxLength: COMMENT_MAX_LENGTH }}
                      disabled={props.disabled}
                    />
                    <Stack direction="row" spacing={2}>
                      <Button
                        variant="contained"
                        onClick={() => handleEditSave(gameSuggestion.appid)}
                        disabled={props.disabled}
                      >
                        Save
                      </Button>
                      <Button
                        variant="outlined"
                        onClick={handleEditCancel}
                        disabled={props.disabled}
                      >
                        Cancel
                      </Button>
                    </Stack>
                  </Stack>
                )}
                <ListItemButton></ListItemButton>
              </ListItem>
            );
          })}
        </List>
      </Grid>
    </Grid>
  );
}
