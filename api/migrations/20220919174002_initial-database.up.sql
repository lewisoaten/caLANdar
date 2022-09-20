-- Add up migration script here
CREATE TABLE test(
   id serial PRIMARY KEY,
   name VARCHAR (255) UNIQUE NOT NULL
);

-- Add record to test table
INSERT INTO test (name) VALUES ('test');
