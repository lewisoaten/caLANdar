-- Add up migration script here
CREATE TYPE vote AS ENUM ('yes', 'novote', 'no');

CREATE TABLE event_game_vote (
   event_id serial NOT NULL,
   game_id bigint NOT NULL,
   email VARCHAR (255) NOT NULL,
   vote vote NOT NULL,
   vote_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   last_modified TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   PRIMARY KEY(event_id, game_id, email),
   CONSTRAINT fk_event
      FOREIGN KEY(event_id)
	    REFERENCES event(id)
        ON DELETE CASCADE,
   CONSTRAINT fk_steam_game
      FOREIGN KEY(game_id)
	    REFERENCES steam_game(appid)
        ON DELETE CASCADE
);
