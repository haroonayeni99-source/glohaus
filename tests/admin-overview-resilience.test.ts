import { beforeEach, expect, it, vi } from "vitest";
import { adminOverview } from "@/modules/admin/repository";
const state = vi.hoisted(() => ({ failure: "", transactions: [] as string[][] }));
vi.mock("@/lib/api-account", () => ({ withAccount: async (_: string, work: (db: object) => Promise<unknown>) => {
  const calls: string[] = []; state.transactions.push(calls);
  let aborted = false;
  return work({ query: async (sql: string) => {
    calls.push(sql);
    if (aborted) throw new Error("transaction aborted");
    if (state.failure && sql.includes(state.failure)) { aborted = true; throw new Error("unavailable optional section"); }
    if (sql.includes("admin_overview()")) return { rows: [{ overview: { counts: { users: 1 }, professionals: 0, posts: [] } }] };
    if (sql.includes("admin_user_overview")) return { rows: [{ users: [{ id: "user" }] }] };
    if (sql.includes("admin_booking_overview")) return { rows: [{ overview: { bookings: [], reviews: [] } }] };
    if (sql.includes("professional_profiles")) return { rows: [] };
    return { rows: [{ overview: [] }] };
  } });
} }));
beforeEach(() => { state.failure = ""; state.transactions = []; });
it.each([
  ["admin_safety_report_overview", "safety"], ["admin_shop_order_overview", "shopOrders"],
  ["professional_profiles", "professionalTrust"], ["admin_booking_dispute_overview", "bookingDisputes"],
])("isolates %s failure without losing required accounts or other sections", async (failure, key) => {
  state.failure = failure;
  const result = await adminOverview();
  expect(result.users).toEqual([{ id: "user" }]);
  expect(result.unavailableSections).toEqual([key]);
  expect(state.transactions).toHaveLength(5);
  expect(state.transactions.every(calls => calls[0].includes("admin_verified"))).toBe(true);
});
it("does not present missing mandatory account data as an empty dashboard", async () => {
  state.failure = "admin_user_overview";
  await expect(adminOverview()).rejects.toThrow("unavailable optional section");
});
