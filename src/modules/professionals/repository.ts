import { serviceSchema } from "./domain";
import "server-only";
import type { NearbySearch } from "./location";
import {
  discoveryCursor,
  defaultDiscoveryFilters,
  type DiscoveryCursor,
  type DiscoveryFilters,
} from "./discovery";
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
    `UPDATE beauty.professional_profiles SET slug=$2,business_name=$3,bio=$4,city=$5,category=$6,publication_status=$7,business_description=$8,location_details=$9,travels_to_you=$10,contact_preference=$11,contact_email=$12,contact_phone=$13,instagram_url=$14,tiktok_url=$15,website_url=$16 WHERE id=$1 RETURNING id`,
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
      input.travelsToYou ?? false,
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
        "SELECT id FROM beauty.portfolio_assets WHERE id=$1 AND professional_id=$2 AND media_type='image'",
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
    input.category ?? null,
  ];
  const result = id
    ? await db.query(
        `UPDATE beauty.services SET name=$2,description=$3,duration_minutes=$4,price_pence=$5,deposit_pence=$6,active=$7,asset_id=$8,category=COALESCE($9,category) WHERE professional_id=$1 AND id=$10 RETURNING id`,
        [...values, id],
      )
    : await db.query(
        `INSERT INTO beauty.services (professional_id,name,description,duration_minutes,price_pence,deposit_pence,active,asset_id,category) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9,(SELECT category FROM beauty.professional_profiles WHERE id=$1))) RETURNING id`,
        values,
      );
  if (!result.rows.length) throw new AccessError("FORBIDDEN", 403);
  return result.rows[0];
}
export async function publicProfessionals(
  db: SqlClient,
  search = "",
  after?: DiscoveryCursor,
  filters: DiscoveryFilters = defaultDiscoveryFilters,
  near?: NearbySearch,
) {
  const escaped = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
  return (
    await db.query<PublicProfessional>(
      `SELECT
         p.id,p.slug,p.business_name,p.bio,p.city,p.category,p.verification_status,
         d.photo_id,d.photo_alt,d.travels_to_you,
         r.rating,r.review_count,
         s.from_price_pence,
         beauty.public_professional_available_today(p.id) AS available_today,
         s.popular_services,
         loc.latitude AS public_latitude, loc.longitude AS public_longitude,
         loc.confirmed_at AS public_location_confirmed_at,
         geo.distance_miles
       FROM beauty.public_professionals p
       LEFT JOIN beauty.public_profile_details d ON d.id=p.id
       LEFT JOIN beauty.public_professional_locations loc ON loc.professional_id=p.id
       CROSS JOIN LATERAL (
         SELECT CASE WHEN $13::float IS NOT NULL AND loc.latitude IS NOT NULL THEN
           3958.7613 * acos(least(1::float,greatest(-1::float,
             sin(radians($13::float))*sin(radians(loc.latitude)) +
             cos(radians($13::float))*cos(radians(loc.latitude))*cos(radians(loc.longitude-$14::float))
           ))) ELSE NULL END AS distance_miles
       ) geo
       LEFT JOIN LATERAL (
         SELECT round(avg(rating),1)::float AS rating,
                count(*)::integer AS review_count
         FROM beauty.public_reviews
         WHERE professional_id=p.id
       ) r ON true
       LEFT JOIN LATERAL (
         SELECT
           min(price_pence) AS from_price_pence,
           ARRAY(
             SELECT svc.name
             FROM beauty.public_services svc
             WHERE svc.professional_id=p.id
             ORDER BY svc.price_pence,svc.id
             LIMIT 2
           ) AS popular_services
         FROM beauty.public_services
         WHERE professional_id=p.id
       ) s ON true
       WHERE (
         p.business_name ILIKE $1
         OR p.city ILIKE $1
         OR p.category ILIKE $1
         OR EXISTS(
           SELECT 1
           FROM beauty.platform_labels labels
           WHERE labels.key=p.category AND labels.label ILIKE $1
         )
         OR EXISTS(
           SELECT 1
           FROM beauty.public_services svc
           WHERE svc.professional_id=p.id
             AND (svc.name ILIKE $1 OR svc.category ILIKE $1)
         )
         OR d.location_details ILIKE $1
       )
       AND (NOT $2::boolean OR p.verification_status='verified')
       AND (NOT $3::boolean OR s.from_price_pence <= 5000)
       AND (NOT $4::boolean OR coalesce(d.travels_to_you,false))
       AND (
         NOT $5::boolean
         OR (coalesce(r.rating,0) >= 4.5 AND coalesce(r.review_count,0) >= 3)
       )
       AND (
         NOT $6::boolean
         OR beauty.public_professional_available_today(p.id)
       )
       AND ($9::text = '' OR p.city ILIKE $9 OR d.location_details ILIKE $9)
       AND ($10::text = '' OR p.category ILIKE $10 OR EXISTS(SELECT 1 FROM beauty.public_services svc WHERE svc.professional_id=p.id AND (svc.category ILIKE $10 OR svc.name ILIKE $10)))
       AND ($11::integer IS NULL OR s.from_price_pence <= $11)
       AND ($12::float IS NULL OR coalesce(r.rating,0) >= $12)
       AND ($13::float IS NULL OR geo.distance_miles <= $15::float)
       AND (
         $7::text IS NULL
         OR (p.business_name,p.id)>($7::text,$8::uuid)
       )
       ORDER BY geo.distance_miles NULLS LAST,p.business_name,p.id
       LIMIT $16`,
      [
        escaped,
        filters.verified,
        filters.under50,
        filters.travels,
        filters.topRated,
        filters.availableToday,
        after?.name ?? null,
        after?.id ?? null,
        filters.location
          ? `%${filters.location.replace(/[\\%_]/g, "\\$&")}%`
          : "",
        filters.category
          ? `%${filters.category.replace(/[\\%_]/g, "\\$&")}%`
          : "",
        filters.maxPricePence ?? null,
        filters.minRating ?? null,
        near?.latitude ?? null,
        near?.longitude ?? null,
        near?.radiusMiles ?? null,
        near ? 101 : 25,
      ],
    )
  ).rows;
}

export async function publicProfile(db: SqlClient, slug: string) {
  const professional = (
    await db.query<PublicProfessional>(
      `SELECT p.id,p.slug,p.business_name,p.bio,p.city,p.category,p.verification_status,
         loc.latitude AS public_latitude,loc.longitude AS public_longitude,loc.confirmed_at AS public_location_confirmed_at
       FROM beauty.public_professionals p LEFT JOIN beauty.public_professional_locations loc ON loc.professional_id=p.id WHERE p.slug=$1`,
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
  filters: DiscoveryFilters = defaultDiscoveryFilters,
) {
  const rows = await publicProfessionals(db, query, after, filters);
  const professionals = rows.slice(0, 24);
  return {
    professionals,
    next:
      rows.length > 24
        ? discoveryCursor(
            professionals[professionals.length - 1],
            query,
            filters,
          )
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
