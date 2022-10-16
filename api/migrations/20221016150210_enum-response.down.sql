-- Add down migration script here
ALTER TABLE invitation
ALTER COLUMN response TYPE boolean
USING (
        CASE
            response
            WHEN 'yes'::invitation_response THEN true
            WHEN 'no'::invitation_response THEN false
            ELSE NULL
        END
    );


DROP TYPE invitation_response;
