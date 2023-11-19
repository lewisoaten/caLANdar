-- Add up migration script here
CREATE TABLE profiles (
    email VARCHAR (255) PRIMARY KEY,
    steam_id BIGINT NOT NULL,
    last_refreshed TIMESTAMPTZ
);
