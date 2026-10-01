import * as React from "react";
import { useEffect, useState, useContext, useRef } from "react";
import Autocomplete, {
  AutocompleteChangeReason,
} from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import Link from "@mui/material/Link";
import Skeleton from "@mui/material/Skeleton";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import EditSharp from "@mui/icons-material/EditSharp";
import KeyboardDoubleArrowUpSharp from "@mui/icons-material/KeyboardDoubleArrowUpSharp";
import LockSharp from "@mui/icons-material/LockSharp";
import SearchSharp from "@mui/icons-material/SearchSharp";
import SportsEsportsSharp from "@mui/icons-material/SportsEsportsSharp";
import { useSnackbar } from "notistack";
import { UserContext, UserDispatchContext } from "../UserProvider";
import { dateParser } from "../utils";
import {
  GameSuggestion,
  Game,
  defaultGames,
  GameVote,
} from "../types/game_suggestions";
import { apiErrorFrom, userFacingReason } from "../utils/apiError";
import {
  EmptyState,
  Kicker,
  Panel,
  Trophy,
  colors,
  fonts,
  hairline,
  srOnly,
  tint,
  trophy,
} from "./hl";
import { rankSuggestions } from "./lobbyModel";

const COMMENT_MAX_LENGTH = 500;

interface EventGameSuggestionsProps {
  event_id: number;
  responded: number;
  disabled: boolean;
}

type Status = "loading" | "ready" | "error";

const steamCover = (appid: number) =>
  `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`;

function RankBadge({
  rank,
  trophyRank,
}: {
  rank: number;
  trophyRank: number | null;
}) {
  const label = (
    <Box component="span" sx={srOnly}>
      {`Rank ${rank}${trophyRank ? `, ${["gold", "silver", "bronze"][trophyRank - 1]} trophy` : ""}`}
    </Box>
  );
  if (!trophyRank) {
    return (
      <Box
        component="span"
        sx={{
          flex: "none",
          width: 30,
          textAlign: "center",
          fontFamily: fonts.mono,
          fontSize: 13,
          fontWeight: 700,
          color: colors.textDim,
        }}
      >
        <span aria-hidden="true">#{rank}</span>
        {label}
      </Box>
    );
  }
  const color = trophy[trophyRank as 1 | 2 | 3];
  const fill =
    trophyRank === 1
      ? "rgba(255,210,61,0.12)"
      : trophyRank === 2
        ? "rgba(201,211,230,0.10)"
        : "rgba(232,148,90,0.12)";
  return (
    <Box
      component="span"
      sx={{
        flex: "none",
        width: 30,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "2px",
      }}
    >
      <Box
        component="span"
        aria-hidden="true"
        sx={{
          width: 30,
          height: 30,
          display: "grid",
          placeItems: "center",
          border: `1px solid ${color}`,
          backgroundColor: fill,
        }}
      >
        <Trophy rank={trophyRank} size={18} decorative />
      </Box>
      <Box
        component="span"
        aria-hidden="true"
        sx={{ fontFamily: fonts.mono, fontSize: 10, fontWeight: 700, color }}
      >
        #{rank}
      </Box>
      {label}
    </Box>
  );
}

