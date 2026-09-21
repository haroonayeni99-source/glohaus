-- Images must belong to the same professional; hiding an image removes it from the menu.
ALTER TABLE beauty.services ADD COLUMN asset_id uuid;
ALTER TABLE beauty.services ADD CONSTRAINT service_owned_asset FOREIGN KEY(asset_id,professional_id) REFERENCES beauty.portfolio_assets(id,professional_id);
GRANT INSERT(asset_id), UPDATE(asset_id) ON beauty.services TO beauty_app;
CREATE OR REPLACE VIEW beauty.public_services WITH(security_barrier=true) AS
SELECT s.id,s.professional_id,s.name,s.description,s.duration_minutes,s.price_pence,s.deposit_pence,a.id AS asset_id,a.alt_text AS image_alt
FROM beauty.services s LEFT JOIN beauty.public_portfolio a ON a.id=s.asset_id AND a.professional_id=s.professional_id WHERE s.active;
GRANT SELECT ON beauty.public_portfolio TO beauty_catalog;
