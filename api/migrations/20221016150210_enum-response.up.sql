-- Add up migration script here
CREATE TYPE invitation_response AS ENUM ('yes', 'no', 'maybe');

-- Change invitation.response column to invitation_response type
ALTER TABLE invitation
ALTER COLUMN response TYPE invitation_response
USING (
        CASE
            response
            WHEN true THEN 'yes'::invitation_response
            WHEN false THEN 'no'::invitation_response
            ELSE NULL
        END
    );