export default function EventGameSuggestions(props: EventGameSuggestionsProps) {
  const { signOut } = useContext(UserDispatchContext);
  const userDetails = useContext(UserContext);
  const token = userDetails?.token;
  const { enqueueSnackbar } = useSnackbar();

  const [gameSuggestions, setGameSuggestions] = useState<GameSuggestion[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [retry, setRetry] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [commentValue, setCommentValue] = useState("");
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [options, setOptions] = useState(defaultGames);
  const [editingGameId, setEditingGameId] = useState<number | null>(null);
  const [editCommentValue, setEditCommentValue] = useState("");
  const [pendingVote, setPendingVote] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const typingTimer = useRef<null | ReturnType<typeof setTimeout>>(null);
  const doneTypingInterval = 1000;

  const authHeaders = React.useMemo(
    () => ({
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: "Bearer " + token,
    }),
    [token],
  );

  useEffect(() => {
    if (!props.responded) return;
    let cancelled = false;
    fetch(`/api/events/${props.event_id}/suggested_games`, {
      headers: authHeaders,
    })
      .then((response) => {
        if (response.status === 401) {
          signOut();
          return undefined;
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response
          .text()
          .then(
            (data) => JSON.parse(data, dateParser) as Array<GameSuggestion>,
          );
      })
      .then((data) => {
        if (data && !cancelled) {
          setGameSuggestions(data);
          setStatus("ready");
        }
      })
      .catch((error) => {
        console.error("Error fetching game suggestions:", error);
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [props.event_id, props.responded, retry, authHeaders, signOut]);

  useEffect(
    () => () => {
      if (typingTimer.current !== null) clearTimeout(typingTimer.current);
    },
    [],
  );

  const ranked = rankSuggestions(gameSuggestions);

  const replaceSuggestion = (data: GameSuggestion) =>
    setGameSuggestions((prev) =>
      prev.map((g) => (g.appid === data.appid ? data : g)),
    );

  const handleInputChange = (
    event: React.SyntheticEvent,
    value: string,
    reason: string,
  ) => {
    // Prevent page reload
    event?.preventDefault?.();

    if (typingTimer.current !== null) {
      clearTimeout(typingTimer.current);
    }

    setInputValue(value);
    setErrorMessage("");

    if (reason === "input" && value.trim()) {
      setLoading(true);
      setOpen(true);

      typingTimer.current = setTimeout(function () {
        fetch(`/api/steam-game?query=${encodeURIComponent(value)}`, {
          headers: authHeaders,
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
          })
          .catch(() => {
            setLoading(false);
            setErrorMessage("Steam search is unavailable right now");
            setOpen(false);
          });
      }, doneTypingInterval);
    } else {
      setLoading(false);
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
    event?.preventDefault?.();
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

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!selectedGame || submitting) return;

    const trimmedComment = commentValue.trim();
    const game = selectedGame;
    setSubmitting(true);

    fetch(`/api/events/${props.event_id}/suggested_games`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        appid: game.appid,
        comment: trimmedComment || null,
      }),
    })
      .then(async (response) => {
        if (response.status === 401) {
          signOut();
          return undefined;
        }
        if (!response.ok)
          throw await apiErrorFrom("Unable to suggest game", response);
        setInputValue("");
        setCommentValue("");
        setSelectedGame(null);
        return response
          .text()
          .then((data) => JSON.parse(data, dateParser) as GameSuggestion);
      })
      .then((data) => {
        if (data) {
          setGameSuggestions((prev) => [...prev, data]);
          setAnnouncement(`Suggested ${data.name}.`);
        }
      })
      .catch((error) => {
        console.error("Error suggesting game:", error);
        const reason = userFacingReason(error);
        enqueueSnackbar(
          reason
            ? `Couldn't suggest ${game.name}: ${reason}`
            : `Couldn't suggest ${game.name}. Please try again.`,
          { variant: "error" },
        );
      })
      .finally(() => setSubmitting(false));
  };

  const handleCancel = () => {
    setSelectedGame(null);
    setCommentValue("");
    setInputValue("");
  };

  const handleVote = (appid: number, checked: boolean) => {
    setPendingVote(appid);
    fetch(`/api/events/${props.event_id}/suggested_games/${appid}`, {
      method: "PATCH",
      headers: authHeaders,
      body: JSON.stringify({
        vote: checked ? GameVote.yes : GameVote.noVote,
      }),
    })
      .then((response) => {
        if (response.status === 401) signOut();
        else if (response.status === 200) {
          return response
            .text()
            .then((data) => JSON.parse(data, dateParser) as GameSuggestion);
        } else {
          throw new Error("Unable to vote");
        }
      })
      .then((data) => {
        if (data) {
          replaceSuggestion(data);
          const next = rankSuggestions(
            gameSuggestions.map((g) => (g.appid === data.appid ? data : g)),
          ).find((r) => r.suggestion.appid === data.appid);
          setAnnouncement(
            `${checked ? "Voted for" : "Removed vote for"} ${data.name}. ${data.votes} ${data.votes === 1 ? "vote" : "votes"}, now rank ${next?.rank ?? ""}.`,
          );
        }
      })
      .catch(() => {
        enqueueSnackbar("Unable to vote. Please try again.", {
          variant: "error",
        });
      })
      .finally(() => setPendingVote(null));
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
      headers: authHeaders,
      body: JSON.stringify({
        comment: trimmedComment || null,
      }),
    })
      .then((response) => {
        if (response.status === 401) {
          signOut();
        } else if (response.status === 403) {
          throw new Error(
            "Permission denied: You can only edit your own suggestions",
          );
        } else if (response.status === 404) {
          throw new Error("Game suggestion not found");
        } else if (response.ok) {
          return response
            .text()
            .then((data) => JSON.parse(data, dateParser) as GameSuggestion);
        } else {
          throw new Error("Unable to update comment. Please try again.");
        }
      })
      .then((data) => {
        if (data) {
          replaceSuggestion(data);
          setEditingGameId(null);
          setEditCommentValue("");
          setAnnouncement(`Pitch for ${data.name} saved.`);
        }
      })
      .catch((error: Error) => {
        enqueueSnackbar(error.message, { variant: "error" });
      });
  };

  let list: React.ReactNode;
  if (!props.responded) {
    list = (
      <EmptyState
        icon={<LockSharp />}
        title="Vote locked"
        description="RSVP to view and suggest games for this event."
      />
    );
  } else if (status === "loading") {
    list = (
      <Box role="status" aria-label="Loading game suggestions">
        {Array.from({ length: 3 }).map((_, i) => (
          <Box
            key={i}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.75,
              px: 2.5,
              py: 1.5,
              borderBottom: `1px solid ${hairline.faint}`,
            }}
          >
            <Skeleton variant="rectangular" width={30} height={30} />
            <Skeleton variant="rectangular" width={92} height={43} />
            <Box sx={{ flex: 1 }}>
              <Skeleton width="50%" />
              <Skeleton width="35%" />
            </Box>
            <Skeleton variant="rectangular" width={60} height={52} />
          </Box>
        ))}
      </Box>
    );
  } else if (status === "error") {
    list = (
      <EmptyState
        title="Couldn't load the vote"
        description="Check your connection and try again."
        action={
          <Button
            variant="outlined"
            onClick={() => {
              setStatus("loading");
              setRetry((r) => r + 1);
            }}
          >
            Retry
          </Button>
        }
      />
    );
  } else if (ranked.length === 0) {
    list = (
      <EmptyState
        icon={<SportsEsportsSharp />}
        title="No games yet"
        description="Search Steam below to suggest the first game."
      />
    );
  } else {
    list = (
      <Box component="ol" sx={{ listStyle: "none", m: 0, p: 0 }}>
        {ranked.map(({ suggestion: game, rank, trophyRank }) => {
          const isOwner =
            userDetails?.email?.toLowerCase() === game.userEmail.toLowerCase();
          const isEditing = editingGameId === game.appid;
          const voted = game.selfVote === GameVote.yes;
          const attendees =
            game.gamerOwned.length +
            game.gamerUnowned.length +
            game.gamerUnknown.length;
          const meta = [
            attendees > 0
              ? `${game.gamerOwned.length} of ${attendees} own it`
              : null,
            game.suggester?.handle ? `by ${game.suggester.handle}` : null,
          ]
            .filter(Boolean)
            .join(" · ");
          const editId = `pitch-edit-${game.appid}`;

          return (
            <Box
              component="li"
              key={game.appid}
              sx={{
                px: 2.5,
                py: 1.5,
                borderBottom: `1px solid ${hairline.faint}`,
                "&:last-of-type": { borderBottom: 0 },
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.75 }}>
                <RankBadge rank={rank} trophyRank={trophyRank} />
                <Box
                  component="img"
                  src={steamCover(game.appid)}
                  alt=""
                  loading="lazy"
                  sx={{
                    width: 92,
                    height: 43,
                    flex: "none",
                    objectFit: "cover",
                    backgroundColor: colors.surface2,
                    border: `1px solid ${tint("cyan", 0.15)}`,
                    display: { xs: "none", sm: "block" },
                  }}
                />
                <Box
                  sx={{
                    flex: 1,
                    minWidth: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: "3px",
                  }}
                >
                  <Link
                    href={`https://store.steampowered.com/app/${game.appid}/`}
                    target="_blank"
                    rel="noopener noreferrer"
                    underline="hover"
                    sx={{
                      color: colors.text,
                      fontSize: 15,
                      fontWeight: 600,
                      lineHeight: 1.25,
                      overflowWrap: "anywhere",
                      alignSelf: "flex-start",
                    }}
                  >
                    {game.name}
                    <Box component="span" sx={srOnly}>
                      {" "}
                      (Steam store, opens in a new tab)
                    </Box>
                  </Link>
                  {meta && (
                    <Box
                      component="span"
                      sx={{ fontSize: 13, color: colors.textMuted }}
                    >
                      {meta}
                    </Box>
                  )}
                  {game.comment && !isEditing && (
                    <Box
                      component="span"
                      sx={{
                        fontSize: 13,
                        color: colors.text2,
                        whiteSpace: "pre-wrap",
                        overflowWrap: "anywhere",
                        "&::before": { content: '"“"' },
                        "&::after": { content: '"”"' },
                      }}
                    >
                      {game.comment}
                    </Box>
                  )}
                </Box>
                {isOwner && !isEditing && (
                  <Tooltip title="Edit your pitch">
                    <span>
                      <IconButton
                        aria-label={`Edit your pitch for ${game.name}`}
                        onClick={() =>
                          handleEditClick(game.appid, game.comment)
                        }
                        disabled={props.disabled}
                        sx={{ color: colors.textMuted }}
                      >
                        <EditSharp fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                )}
                <Box
                  component="button"
                  type="button"
                  aria-pressed={voted}
                  aria-label={`Vote for ${game.name} (${game.votes} ${game.votes === 1 ? "vote" : "votes"})`}
                  disabled={props.disabled || pendingVote === game.appid}
                  onClick={() => handleVote(game.appid, !voted)}
                  sx={{
                    flex: "none",
                    width: 60,
                    height: 52,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    p: 0,
                    cursor: "pointer",
                    font: "inherit",
                    border: `1px solid ${voted ? colors.cyan : hairline.control}`,
                    backgroundColor: voted ? colors.cyan : "transparent",
                    color: voted ? colors.ink : colors.cyan,
                    transition: "background-color .15s, border-color .15s",
                    "&:hover:not(:disabled)": {
                      backgroundColor: voted ? colors.text : tint("cyan", 0.1),
                    },
                    "&:focus-visible": {
                      outline: `2px solid ${colors.cyan}`,
                      outlineOffset: 2,
                    },
                    "&:disabled": {
                      cursor: "not-allowed",
                      opacity: pendingVote === game.appid ? 0.7 : 0.45,
                    },
                  }}
                >
                  <KeyboardDoubleArrowUpSharp
                    aria-hidden="true"
                    sx={{ fontSize: 22, lineHeight: 1 }}
                  />
                  <Box
                    component="span"
                    aria-hidden="true"
                    sx={{
                      fontFamily: fonts.mono,
                      fontSize: 14,
                      fontWeight: 700,
                      lineHeight: 1.2,
                    }}
                  >
                    {game.votes}
                  </Box>
                </Box>
              </Box>
              {isEditing && (
                <Box
                  component="form"
                  onSubmit={(e: React.FormEvent) => {
                    e.preventDefault();
                    handleEditSave(game.appid);
                  }}
                  sx={{
                    mt: 1.5,
                    display: "flex",
                    flexDirection: "column",
                    gap: 1.25,
                  }}
                >
                  <TextField
                    id={editId}
                    fullWidth
                    multiline
                    minRows={2}
                    label={`Your pitch for ${game.name}`}
                    value={editCommentValue}
                    onChange={(e) => setEditCommentValue(e.target.value)}
                    disabled={props.disabled}
                    autoFocus
                    helperText={`${editCommentValue.length}/${COMMENT_MAX_LENGTH}`}
                    slotProps={{
                      htmlInput: { maxLength: COMMENT_MAX_LENGTH },
                    }}
                  />
                  <Box sx={{ display: "flex", gap: 1.25 }}>
                    <Button
                      type="submit"
                      variant="contained"
                      disabled={props.disabled}
                    >
                      Save
                    </Button>
                    <Button
                      variant="outlined"
                      color="inherit"
                      onClick={handleEditCancel}
                      disabled={props.disabled}
                    >
                      Cancel
                    </Button>
                  </Box>
                </Box>
              )}
            </Box>
          );
        })}
      </Box>
    );
  }

  return (
    <Panel
      title="Game vote"
      actions={
        <Kicker prefix={false} sx={{ letterSpacing: "0.12em" }}>
          Top 3 earn a trophy
        </Kicker>
      }
      padding="none"
      bracket="none"
    >
      {list}
      <Box aria-live="polite" sx={srOnly}>
        {announcement}
      </Box>
      {!!props.responded && (
        <Box
          component="form"
          onSubmit={handleSubmit}
          aria-label="Suggest a game"
          sx={{
            p: "16px 20px",
            display: "flex",
            flexWrap: "wrap",
            gap: 1.25,
            borderTop: `1px solid ${hairline.soft}`,
          }}
        >
          <Autocomplete
            id="game-suggestion"
            sx={{ flex: "1 1 220px", minWidth: 0 }}
            open={open}
            onOpen={() => {
              if (options.length > 0) setOpen(true);
            }}
            onClose={() => {
              setOpen(false);
            }}
            isOptionEqualToValue={(option, value) =>
              option.appid === value.appid
            }
            getOptionLabel={(option) => option.name}
            options={options}
            getOptionDisabled={(option) =>
              gameSuggestions.some((x) => x.appid === option.appid)
            }
            renderOption={(optionProps, option) => {
              const { key, ...rest } = optionProps as typeof optionProps & {
                key: React.Key;
              };
              const already = gameSuggestions.some(
                (x) => x.appid === option.appid,
              );
              return (
                <Box
                  component="li"
                  key={key}
                  {...rest}
                  sx={{ gap: 1.5, minHeight: 44 }}
                >
                  <Box
                    component="img"
                    src={steamCover(option.appid)}
                    alt=""
                    loading="lazy"
                    sx={{
                      width: 60,
                      height: 28,
                      objectFit: "cover",
                      flex: "none",
                      backgroundColor: colors.surface2,
                    }}
                  />
                  <Box component="span" sx={{ flex: 1, minWidth: 0 }}>
                    {option.name}
                  </Box>
                  {already && (
                    <Box
                      component="span"
                      sx={{
                        fontFamily: fonts.mono,
                        fontSize: 10,
                        letterSpacing: "0.12em",
                        color: colors.textMuted,
                      }}
                    >
                      IN THE VOTE
                    </Box>
                  )}
                </Box>
              );
            }}
            handleHomeEndKeys={false}
            loading={loading}
            loadingText="Searching Steam…"
            noOptionsText="No games found"
            value={selectedGame}
            inputValue={inputValue}
            openOnFocus={false}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Suggest a game"
                placeholder="Search Steam…"
                error={errorMessage ? true : false}
                helperText={errorMessage}
                slotProps={{
                  ...params.slotProps,
                  input: {
                    ...params.slotProps.input,
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchSharp
                          aria-hidden="true"
                          sx={{ color: colors.textDim, fontSize: 20 }}
                        />
                      </InputAdornment>
                    ),
                    endAdornment: (
                      <React.Fragment>
                        {loading ? (
                          <CircularProgress
                            color="inherit"
                            size={20}
                            aria-label="Searching"
                          />
                        ) : null}
                        {params.slotProps.input.endAdornment}
                      </React.Fragment>
                    ),
                  },
                }}
              />
            )}
            filterOptions={(x) => x}
            onInputChange={handleInputChange}
            onChange={handleInputSelect}
            disabled={props.disabled}
          />
          <Button
            type="submit"
            variant="outlined"
            disabled={props.disabled || !selectedGame || submitting}
            sx={{ alignSelf: "flex-start", minHeight: 56 }}
          >
            {submitting ? "Suggesting…" : "Suggest"}
          </Button>
          {selectedGame && (
            <Box
              sx={{
                flex: "1 1 100%",
                display: "flex",
                flexDirection: "column",
                gap: 1.25,
              }}
            >
              <TextField
                id="game-comment"
                label="Pitch (optional)"
                placeholder="e.g., Game supports 3 players per squad"
                fullWidth
                multiline
                minRows={2}
                value={commentValue}
                onChange={(e) => setCommentValue(e.target.value)}
                disabled={props.disabled}
                helperText={`Why should the squad play ${selectedGame.name}? ${commentValue.length}/${COMMENT_MAX_LENGTH}`}
                slotProps={{
                  htmlInput: { maxLength: COMMENT_MAX_LENGTH },
                }}
              />
              <Box>
                <Button
                  variant="text"
                  color="inherit"
                  onClick={handleCancel}
                  disabled={props.disabled}
                >
                  Cancel
                </Button>
              </Box>
            </Box>
          )}
          {props.disabled && (
            <Box
              component="p"
              sx={{
                m: 0,
                flex: "1 1 100%",
                fontSize: 13,
                color: colors.textMuted,
              }}
            >
              This event has ended, so voting and suggestions are closed.
            </Box>
          )}
        </Box>
      )}
    </Panel>
  );
}
