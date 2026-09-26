import "server-only";
import { withAccount } from "@/lib/api-account";
import type { SqlClient } from "@/modules/accounts/repository";
import { AccessError } from "@/modules/accounts/domain";
export type AdminOverview = {
  counts: { users: number; active: number; suspended: number };
  professionals: number;
  professionalTrust?: { id:string; user_id:string; business_name:string; verification_status:string; standing_status:string; live_restricted_until:string|null }[];
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
  payments?: {
    counts: {
      capturedPence: number;
      refundedPence: number;
      refundRequired: number;
      pendingPayouts: number;
      paidPayoutsPence: number;
    };
    bookingPayments: {
      booking_id: string;
      service_name: string;
      professional_name: string;
      customer_name: string;
      captured_pence: number;
      refunded_pence: number;
      status: string;
      updated_at: string;
      refund_status: string | null;
      refund_amount_pence: number | null;
    }[];
    payouts: {
      id: string;
      professional_name: string;
      kind: string;
      requested_pence: number;
      withdrawal_fee_pence: number;
      bank_amount_pence: number;
      expected_arrival_at: string | null;
      status: string;
      created_at: string;
    }[];
  } | null;
  shopOrders?: {
    counts: {
      total: number;
      paid: number;
      processing: number;
      shipped: number;
      delivered: number;
      refundPending: number;
      refunded: number;
    };
    orders: {
      id: string;
      status: string;
      professional_name: string;
      recipient_name: string;
      city: string;
      postcode: string;
      country_code: string;
      subtotal_pence: number;
      delivery_pence: number;
      total_pence: number;
      tracking_carrier: string | null;
      tracking_number: string | null;
      created_at: string;
      items: {
        name: string;
        quantity: number;
        lineTotalPence: number;
      }[];
    }[];
  } | null;
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
    let payments: AdminOverview["payments"] = null;
    try {
      payments = (
        await db.query<{ overview: NonNullable<AdminOverview["payments"]> }>(
          "SELECT beauty.admin_payment_overview() AS overview",
        )
      ).rows[0]?.overview ?? null;
    } catch {
      payments = null;
    }

    let shopOrders: AdminOverview["shopOrders"] = null;
    try {
      shopOrders = (
        await db.query<{ overview: NonNullable<AdminOverview["shopOrders"]> }>(
          "SELECT beauty.admin_shop_order_overview() AS overview",
        )
      ).rows[0]?.overview ?? null;
    } catch {
      shopOrders = null;
    }

    let professionalTrust: NonNullable<AdminOverview["professionalTrust"]> = [];
    try {
      professionalTrust = (await db.query<NonNullable<AdminOverview["professionalTrust"]>[number]>(
        "SELECT p.id,p.user_id,p.business_name,coalesce(t.verification_status,'unverified') verification_status,coalesce(t.standing_status,'good') standing_status,t.live_restricted_until::text FROM beauty.professional_profiles p LEFT JOIN beauty.professional_trust_status t ON t.professional_id=p.id ORDER BY p.business_name,p.id LIMIT 100"
      )).rows;
    } catch { professionalTrust = []; }
    return {
      ...base,
      ...extra,
      safety,
      payments,
      shopOrders,
      professionalTrust,
    };
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
