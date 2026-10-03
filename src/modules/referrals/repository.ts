import type { SqlClient } from "@/modules/accounts/repository";

export type ProfessionalReferralSummary = {
  code: string;
  totalReferrals: number;
  customerReferrals: number;
  professionalReferrals: number;
  lastReferralAt: string | null;
};

export async function attributeProfessionalReferral(
  db: SqlClient,
  referralCode: string,
  referredUserId: string,
) {
  const code = referralCode.trim().toUpperCase();
  if (!/^GH[A-Z0-9]{6,12}$/.test(code)) return;

  await db.query(
    `INSERT INTO beauty.professional_referrals(
       referrer_professional_id,referred_user_id,referral_code,qualified_at
     )
     SELECT c.professional_id,$2,c.code,now()
     FROM beauty.professional_referral_codes c
     JOIN beauty.professional_profiles p ON p.id=c.professional_id
     WHERE c.code=$1
       AND p.user_id<>$2
     ON CONFLICT (referred_user_id) DO NOTHING`,
    [code, referredUserId],
  );
}

export async function professionalReferralSummary(
  db: SqlClient,
  professionalId: string,
): Promise<ProfessionalReferralSummary> {
  await db.query(
    `INSERT INTO beauty.professional_referral_codes(professional_id,code)
     VALUES($1,'GH' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)))
     ON CONFLICT (professional_id) DO NOTHING`,
    [professionalId],
  );

  const row = (
    await db.query<ProfessionalReferralSummary>(
      `SELECT
         c.code,
         count(r.id)::int AS "totalReferrals",
         count(r.id) FILTER (WHERE EXISTS(
           SELECT 1 FROM beauty.user_roles ur
           WHERE ur.user_id=r.referred_user_id AND ur.role='customer'
         ))::int AS "customerReferrals",
         count(r.id) FILTER (WHERE EXISTS(
           SELECT 1 FROM beauty.user_roles ur
           WHERE ur.user_id=r.referred_user_id AND ur.role='professional'
         ))::int AS "professionalReferrals",
         max(r.created_at)::text AS "lastReferralAt"
       FROM beauty.professional_referral_codes c
       LEFT JOIN beauty.professional_referrals r
         ON r.referrer_professional_id=c.professional_id
       WHERE c.professional_id=$1
       GROUP BY c.code`,
      [professionalId],
    )
  ).rows[0];

  if (!row) throw new Error("Referral code is unavailable.");
  return row;
}
