import * as React from "react";
import {
  Typography,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Avatar,
  AvatarGroup,
  useTheme,
  useMediaQuery,
  Tooltip,
} from "@mui/material";
import Grid from "@mui/material/Grid";
import { red } from "@mui/material/colors";
import SentimentVeryDissatisfiedIcon from "@mui/icons-material/SentimentVeryDissatisfied";
import { Gamer } from "../types/game_suggestions";

interface GameOwnersProps {
  hideIfEmpty?: boolean;
  gamerOwned: Gamer[];
  gamerUnowned?: Gamer[];
  gamerUnknown?: Gamer[];
}

export default function EventGameSuggestions(props: GameOwnersProps) {
  const theme = useTheme();
  const theme_lg = useMediaQuery(theme.breakpoints.up("lg"));
  const theme_sm = useMediaQuery(theme.breakpoints.up("sm"));
  const theme_xs = useMediaQuery(theme.breakpoints.up("xs"));

  const hidden = (props.hideIfEmpty || false) && props.gamerOwned.length === 0;

  const avatars = () => {
    if (theme_lg) return 7;
    if (theme_sm) return 5;
    if (theme_xs) return 1;
  };

  return hidden ? null : (
    <Tooltip
      disableInteractive
      title={
        <React.Fragment>
          <Grid container spacing={2}>
            {props.gamerOwned.length > 0 && (
              <React.Fragment>
                <Grid xs={12}>
                  <Typography component="h1">Owners</Typography>
                </Grid>
                <Grid xs={12}>
                  <List>
                    {props.gamerOwned.map((gamer) => (
                      <ListItem dense={true} key={gamer.handle}>
                        <ListItemAvatar>
                          <Avatar
                            alt={gamer.handle || "Attendee"}
                            src={
                              gamer.avatarUrl ||
                              "https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y"
                            }
                          />
                        </ListItemAvatar>
                        <ListItemText primary={gamer.handle} />
                      </ListItem>
                    ))}
                  </List>
                </Grid>
              </React.Fragment>
            )}
            {props.gamerUnowned && props.gamerUnowned.length > 0 && (
              <React.Fragment>
                <Grid xs={12}>
                  <Typography component="h1">Unowned</Typography>
                </Grid>
                <Grid xs={12}>
                  <List>
                    {props.gamerUnowned.map((gamer) => (
                      <ListItem dense={true} key={gamer.handle}>
                        <ListItemAvatar>
                          <Avatar
                            alt={gamer.handle || "Attendee"}
                            src={
                              gamer.avatarUrl ||
                              "https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y"
                            }
                          />
                        </ListItemAvatar>
                        <ListItemText primary={gamer.handle} />
                      </ListItem>
                    ))}
                  </List>
                </Grid>
              </React.Fragment>
            )}
            {props.gamerUnknown && props.gamerUnknown.length > 0 && (
              <React.Fragment>
                <Grid xs={12}>
                  <Typography component="h1">Unknown</Typography>
                </Grid>
                <Grid xs={12}>
                  <List>
                    {props.gamerUnknown.map((gamer) => (
                      <ListItem dense={true} key={gamer.handle}>
                        <ListItemAvatar>
                          <Avatar
                            alt={gamer.handle || "Attendee"}
                            src={
                              gamer.avatarUrl ||
                              "https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y"
                            }
                          />
                        </ListItemAvatar>
                        <ListItemText primary={gamer.handle} />
                      </ListItem>
                    ))}
                  </List>
                </Grid>
              </React.Fragment>
            )}
          </Grid>
        </React.Fragment>
      }
    >
      <AvatarGroup
        spacing="small"
        max={avatars()}
        sx={{
          "& .MuiAvatar-root": {
            width: 32,
            height: 32,
            fontSize: 15,
          },
        }}
      >
        {(props.gamerOwned.length &&
          props.gamerOwned.map((gamer) => {
            return (
              <Avatar
                alt={gamer.handle || "Attendee"}
                key={gamer.handle || ""}
                src={
                  gamer.avatarUrl ||
                  "https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y"
                }
                sx={{ bgcolor: "#222" }}
              />
            );
          })) || (
          <Avatar alt="No-One" sx={{ bgcolor: red[500] }}>
            <SentimentVeryDissatisfiedIcon />
          </Avatar>
        )}
      </AvatarGroup>
    </Tooltip>
  );
}
