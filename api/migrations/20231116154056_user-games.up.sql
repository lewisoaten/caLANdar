-- Add up migration script here
CREATE TABLE user_games (
    email VARCHAR(255),
    appid BIGINT,
    playtime_forever INTEGER NOT NULL,
    PRIMARY KEY(email, appid)
);
