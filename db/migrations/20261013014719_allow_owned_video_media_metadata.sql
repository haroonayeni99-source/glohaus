-- Let the existing authenticated upload callback register video metadata.
-- Ownership RLS, publication controls and all other column grants stay intact.
GRANT INSERT (media_type,mime_type) ON beauty.portfolio_assets TO beauty_app;
