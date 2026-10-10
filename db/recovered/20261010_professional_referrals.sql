-- Canonical referral schema recovered read-only from production, 2026-10-10.
-- Schema only: no live rows, referral rewards, or backfills.

CREATE TABLE beauty."professional_referral_codes" (
  "professional_id" uuid NOT NULL,
  "code" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "professional_referral_codes_code_check" CHECK ((code ~ '^GH[A-Z0-9]{6,12}$'::text)),
  CONSTRAINT "professional_referral_codes_code_key" UNIQUE (code),
  CONSTRAINT "professional_referral_codes_pkey" PRIMARY KEY (professional_id),
  CONSTRAINT "professional_referral_codes_professional_id_fkey" FOREIGN KEY (professional_id) REFERENCES beauty.professional_profiles(id) ON DELETE CASCADE
);
ALTER TABLE beauty."professional_referral_codes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty."professional_referral_codes" FORCE ROW LEVEL SECURITY;
REVOKE ALL ON beauty."professional_referral_codes" FROM PUBLIC, anon, authenticated;

CREATE TABLE beauty."professional_referrals" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "referrer_professional_id" uuid NOT NULL,
  "referred_user_id" uuid NOT NULL,
  "referral_code" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "qualified_at" timestamp with time zone,
  CONSTRAINT "no_blank_referral_code" CHECK ((length(TRIM(BOTH FROM referral_code)) >= 8)),
  CONSTRAINT "professional_referrals_pkey" PRIMARY KEY (id),
  CONSTRAINT "professional_referrals_referred_user_id_fkey" FOREIGN KEY (referred_user_id) REFERENCES beauty.users(id) ON DELETE CASCADE,
  CONSTRAINT "professional_referrals_referred_user_id_key" UNIQUE (referred_user_id),
  CONSTRAINT "professional_referrals_referrer_professional_id_fkey" FOREIGN KEY (referrer_professional_id) REFERENCES beauty.professional_profiles(id) ON DELETE CASCADE
);
ALTER TABLE beauty."professional_referrals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty."professional_referrals" FORCE ROW LEVEL SECURITY;
REVOKE ALL ON beauty."professional_referrals" FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION beauty.owner_professional_referral_overview()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  perform beauty.require_owner();
  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'professionalId',p.id,
        'businessName',coalesce(nullif(p.business_name,''),u.display_name),
        'email',u.email,
        'code',c.code,
        'totalReferrals',coalesce(x.total_referrals,0),
        'qualifiedReferrals',coalesce(x.qualified_referrals,0),
        'customerReferrals',coalesce(x.customer_referrals,0),
        'professionalReferrals',coalesce(x.professional_referrals,0),
        'lastReferralAt',x.last_referral_at
      )
      order by coalesce(x.total_referrals,0) desc,
               coalesce(nullif(p.business_name,''),u.display_name)
    )
    from beauty.professional_profiles p
    join beauty.users u on u.id=p.user_id
    join beauty.professional_referral_codes c on c.professional_id=p.id
    left join lateral (
      select
        count(*)::int as total_referrals,
        count(*) filter (where r.qualified_at is not null)::int as qualified_referrals,
        count(*) filter (where exists(
          select 1 from beauty.user_roles ur
          where ur.user_id=r.referred_user_id and ur.role='customer'
        ))::int as customer_referrals,
        count(*) filter (where exists(
          select 1 from beauty.user_roles ur
          where ur.user_id=r.referred_user_id and ur.role='professional'
        ))::int as professional_referrals,
        max(r.created_at) as last_referral_at
      from beauty.professional_referrals r
      where r.referrer_professional_id=p.id
    ) x on true
  ),'[]'::jsonb);
end
$function$;
REVOKE ALL ON FUNCTION beauty.owner_professional_referral_overview() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION beauty.owner_professional_referral_overview() TO beauty_app;

CREATE OR REPLACE FUNCTION beauty.my_professional_referral_overview()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  target_professional uuid;
BEGIN
  SELECT p.id INTO target_professional
  FROM beauty.professional_profiles p
  JOIN beauty.users u ON u.id=p.user_id
  WHERE u.auth_id=beauty.auth_id()
    AND u.status='active'
  LIMIT 1;

  IF target_professional IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'code',c.code,
      'totalReferrals',count(r.id)::int,
      'qualifiedReferrals',count(r.id) FILTER (WHERE r.qualified_at IS NOT NULL)::int,
      'lastReferralAt',max(r.created_at)
    )
    FROM beauty.professional_referral_codes c
    LEFT JOIN beauty.professional_referrals r
      ON r.referrer_professional_id=c.professional_id
    WHERE c.professional_id=target_professional
    GROUP BY c.code
  );
END
$function$;
REVOKE ALL ON FUNCTION beauty.my_professional_referral_overview() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION beauty.my_professional_referral_overview() TO beauty_app;


