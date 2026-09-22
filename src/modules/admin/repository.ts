import "server-only";
import { withAccount } from "@/lib/api-account";
import type { SqlClient } from "@/modules/accounts/repository";
import { AccessError } from "@/modules/accounts/domain";
export type AdminOverview = {
  counts: { users: number; active: number; suspended: number };
  professionals: number;
  users: {
    id: string;
    display_name: string;
    email: string;
    status: string;
    roles: string[];
  }[];
  bookings?: {
    id: string;
    service_name: string;
    professional_name: string;
    customer_name: string;
    starts_at: string;
    status: string;
    price_pence: number;
  }[];
  reviews?: {
    id: string;
    rating: number;
    body: string;
    public_name: string;
    moderation_status: string;
  }[];
  posts: {
    id: string;
    title: string;
    body: string;
    moderation_status: string;
    business_name: string;
  }[];
  appeals?: {
    id: string;
    service_name: string;
    customer_name: string;
    professional_name: string;
    reason: string;
    status: string;
    created_at: string;
  }[];
  safety?: {
    counts: {
      open: number;
      underReview: number;
      resolved: number;
      dismissed: number;
    };
    reports: {
      id: string;
      target_type: string;
      target_id: string;
      category: string;
      description: string;
      status: string;
      created_at: string;
      updated_at: string;
      reporter_name: string;
    }[];
  } | null;
};

export type OwnerControls = {
  staff: {
    id: string;
    display_name: string;
    email: string;
    status: string;
    created_at: string;
    roles: string[];
    permissions: string[];
  }[];
  audit: {
    id: string;
    actor_user_id: string | null;
    actor_role: string | null;
    action: string;
    target_type: string | null;
    target_id: string | null;
    reason: string;
    metadata: Record<string, unknown>;
    created_at: string;
  }[];
};
export async function withAdmin<T>(work: (db: SqlClient) => Promise<T>) {
  return withAccount("admin", async (db) => {
    await db.query("SELECT set_config('app.admin_verified','true',true)");
    return work(db);
  });
}

/**
 * Browser roles never reach this boundary. The account comes from PostgreSQL
 * under the verified Supabase identity; each owner database routine calls
 * require_owner() again before reading or changing protected data.
 */
export async function withOwner<T>(work: (db: SqlClient) => Promise<T>) {
  return withAccount("admin", async (db, account) => {
    if (!account.roles.includes("owner")) throw new AccessError("FORBIDDEN", 403);
    await db.query("SELECT set_config('app.admin_verified','true',true)");
    return work(db);
  });
}

export async function adminOverview() {
  return withAdmin(async (db) => {
    const base = (
      await db.query<{ overview: AdminOverview }>(
        "SELECT beauty.admin_overview() AS overview",
      )
    ).rows[0].overview;
    const extra = (
      await db.query<{ overview: Pick<AdminOverview, "bookings" | "reviews"> }>(
        "SELECT beauty.admin_booking_overview() AS overview",
      )
    ).rows[0].overview;
    // Existing deployments can remain usable while the additive report
    // migration is awaiting an operator-run database migration.
    let safety: AdminOverview["safety"] = null;
    try {
      safety = (
        await db.query<{ overview: NonNullable<AdminOverview["safety"]> }>(
          "SELECT beauty.admin_safety_report_overview() AS overview",
        )
      ).rows[0]?.overview ?? null;
    } catch {
      safety = null;
    }
    return { ...base, ...extra, safety };
  });
}

export async function ownerControls() {
  return withOwner(async (db) => {
    const row = (
      await db.query<{ overview: OwnerControls }>(
        "SELECT beauty.owner_staff_overview() AS overview",
      )
    ).rows[0];
    if (!row?.overview) throw new Error("Owner controls are unavailable.");
    return row.overview;
  });
}
