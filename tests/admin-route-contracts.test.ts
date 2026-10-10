import { beforeEach, expect, it, vi } from "vitest";
import { POST as manage } from "@/app/api/v1/admin/manage/route";
import { PUT as labels } from "@/app/api/v1/admin/labels/route";
import { POST as categories } from "@/app/api/v1/admin/categories/route";
import { POST as homepage } from "@/app/api/v1/admin/homepage-media/route";
import { POST as site } from "@/app/api/v1/admin/site-status/route";
import { POST as roles } from "@/app/api/v1/admin/owner/route";
import { POST as marketing } from "@/app/api/v1/admin/marketing/route";
import { POST as account } from "@/app/api/v1/admin/owner-account/route";
import { POST as bookingFee } from "@/app/api/v1/admin/booking-fee/route";
import { POST as shopFee } from "@/app/api/v1/admin/shop-fee/route";
import { POST as commission } from "@/app/api/v1/admin/professional-commission/route";
import { POST as appeal } from "@/app/api/v1/admin/refund-appeals/route";
import { AccessError } from "@/modules/accounts/domain";
import { defaultLabels } from "@/modules/platform/domain";
const mocks = vi.hoisted(() => ({ roles: ["owner", "admin"], configured: false, deleteUser: vi.fn(), denial: null as null | "UNAUTHENTICATED" | "MFA_REQUIRED", query: vi.fn(), stripe: vi.fn() }));
vi.mock("@/lib/api-account", () => ({ withAccount: async (_: string, work: (db: object, account: object) => unknown) => {
  if (mocks.denial) throw new AccessError(mocks.denial, mocks.denial === "UNAUTHENTICATED" ? 401 : 403);
  if (!mocks.roles.includes("admin")) throw new AccessError("FORBIDDEN", 403);
  return work({ query: mocks.query }, { roles: mocks.roles });
} }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => mocks.configured ? { auth: { admin: { deleteUser: mocks.deleteUser } } } : null }));
vi.mock("@/modules/payments/stripe", () => ({ stripe: mocks.stripe }));
vi.mock("@/modules/payments/worker", () => ({ withPaymentWorker: vi.fn() }));
const id = "11111111-1111-4111-8111-111111111111";
const reason = "Isolated UI audit";
const cases = [
  { name: "user status", handler: manage, payload: { type: "user", id, status: "active", reason }, sql: "admin_set_user_status", owner: false },
  { name: "post moderation", handler: manage, payload: { type: "post", id, status: "hidden", reason }, sql: "admin_moderate_post", owner: false },
  { name: "review moderation", handler: manage, payload: { type: "review", id, status: "visible", reason }, sql: "admin_moderate_review", owner: false },
  { name: "report review", handler: manage, payload: { type: "report", id, status: "under_review", reason }, sql: "admin_resolve_safety_report", owner: false },
  { name: "verification and LIVE", handler: manage, payload: { type: "professionalTrust", id, verification: "verified", standing: "good", restrictedUntil: null, reason }, sql: "admin_set_professional_trust", owner: false },
  { name: "labels", handler: labels, payload: { labels: defaultLabels, reason }, sql: "admin_set_label", method: "PUT", owner: false },
  { name: "categories", handler: categories, payload: { id: null, name: "Nails", slug: "nails", active: true, sortOrder: 1, reason }, sql: "admin_upsert_category", owner: false },
  { name: "homepage imagery", handler: homepage, payload: { desktopHero: "https://glohaus.test/api/homepage-media?image=example", mobileHero: null, reason }, sql: "owner_set_homepage_media", owner: true },
  { name: "website status", handler: site, payload: { enabled: true, reason }, sql: "owner_set_public_site_enabled", owner: true },
  { name: "admin access", handler: roles, payload: { type: "role", userId: id, role: "admin", enabled: true, reason }, sql: "owner_set_privileged_role", owner: true },
  { name: "marketing preset", handler: marketing, payload: { type: "launch", preset: "discover_weekly" }, sql: "owner_launch_marketing_preset", owner: true },
  { name: "feature vote", handler: marketing, payload: { type: "feature", audience: "all", title: "Improve booking", description: "Make booking clearer for everyone." }, sql: "owner_create_feature_request", owner: true },
  { name: "account restriction", handler: account, payload: { action: "restrict", userId: id, restrictedUntil: "2026-11-10T12:00:00Z", reason }, sql: "owner_set_user_restriction", owner: true },
  { name: "lift restriction", handler: account, payload: { action: "liftRestriction", userId: id, reason }, sql: "owner_set_user_restriction", owner: true },
  { name: "booking fee", handler: bookingFee, payload: { amountPence: 100, reason }, sql: "set_financial_fee_rule", owner: true },
  { name: "Shop fee", handler: shopFee, payload: { percentage: 10, fixedFeePence: 0, minimumFeePence: 0, maximumFeePence: null, reason }, sql: "set_financial_fee_rule", owner: true },
  { name: "professional commission", handler: commission, payload: { professionalId: id, percentage: null, expiresAt: null, reason }, sql: "owner_set_professional_commission_override", owner: true },
  { name: "refund appeal review", handler: appeal, payload: { appealId: id, approved: false, percentage: 0, reason }, sql: "resolve_refund_appeal", owner: false },
];
function request(item: typeof cases[number], payload: unknown = item.payload, origin = "https://glohaus.test") {
  return new Request("https://glohaus.test/api/v1/admin/audit", { method: item.method ?? "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(payload) });
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.roles = ["owner", "admin"]; mocks.denial = null;
  mocks.configured = false;
  mocks.deleteUser.mockResolvedValue({ error: null });
  mocks.query.mockResolvedValue({ rows: [{ id, data: {}, resolution: { amountPence: 0, status: "rejected" } }] });
});
it("never attempts account deletion when its existing server configuration is missing", async () => {
  const item = cases.find(item => item.name === "account restriction")!;
  expect((await account(request(item, { action: "delete", userId: id, reason }))).status).toBe(503);
  expect(mocks.deleteUser).not.toHaveBeenCalled();
});
it.each(["admin", "MFA_REQUIRED"])("protects configured deletion from %s before calling the provider", async mode => {
  mocks.configured = true;
  if (mode === "admin") mocks.roles = ["admin"]; else mocks.denial = "MFA_REQUIRED";
  const item = cases.find(item => item.name === "account restriction")!;
  expect((await account(request(item, { action: "delete", userId: id, reason }))).status).toBe(403);
  expect(mocks.deleteUser).not.toHaveBeenCalled();
});
it("connects the authorised delete action using a fictional provider only", async () => {
  mocks.configured = true;
  mocks.query.mockResolvedValue({ rows: [{ auth_id: "fictional-auth-id" }] });
  const item = cases.find(item => item.name === "account restriction")!;
  expect((await account(request(item, { action: "delete", userId: id, reason }))).status).toBe(200);
  expect(mocks.deleteUser).toHaveBeenCalledWith("fictional-auth-id");
  expect(mocks.query).toHaveBeenLastCalledWith("SELECT beauty.owner_mark_user_deleted($1,$2)", [id, reason]);
});
it.each(cases)("accepts the $name UI payload through its existing protected routine", async item => {
  expect((await item.handler(request(item))).status).toBe(200);
  expect(mocks.query.mock.calls.some(([sql]) => sql.includes(item.sql))).toBe(true);
  expect(mocks.stripe).not.toHaveBeenCalled();
});
it.each(cases)("rejects malformed $name payloads before writes", async item => {
  expect((await item.handler(request(item, {}))).status).toBe(400);
  expect(mocks.query).not.toHaveBeenCalled();
});
it.each(cases)("blocks cross-origin $name changes", async item => {
  expect((await item.handler(request(item, item.payload, "https://untrusted.test"))).status).toBe(403);
  expect(mocks.query).not.toHaveBeenCalled();
});
it.each(cases)("fails closed on expired verification for $name", async item => {
  mocks.denial = "MFA_REQUIRED";
  expect((await item.handler(request(item))).status).toBe(403);
  expect(mocks.query).not.toHaveBeenCalled();
});
it.each(cases.filter(item => item.owner))("keeps $name Owner-only for a verified Admin", async item => {
  mocks.roles = ["admin"];
  expect((await item.handler(request(item))).status).toBe(403);
  // The existing role guard runs before setting the verified DB context.
  expect(mocks.query).not.toHaveBeenCalled();
});
