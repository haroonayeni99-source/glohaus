-- Restore application write access for the service category column
-- added after the original column-level grants were created.

GRANT INSERT(category), UPDATE(category) ON beauty.services TO beauty_app;
