CREATE TABLE beauty.availability_rules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),professional_id uuid NOT NULL REFERENCES beauty.professional_profiles(id),
 weekday smallint NOT NULL CHECK(weekday BETWEEN 0 AND 6),start_minute smallint NOT NULL CHECK(start_minute BETWEEN 0 AND 1439),
 end_minute smallint NOT NULL CHECK(end_minute BETWEEN 1 AND 1440),
 CHECK(start_minute<end_minute AND start_minute%15=0 AND end_minute%15=0),
 UNIQUE(professional_id,weekday)
);
CREATE TABLE beauty.availability_blocks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),professional_id uuid NOT NULL REFERENCES beauty.professional_profiles(id),
 starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL,CHECK(ends_at>starts_at),
 label text NOT NULL DEFAULT 'Unavailable' CHECK(length(label)<=100)
);
CREATE INDEX blocks_professional_time ON beauty.availability_blocks(professional_id,starts_at,ends_at);
ALTER TABLE beauty.availability_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.availability_rules FORCE ROW LEVEL SECURITY;
ALTER TABLE beauty.availability_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.availability_blocks FORCE ROW LEVEL SECURITY;
CREATE POLICY rules_owner ON beauty.availability_rules FOR ALL TO beauty_app USING(EXISTS(SELECT 1 FROM beauty.professional_profiles p WHERE p.id=professional_id)) WITH CHECK(EXISTS(SELECT 1 FROM beauty.professional_profiles p WHERE p.id=professional_id));
CREATE POLICY blocks_owner ON beauty.availability_blocks FOR ALL TO beauty_app USING(EXISTS(SELECT 1 FROM beauty.professional_profiles p WHERE p.id=professional_id)) WITH CHECK(EXISTS(SELECT 1 FROM beauty.professional_profiles p WHERE p.id=professional_id));
GRANT SELECT,INSERT,UPDATE,DELETE ON beauty.availability_rules,beauty.availability_blocks TO beauty_app;
GRANT SELECT ON beauty.availability_rules TO beauty_catalog;
CREATE POLICY rules_public ON beauty.availability_rules FOR SELECT TO beauty_catalog USING(EXISTS(SELECT 1 FROM beauty.professional_profiles p WHERE p.id=professional_id));
CREATE VIEW beauty.public_hours WITH(security_barrier=true) AS SELECT professional_id,weekday,start_minute,end_minute FROM beauty.availability_rules;
GRANT CREATE ON SCHEMA beauty TO beauty_catalog;
ALTER VIEW beauty.public_hours OWNER TO beauty_catalog;
REVOKE CREATE ON SCHEMA beauty FROM beauty_catalog;
GRANT SELECT ON beauty.public_hours TO beauty_app;
