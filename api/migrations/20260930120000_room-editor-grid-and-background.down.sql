DROP TABLE IF EXISTS room_background;

ALTER TABLE seat
    DROP COLUMN IF EXISTS grid_row,
    DROP COLUMN IF EXISTS grid_col;

ALTER TABLE room
    DROP COLUMN IF EXISTS background_opacity,
    DROP COLUMN IF EXISTS background_style,
    DROP COLUMN IF EXISTS features,
    DROP COLUMN IF EXISTS grid_rows;
