-- Add up migration script here
CREATE UNIQUE INDEX invitation_lower_email ON invitation (event_id, LOWER(email));
CREATE UNIQUE INDEX event_game_vote_lower_email ON event_game_vote (event_id, game_id, LOWER(email));
CREATE UNIQUE INDEX event_game_lower_email ON event_game (LOWER(user_email));
CREATE UNIQUE INDEX profiles_lower_email ON profiles (LOWER(email));
CREATE UNIQUE INDEX user_game_lower_email ON user_game (LOWER(email), appid);
