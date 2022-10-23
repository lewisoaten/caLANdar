-- Add up migration script here
CREATE TABLE steam_game_update (
    id serial PRIMARY KEY,
    update_time TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE steam_game (
    appid bigint PRIMARY KEY,
    update_id integer NOT NULL,
    name TEXT NOT NULL,
    last_modified TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_steam_game_update
        FOREIGN KEY(update_id)
        REFERENCES steam_game_update(id)
        ON DELETE CASCADE
);

CREATE TABLE event_game (
   event_id serial NOT NULL,
   game_id bigint NOT NULL,
   requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   last_modified TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   PRIMARY KEY(event_id, game_id),
   CONSTRAINT fk_event
      FOREIGN KEY(event_id)
	    REFERENCES event(id)
        ON DELETE CASCADE,
   CONSTRAINT fk_steam_game
      FOREIGN KEY(game_id)
	    REFERENCES steam_game(appid)
        ON DELETE CASCADE
);
