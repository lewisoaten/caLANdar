import * as React from "react";
import { useContext } from "react";
import { UserDispatchContext, UserContext } from "../UserProvider";

import { defaultEventGamesMap, EventGame } from "../types/game_suggestions";

import { useState } from "react";
import { useLocation } from "react-router-dom";
import GamesList from "./GamesList";

const EventGames = () => {
  const { signOut } = useContext(UserDispatchContext);
  const userDetails = useContext(UserContext);
  const token = userDetails?.token;

  const [eventGames, setEventGames] = useState(defaultEventGamesMap);
  const [eventGamesCount, setEventGamesCount] = useState(0);

  const location = useLocation();

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
          const eventGames = new Map<number, EventGame[]>();

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

  return (
    <GamesList
      loadNewPage={loadNewPage}
      games={eventGames}
      gamesCount={eventGamesCount}
    />
  );
};

export default EventGames;
