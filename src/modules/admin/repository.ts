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
    restricted_until: string | null;
    restriction_reason: string | null;
    deleted_at: string | null;
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
  bookingDisputes?: {
    id: string;
    booking_id: string;
    status: string;
    reason: string | null;
    amount_pence: number;
    reserved_pending_pence: number;
    reserved_available_pence: number;
    reserve_shortfall_pence: number;
    evidence_due_at: string | null;
    updated_at: string;
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

export type AdminFinanceOverview = {
  metrics: {
    platformRevenuePence: number;
    platformRevenue30dPence: number;
    bookingCapturedPence: number;
    bookingRefundedPence: number;
    activePaidSubscriptions: number;
    activeSubscriptionMrrPence: number;
    professionalPendingPence: number;
    professionalAvailablePence: number;
    professionalOutstandingPence: number;
    payoutRequestedPence: number;
    payoutPaidPence: number;
    instantWithdrawalFeesPence: number;
  };
  payoutCounts: {
    requested: number;
    processing: number;
    paid: number;
    failed: number;
    cancelled: number;
  };
  revenueBySource30d: {
    source: string;
    revenuePence: number;
  }[];
  recentPayouts: {
    id: string;
    kind: string;
    requested_pence: number;
    withdrawal_fee_pence: number;
    bank_amount_pence: number;
    status: string;
    expected_arrival_at: string | null;
    created_at: string;
    business_name: string;
  }[];
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
    let bookingDisputes: NonNullable<AdminOverview["bookingDisputes"]> = [];
    try {
      bookingDisputes = (
        await db.query<{
          overview: NonNullable<AdminOverview["bookingDisputes"]>;
        }>("SELECT beauty.admin_booking_dispute_overview() AS overview")
      ).rows[0]?.overview ?? [];
    } catch {
      bookingDisputes = [];
    }

    const users = (
      await db.query<{ users: AdminOverview["users"] }>(
        "SELECT beauty.admin_user_overview() AS users",
      )
    ).rows[0].users;

    return { ...base, ...extra, users, safety, shopOrders, professionalTrust, bookingDisputes };
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


export type OwnerProductFeeRule = {
  id: string;
  percentageBasisPoints: number;
  fixedFeePence: number;
  minimumFeePence: number;
  maximumFeePence: number | null;
  minimumTransactionPence: number;
  processingCostPayer: "platform" | "professional";
  effectiveFrom: string;
};

export async function ownerProductFeeRule(): Promise<OwnerProductFeeRule | null> {
  return withOwner(async (db) => {
    const result = await db.query<{ data: OwnerProductFeeRule | null }>(
      "SELECT beauty.owner_active_product_fee_rule() AS data",
    );
    return result.rows[0]?.data ?? null;
  });
}


export type OwnerBookingFeeRule = {
  id: string | null;
  fixedFeePence: number;
  effectiveFrom: string | null;
  usingDefault: boolean;
};

export async function ownerBookingFeeRule(): Promise<OwnerBookingFeeRule> {
  return withOwner(async (db) => {
    const result = await db.query<{ data: OwnerBookingFeeRule }>(
      "SELECT beauty.owner_active_booking_fee_rule() AS data",
    );
    if (!result.rows[0]?.data) throw new Error("Booking fee control is unavailable.");
    return result.rows[0].data;
  });
}


export async function adminFinanceOverview(): Promise<AdminFinanceOverview> {
  return withAdmin(async (db) => {
    const row = (
      await db.query<{ data: AdminFinanceOverview }>(
        "SELECT beauty.admin_finance_overview() AS data",
      )
    ).rows[0];
    if (!row?.data) throw new Error("Admin finance reporting is unavailable.");
    return row.data;
  });
}


export type PaymentLaunchReadiness = {
  ready: boolean;
  checks: { key: string; label: string; ready: boolean; required: boolean }[];
};

export async function paymentLaunchReadiness(): Promise<PaymentLaunchReadiness> {
  const database = await withAdmin(async (db) => {
    const row = (
      await db.query<{
        reserve_booking: boolean;
        prepare_quote: boolean;
        apply_checkout: boolean;
        record_finance: boolean;
        release_booking: boolean;
        request_payout: boolean;
        record_payout: boolean;
        apply_payout: boolean;
        sync_connect: boolean;
        sync_verification: boolean;
      }>(`
        SELECT
          EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='beauty' AND p.proname='reserve_booking') AS reserve_booking,
          EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='beauty' AND p.proname='prepare_booking_financial_quote') AS prepare_quote,
          EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='beauty' AND p.proname='apply_checkout_payment') AS apply_checkout,
          EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='beauty' AND p.proname='record_booking_payment_finance') AS record_finance,
          EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='beauty' AND p.proname='release_my_mature_booking_proceeds') AS release_booking,
          EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='beauty' AND p.proname='request_my_payout') AS request_payout,
          EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='beauty' AND p.proname='record_payout_provider') AS record_payout,
          EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='beauty' AND p.proname='apply_payout_result') AS apply_payout,
          EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='beauty' AND p.proname='sync_connect_account') AS sync_connect,
          EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='beauty' AND p.proname='sync_connect_verification') AS sync_verification
      `))
      .rows[0];
    return row;
  });

  const checks = [
    { key: "stripe-key", label: "Stripe secret key", ready: Boolean(process.env.STRIPE_SECRET_KEY), required: true },
    { key: "stripe-webhook", label: "Stripe booking/payment webhook secret", ready: Boolean(process.env.STRIPE_WEBHOOK_SECRET), required: true },
    { key: "connect-webhook", label: "Stripe Connect webhook secret", ready: Boolean(process.env.STRIPE_CONNECT_WEBHOOK_SECRET), required: true },
    { key: "payment-db", label: "Protected payment-worker database connection", ready: Boolean(process.env.PAYMENT_DATABASE_URL), required: true },
    { key: "app-url", label: "Canonical GLOHAUS app URL", ready: Boolean(process.env.NEXT_PUBLIC_APP_URL), required: true },
    { key: "reserve-booking", label: "Booking reservation boundary", ready: Boolean(database?.reserve_booking), required: true },
    { key: "booking-quote", label: "Immutable booking financial quote", ready: Boolean(database?.prepare_quote), required: true },
    { key: "checkout-webhook-db", label: "Paid checkout application", ready: Boolean(database?.apply_checkout), required: true },
    { key: "booking-finance", label: "Booking finance ledger recording", ready: Boolean(database?.record_finance), required: true },
    { key: "booking-release", label: "24-hour booking proceeds release", ready: Boolean(database?.release_booking), required: true },
    { key: "connect-sync", label: "Stripe Connect payout readiness sync", ready: Boolean(database?.sync_connect), required: true },
    { key: "verification-sync", label: "Stripe KYC verification sync", ready: Boolean(database?.sync_verification), required: true },
    { key: "payout-request", label: "Professional payout reservation", ready: Boolean(database?.request_payout), required: true },
    { key: "payout-provider", label: "Stripe payout reconciliation", ready: Boolean(database?.record_payout && database?.apply_payout), required: true },
    { key: "instant-fee", label: "Instant payout 4% provider-fee configuration", ready: process.env.STRIPE_INSTANT_PAYOUT_FEE_CONFIGURED === "true", required: false },
  ];

  return {
    ready: checks.filter((check) => check.required).every((check) => check.ready),
    checks,
  };
}


export type EmailLaunchReadiness = {
  ready: boolean;
  checks: { key: string; label: string; ready: boolean; required: boolean }[];
};

export function emailLaunchReadiness(): EmailLaunchReadiness {
  const checks = [
    { key: "resend-key", label: "Resend transactional email API key", ready: Boolean(process.env.RESEND_API_KEY), required: true },
    { key: "email-from", label: "Verified GLOHAUS sender address", ready: Boolean(process.env.EMAIL_FROM), required: true },
    { key: "resend-webhook", label: "Verified Resend delivery webhook secret", ready: Boolean(process.env.RESEND_WEBHOOK_SECRET), required: true },
    { key: "notification-cron", label: "Protected notification scheduler secret", ready: Boolean(process.env.CRON_SECRET), required: true },
    { key: "email-app-url", label: "Canonical HTTPS link origin", ready: Boolean(process.env.NEXT_PUBLIC_APP_URL?.startsWith("https://")), required: true },
    { key: "supabase-smtp", label: "Supabase Auth custom SMTP confirmed", ready: process.env.SUPABASE_CUSTOM_SMTP_CONFIGURED === "true", required: true },
    { key: "leaked-passwords", label: "Supabase leaked-password protection confirmed", ready: process.env.SUPABASE_LEAKED_PASSWORD_PROTECTION_CONFIGURED === "true", required: true },
    { key: "auth-captcha", label: "Supabase Auth CAPTCHA / bot protection confirmed", ready: process.env.SUPABASE_AUTH_CAPTCHA_CONFIGURED === "true", required: false },
  ];

  return {
    ready: checks.filter((check) => check.required).every((check) => check.ready),
    checks,
  };
}


export type OwnerEmailDeliveryOverview = {
  queued: number;
  accepted: number;
  delivered: number;
  bounced: number;
  complained: number;
  failed: number;
  suppressed: number;
  lastProviderEventAt: string | null;
};

export async function ownerEmailDeliveryOverview(): Promise<OwnerEmailDeliveryOverview> {
  return withOwner(async (db) => {
    const row = (
      await db.query<{ data: OwnerEmailDeliveryOverview }>(
        "SELECT beauty.owner_email_delivery_overview() AS data",
      )
    ).rows[0];
    if (!row?.data) throw new Error("Email delivery reporting is unavailable.");
    return row.data;
  });
}



export type OwnerAuthAccount = {
  authId: string;
  email: string;
  createdAt: string;
  emailConfirmedAt: string | null;
  lastSignInAt: string | null;
  appUserId: string | null;
  appStatus: string | null;
  roles: string[];
};

export async function ownerAuthAccountOverview(): Promise<OwnerAuthAccount[]> {
  return withOwner(async (db) => {
    const row = (
      await db.query<{ data: OwnerAuthAccount[] }>(
        "SELECT beauty.owner_auth_account_overview() AS data",
      )
    ).rows[0];
    return row?.data ?? [];
  });
}

export type OwnerProfessionalCommission = {
  professionalId: string;
  businessName: string;
  email: string;
  planKey: string;
  defaultBasisPoints: number;
  effectiveBasisPoints: number;
  overrideBasisPoints: number | null;
  overrideReason: string | null;
  overrideUntil: string | null;
  overrideUpdatedAt: string | null;
};

export async function ownerProfessionalCommissionOverview(): Promise<OwnerProfessionalCommission[]> {
  return withOwner(async (db) => {
    const row = (
      await db.query<{ data: OwnerProfessionalCommission[] }>(
        "SELECT beauty.owner_professional_commission_overview() AS data",
      )
    ).rows[0];
    return row?.data ?? [];
  });
}

export type AdminCategory = {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  sort_order: number;
};

export async function adminCategories(): Promise<AdminCategory[]> {
  return withAdmin(async (db) =>
    (
      await db.query<AdminCategory>(
        "SELECT id,name,slug,active,sort_order FROM beauty.platform_categories ORDER BY sort_order,name",
      )
    ).rows,
  );
}


export type OwnerProfessionalReferral = {
  professionalId: string;
  businessName: string;
  email: string;
  code: string;
  totalReferrals: number;
  qualifiedReferrals: number;
  customerReferrals: number;
  professionalReferrals: number;
  lastReferralAt: string | null;
};

export async function ownerProfessionalReferralOverview(): Promise<OwnerProfessionalReferral[]> {
  return withOwner(async (db) => {
    const row = (
      await db.query<{ data: OwnerProfessionalReferral[] }>(
        "SELECT beauty.owner_professional_referral_overview() AS data",
      )
    ).rows[0];
    return row?.data ?? [];
  });
}


export async function ownerPublicSiteStatus(): Promise<boolean> {
  return withOwner(async (db) => {
    const row = (
      await db.query<{ enabled: boolean }>(
        "SELECT coalesce((SELECT (value->>'enabled')::boolean FROM beauty.platform_settings WHERE key='public_site'),true) AS enabled",
      )
    ).rows[0];
    return row?.enabled !== false;
  });
}
