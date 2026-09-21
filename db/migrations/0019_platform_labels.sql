CREATE TABLE beauty.platform_labels (
 key text PRIMARY KEY CHECK(key IN ('Professional','Professionals','Hair','Nails','Makeup','Lashes & brows','Skin')),
 label text NOT NULL CHECK(length(trim(label)) BETWEEN 2 AND 40)
);
INSERT INTO beauty.platform_labels(key,label) VALUES('Professional','Beauty Professional'),('Professionals','Beauty Professionals'),('Hair','Hair'),('Nails','Nails'),('Makeup','Makeup'),('Lashes & brows','Lashes & brows'),('Skin','Skin');
ALTER TABLE beauty.platform_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.platform_labels FORCE ROW LEVEL SECURITY;
CREATE POLICY labels_public ON beauty.platform_labels FOR SELECT TO beauty_app USING(true);
CREATE POLICY labels_admin_read ON beauty.platform_labels FOR SELECT TO beauty_admin_ops USING(true);
CREATE POLICY labels_admin_write ON beauty.platform_labels FOR UPDATE TO beauty_admin_ops USING(true) WITH CHECK(true);
GRANT SELECT ON beauty.platform_labels TO beauty_app,beauty_admin_ops;
GRANT UPDATE(label) ON beauty.platform_labels TO beauty_admin_ops;
CREATE FUNCTION beauty.admin_set_label(target text,new_label text,decision_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; old_label text;
BEGIN
 actor:=beauty.require_admin();
 IF new_label IS NULL OR length(trim(new_label)) NOT BETWEEN 2 AND 40 OR decision_reason IS NULL OR length(trim(decision_reason)) NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
 SELECT label INTO old_label FROM beauty.platform_labels WHERE key=target FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023'; END IF;
 UPDATE beauty.platform_labels SET label=trim(new_label) WHERE key=target;
 INSERT INTO beauty.admin_audit_logs(actor_reference,target_user_id,action,reason) VALUES(actor::text,actor,'label.'||target,trim(decision_reason)||' ['||old_label||' -> '||trim(new_label)||']');
END $$;
GRANT CREATE ON SCHEMA beauty TO beauty_admin_ops;
ALTER FUNCTION beauty.admin_set_label(text,text,text) OWNER TO beauty_admin_ops;
REVOKE CREATE ON SCHEMA beauty FROM beauty_admin_ops;
REVOKE ALL ON FUNCTION beauty.admin_set_label(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION beauty.admin_set_label(text,text,text) TO beauty_app;
