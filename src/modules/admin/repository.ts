import "server-only";
import { withAccount } from "@/lib/api-account";
import type { SqlClient } from "@/modules/accounts/repository";
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
};
export async function withAdmin<T>(work: (db: SqlClient) => Promise<T>) {
  return withAccount("admin", async (db) => {
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
    return { ...base, ...extra };
  });
}
