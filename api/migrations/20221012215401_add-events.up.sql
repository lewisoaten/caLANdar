-- Add up migration script here
CREATE TABLE event (
   id serial PRIMARY KEY,
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   last_modified TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   title VARCHAR (255) NOT NULL,
   description TEXT NOT NULL,
   time_begin TIMESTAMPTZ NOT NULL,
   time_end TIMESTAMPTZ NOT NULL
);
