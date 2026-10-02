-- beauty_app can evaluate the catalog visibility predicate without gaining
-- any direct access to beauty.users or its private columns.
GRANT EXECUTE ON FUNCTION beauty.catalog_user_is_active(uuid) TO beauty_app;
