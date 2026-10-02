CREATE OR REPLACE FUNCTION beauty.admin_resolve_safety_report(
  target uuid,
  next_status text,
  decision_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  actor uuid;
  report_row beauty.safety_reports;
BEGIN
  actor:=beauty.require_admin();

  IF next_status NOT IN ('under_review','resolved','dismissed')
     OR length(trim(decision_reason)) NOT BETWEEN 5 AND 500 THEN
    RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023';
  END IF;

  SELECT *
  INTO report_row
  FROM beauty.safety_reports
  WHERE id=target
  FOR UPDATE;

  IF report_row.id IS NULL
     OR report_row.status IN ('resolved','dismissed') THEN
    RAISE EXCEPTION 'INVALID_REQUEST' USING ERRCODE='22023';
  END IF;

  UPDATE beauty.safety_reports
  SET
    status=next_status,
    assigned_to_user_id=actor,
    resolution_reason=trim(decision_reason),
    resolved_at=CASE WHEN next_status IN ('resolved','dismissed') THEN now() ELSE NULL END,
    updated_at=now()
  WHERE id=target;

  IF next_status='resolved' THEN
    IF report_row.target_type='post' THEN
      UPDATE beauty.posts
      SET moderation_status='hidden'
      WHERE id=report_row.target_id;
    ELSIF report_row.target_type='media' THEN
      UPDATE beauty.portfolio_assets
      SET publication_status='hidden'
      WHERE id=report_row.target_id;

      UPDATE beauty.posts
      SET moderation_status='hidden'
      WHERE asset_id=report_row.target_id;

      UPDATE beauty.professional_stories
      SET publication_status='hidden'
      WHERE asset_id=report_row.target_id
        AND publication_status='published';

      UPDATE beauty.services
      SET asset_id=NULL
      WHERE asset_id=report_row.target_id;
    ELSIF report_row.target_type='review' THEN
      UPDATE beauty.reviews
      SET moderation_status='hidden'
      WHERE id=report_row.target_id;
    END IF;
  END IF;

  PERFORM beauty.write_admin_audit(
    actor,
    'admin',
    'safety_report.'||next_status,
    report_row.reporter_user_id,
    'safety_report',
    target,
    decision_reason,
    jsonb_build_object(
      'targetType',report_row.target_type,
      'targetId',report_row.target_id,
      'contentHidden',next_status='resolved'
        AND report_row.target_type IN ('post','media','review')
    )
  );
END
$$;
