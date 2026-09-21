import { serviceSchema } from "./domain";
import "server-only";
import { discoveryCursor, type DiscoveryCursor } from "./discovery";
import type { SqlClient } from "@/modules/accounts/repository";
import type {
  ProfileInput,
  ServiceInput,
  PublicProfessional,
  ProfileDetails,
  Service,
} from "./domain";
import { AccessError } from "@/modules/accounts/domain";

export async function updateProfile(
  db: SqlClient,
  id: string,
  input: ProfileInput,
) {
  const result = await db.query(
    `UPDATE beauty.professional_profiles SET slug=$2,business_name=$3,bio=$4,city=$5,category=$6,publication_status=$7,business_description=$8,location_details=$9,contact_preference=$10,contact_email=$11,contact_phone=$12,instagram_url=$13,tiktok_url=$14,website_url=$15 WHERE id=$1 RETURNING id`,
    [
      id,
      input.slug,
      input.businessName,
      input.bio,
      input.city,
      input.category,
      input.publicationStatus,
      input.businessDescription ?? "",
      input.locationDetails ?? "",
      input.contactPreference ?? "booking",
      input.contactEmail ?? "",
      input.contactPhone ?? "",
      input.instagramUrl ?? "",
      input.tiktokUrl ?? "",
      input.websiteUrl ?? "",
    ],
  );
  if (!result.rows.length) throw new AccessError("FORBIDDEN", 403);
}
export async function saveService(
  db: SqlClient,
  professionalId: string,
  input: ServiceInput,
  id?: string,
) {
  input = serviceSchema.parse(input);
  if (
    input.assetId &&
    !(
      await db.query(
        "SELECT id FROM beauty.portfolio_assets WHERE id=$1 AND professional_id=$2",
        [input.assetId, professionalId],
      )
    ).rows.length
  )
    throw new AccessError("FORBIDDEN", 403);
  const values = [
    professionalId,
    input.name,
    input.description,
    input.durationMinutes,
    input.pricePence,
    input.depositPence,
    input.active,
    input.assetId ?? null,
  ];
  const result = id
    ? await db.query(
        `UPDATE beauty.services SET name=$2,description=$3,duration_minutes=$4,price_pence=$5,deposit_pence=$6,active=$7,asset_id=$8 WHERE professional_id=$1 AND id=$9 RETURNING id`,
        [...values, id],
      )
    : await db.query(
        `INSERT INTO beauty.services (professional_id,name,description,duration_minutes,price_pence,deposit_pence,active,asset_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        values,
      );
  if (!result.rows.length) throw new AccessError("FORBIDDEN", 403);
  return result.rows[0];
}
export async function publicProfessionals(
  db: SqlClient,
  search = "",
  after?: DiscoveryCursor,
) {
  return (
    await db.query<PublicProfessional>(
      `SELECT p.*,d.photo_id,d.photo_alt,r.rating,r.review_count,s.from_price_pence
 FROM (SELECT p.id,p.slug,p.business_name,p.bio,p.city,p.category FROM beauty.public_professionals p
 WHERE (p.business_name ILIKE $1 OR p.city ILIKE $1 OR p.category ILIKE $1 OR EXISTS(SELECT 1 FROM beauty.platform_labels labels WHERE labels.key=p.category AND labels.label ILIKE $1) OR EXISTS(SELECT 1 FROM beauty.public_services svc WHERE svc.professional_id=p.id AND svc.name ILIKE $1))
 ${after ? "AND (p.business_name,p.id)>($2::text,$3::uuid)" : ""}
 ORDER BY p.business_name,p.id LIMIT 25) p
 LEFT JOIN beauty.public_profile_details d ON d.id=p.id
 LEFT JOIN LATERAL (SELECT round(avg(rating),1)::float AS rating,count(*)::integer AS review_count FROM beauty.public_reviews WHERE professional_id=p.id) r ON true
 LEFT JOIN LATERAL (SELECT min(price_pence) AS from_price_pence FROM beauty.public_services WHERE professional_id=p.id) s ON true
 ORDER BY p.business_name,p.id`,
      [
        `%${search.replace(/[\\%_]/g, "\\$&")}%`,
        ...(after ? [after.name, after.id] : []),
      ],
    )
  ).rows;
}
export async function publicProfile(db: SqlClient, slug: string) {
  const professional = (
    await db.query<PublicProfessional>(
      "SELECT id,slug,business_name,bio,city,category FROM beauty.public_professionals WHERE slug=$1",
      [slug],
    )
  ).rows[0];
  if (!professional) return null;
  const services = (
    await db.query<Service>(
      "SELECT * FROM beauty.public_services WHERE professional_id=$1 ORDER BY price_pence,id",
      [professional.id],
    )
  ).rows;
  const details = (
    await db.query<ProfileDetails>(
      "SELECT * FROM beauty.public_profile_details WHERE id=$1",
      [professional.id],
    )
  ).rows[0];
  return { professional, services, details };
}

export async function discoveryPage(
  db: SqlClient,
  query: string,
  after?: DiscoveryCursor,
) {
  const rows = await publicProfessionals(db, query, after);
  const professionals = rows.slice(0, 24);
  return {
    professionals,
    next:
      rows.length > 24
        ? discoveryCursor(professionals[professionals.length - 1], query)
        : null,
  };
}

export async function deactivateService(
  db: SqlClient,
  professionalId: string,
  id: string,
) {
  const result = await db.query(
    "UPDATE beauty.services SET active=false WHERE professional_id=$1 AND id=$2 RETURNING id",
    [professionalId, id],
  );
  if (!result.rows.length) throw new AccessError("FORBIDDEN", 403);
  return result.rows[0];
}
