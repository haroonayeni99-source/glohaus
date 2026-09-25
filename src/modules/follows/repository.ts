import "server-only";
import type { SqlClient } from "@/modules/accounts/repository";
import { AccessError } from "@/modules/accounts/domain";

export type FollowState = {
  following: boolean;
  followerCount: number;
};

export async function followState(
  db: SqlClient,
  customerId: string | null,
  professionalId: string,
): Promise<FollowState> {
  const count = (
    await db.query<{ follower_count: number }>(
      "SELECT beauty.professional_follower_count($1) AS follower_count",
      [professionalId],
    )
  ).rows[0]?.follower_count ?? 0;

  if (!customerId) return { following: false, followerCount: count };

  const following = (
    await db.query(
      "SELECT 1 FROM beauty.professional_follows WHERE customer_id=$1 AND professional_id=$2",
      [customerId, professionalId],
    )
  ).rows.length > 0;

  return { following, followerCount: count };
}

export async function setFollowing(
  db: SqlClient,
  customerId: string,
  professionalId: string,
  following: boolean,
): Promise<FollowState> {
  if (following) {
    const target = (
      await db.query(
        "SELECT id FROM beauty.public_professionals WHERE id=$1",
        [professionalId],
      )
    ).rows[0];
    if (!target) throw new AccessError("FORBIDDEN", 403);

    await db.query(
      "INSERT INTO beauty.professional_follows(customer_id,professional_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
      [customerId, professionalId],
    );
  } else {
    await db.query(
      "DELETE FROM beauty.professional_follows WHERE customer_id=$1 AND professional_id=$2",
      [customerId, professionalId],
    );
  }
  return followState(db, customerId, professionalId);
}

export async function professionalFollowerCount(
  db: SqlClient,
  professionalId: string,
): Promise<number> {
  return (
    await db.query<{ count: number }>(
      "SELECT beauty.professional_follower_count($1) AS count",
      [professionalId],
    )
  ).rows[0]?.count ?? 0;
}

export type FollowedProfessional = {
  id: string;
  slug: string;
  business_name: string;
  bio: string;
  city: string;
  category: string;
  followed_at: string;
};

export async function followedProfessionals(
  db: SqlClient,
  customerId: string,
): Promise<FollowedProfessional[]> {
  return (
    await db.query<FollowedProfessional>(
      `SELECT p.id,p.slug,p.business_name,p.bio,p.city,p.category,
        f.created_at::text AS followed_at
       FROM beauty.professional_follows f
       JOIN beauty.public_professionals p ON p.id=f.professional_id
       WHERE f.customer_id=$1
       ORDER BY f.created_at DESC,p.business_name,p.id`,
      [customerId],
    )
  ).rows;
}
