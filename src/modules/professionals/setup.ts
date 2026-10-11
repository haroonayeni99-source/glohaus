import type { SqlClient } from "@/modules/accounts/repository";
export type SetupProgress = {
  profile: boolean;
  services: boolean;
  availability: boolean;
  portfolio: boolean;
  published: boolean;
};
export const setupSteps = [
  ["Complete your profile", "/professional/profile", "profile"],
  ["Add services and prices", "/professional/services", "services"],
  ["Set your working hours", "/professional/availability", "availability"],
  ["Share your portfolio", "/professional/portfolio", "portfolio"],
  ["Publish your page", "/professional/profile", "published"],
] as const;
export async function professionalSetupProgress(
  db: SqlClient,
  id: string,
): Promise<SetupProgress | null> {
  return (
    (
      await db.query<SetupProgress>(
        `SELECT
    (slug IS NOT NULL AND length(business_name)>=2 AND length(bio)>=20 AND length(city)>=2) AS profile,
    EXISTS(SELECT 1 FROM beauty.services WHERE professional_id=p.id AND active) AS services,
    EXISTS(SELECT 1 FROM beauty.availability_rules WHERE professional_id=p.id) AS availability,
    EXISTS(SELECT 1 FROM beauty.portfolio_assets WHERE professional_id=p.id AND publication_status='published') AS portfolio,
    publication_status='published' AS published
    FROM beauty.professional_profiles p WHERE id=$1`,
        [id],
      )
    ).rows[0] ?? null
  );
}
