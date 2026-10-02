-- Restore the least-privilege base table reads required by the
-- beauty_catalog-owned public views and their RLS predicates.
GRANT SELECT ON beauty.professional_profiles TO beauty_catalog;
GRANT SELECT ON beauty.users TO beauty_catalog;
GRANT SELECT ON beauty.bookings TO beauty_catalog;
