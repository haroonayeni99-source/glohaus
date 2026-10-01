-- Keep marketplace category reference data readable by the application role
-- while protecting the table with Row Level Security.
ALTER TABLE beauty.platform_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_categories_app_read
ON beauty.platform_categories;

CREATE POLICY platform_categories_app_read
ON beauty.platform_categories
FOR SELECT
TO beauty_app
USING (true);
