-- Add up migration script here
CREATE TABLE invitation (
   event_id serial,
   email VARCHAR (255) NOT NULL,
   handle VARCHAR (255),
   invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   responded_at TIMESTAMPTZ,
   response BOOLEAN,
   attendance BYTEA,
   last_modified TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   PRIMARY KEY(event_id, email),
   CONSTRAINT fk_event
      FOREIGN KEY(event_id)
	    REFERENCES event(id)
        ON DELETE CASCADE
);
