-- Add down migration script here
DROP INDEX IF EXISTS invitation_lower_email;
DROP INDEX IF EXISTS event_game_vote_lower_email;
DROP INDEX IF EXISTS profiles_lower_email;
DROP INDEX IF EXISTS user_game_lower_email;
