import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDatabase, applyTestMigrations } from "./test-database";
import { enrolAccount, type SqlClient } from "@/modules/accounts/repository";
import { updateProfile } from "@/modules/professionals/repository";
import { publicProducts, saveProduct } from "@/modules/shop/repository";
import { productInputSchema } from "@/modules/shop/domain";
import {
  createSupportRequest,
  supportInbox,
  setSupportStatus,
} from "@/modules/support/repository";
import {
  supportInputSchema,
  type SupportInput,
} from "@/modules/support/domain";

const apiMocks = vi.hoisted(() => ({ withIdentity: vi.fn() }));
vi.mock("@/lib/db", () => ({ withIdentity: apiMocks.withIdentity }));
import { POST as supportPost } from "@/app/api/v1/support/route";
const db = await createTestDatabase();
let professional: string;
let customer: string;
let offer: string;
let regular: string;
const input: SupportInput = {
  name: "Fixture Customer",
  email: "support-fixture@example.test",
  topic: "Account & sign-in",
  reference: "",
  message: "I cannot sign in to my fictional test account.",
  website: "",
};
async function asUser<T>(
  auth: string,
  work: (sql: SqlClient) => Promise<T>,
  verified = false,
) {
  return db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE beauty_app");
    await tx.query(
      "SELECT set_config('app.auth_id',$1,true),set_config('app.admin_verified',$2,true)",
      [auth, String(verified)],
    );
    return work(tx);
  });
}
beforeAll(async () => {
  await applyTestMigrations(db);
  const pro = await asUser("filter-pro", (sql) =>
    enrolAccount(
      sql,
      {
        authId: "filter-pro",
        email: "pro@example.test",
        displayName: "Filter Studio",
        secondFactorAge: null,
      },
      "professional",
    ),
  );
  professional = pro.professionalId!;
  await asUser("filter-pro", (sql) =>
    updateProfile(sql, professional, {
      slug: "filter-studio",
      businessName: "Filter Studio",
      bio: "A fictional studio for isolated tests.",
      city: "London",
      category: "Hair",
      publicationStatus: "published",
    }),
  );
  const buyer = await asUser("filter-customer", (sql) =>
    enrolAccount(
      sql,
      {
        authId: "filter-customer",
        email: "buyer@example.test",
        displayName: "Filter Buyer",
        secondFactorAge: null,
      },
      "customer",
    ),
  );
  customer = buyer.id;
  const admin = await asUser("support-admin", (sql) =>
    enrolAccount(
      sql,
      {
        authId: "support-admin",
        email: "admin@example.test",
        displayName: "Support Admin",
        secondFactorAge: null,
      },
      "customer",
    ),
  );
  await db.query(
    "INSERT INTO beauty.user_roles(user_id,role) VALUES($1,'admin')",
    [admin.id],
  );
  for (const [name, previous] of [
    ["Offer oil", 3000],
    ["Regular oil", null],
  ] as const) {
    const p = await asUser("filter-pro", (sql) =>
      saveProduct(sql, professional, {
        name,
        description: "A fictional product for catalogue checks.",
        sku: null,
        pricePence: 2000,
        compareAtPricePence: previous,
        stockQuantity: 20,
        imageAssetId: null,
        publicationStatus: "published",
      }),
    );
    if (previous) offer = p.id;
    else regular = p.id;
  }
  for (const [status, quantity, age] of [
    ["paid", 2, 0],
    ["delivered", 5, 40],
    ["refunded", 20, 0],
    ["cancelled", 20, 0],
  ] as const) {
    const order = await db.query<{ id: string }>(
      `INSERT INTO beauty.product_orders(checkout_reference,provider_payment_intent_id,customer_id,professional_id,professional_name,subtotal_pence,total_pence,status,recipient_name,address_line1,city,postcode,country_code,tracking_carrier,tracking_number,shipped_at,delivered_at,created_at) VALUES(gen_random_uuid(),'pi_fixture',$1,$2,'Filter Studio',$3,$3,$4,'Fixture Buyer','1 Test Road','London','SE1 1AA','GB','Fixture Carrier','FIX-001',now(),CASE WHEN $4='delivered' THEN now() ELSE NULL END,now()-($5::integer*interval '1 day')) RETURNING id`,
      [customer, professional, quantity * 2000, status, age],
    );
    await db.query(
      "INSERT INTO beauty.product_order_items(order_id,product_id,product_name,unit_price_pence,quantity,line_total_pence) VALUES($1,$2,'Offer oil',2000,$3,$4)",
      [order.rows[0].id, offer, quantity, quantity * 2000],
    );
  }
});
afterAll(() => db.close());
describe.sequential("Private support intake", () => {
  it("accepts signed-out requests but does not allow reading the inbox", async () => {
    const id = await asUser("", (sql) =>
      createSupportRequest(sql, input, "a".repeat(64)),
    );
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    await expect(asUser("", (sql) => supportInbox(sql))).rejects.toThrow(
      "FORBIDDEN",
    );
    await expect(
      asUser("", (sql) => sql.query("SELECT * FROM beauty.support_requests")),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser("filter-customer", (sql) => supportInbox(sql)),
    ).rejects.toThrow("FORBIDDEN");
  });
  it("requires verified administration and records status updates", async () => {
    await expect(asUser("support-admin", supportInbox)).rejects.toThrow(
      "FORBIDDEN",
    );
    const requests = await asUser("support-admin", supportInbox, true);
    expect(requests[0]).toMatchObject({
      email: input.email,
      message: input.message,
      status: "open",
    });
    expect(requests[0]).not.toHaveProperty("rate_key");
    await asUser(
      "support-admin",
      (sql) => setSupportStatus(sql, requests[0].id, "resolved"),
      true,
    );
    expect((await asUser("support-admin", supportInbox, true))[0].status).toBe(
      "resolved",
    );
    expect(
      (
        await db.query(
          "SELECT status FROM beauty.support_request_events WHERE request_id=$1",
          [requests[0].id],
        )
      ).rows,
    ).toHaveLength(1);
    await expect(
      asUser("filter-customer", (sql) =>
        setSupportStatus(sql, requests[0].id, "open"),
      ),
    ).rejects.toThrow("FORBIDDEN");
  });
  it("persists a guest API request and delivers the same reference to the private inbox", async () => {
    apiMocks.withIdentity.mockImplementation(
      (_auth: string, work: (sql: SqlClient) => Promise<unknown>) =>
        asUser("", work),
    );
    const response = await supportPost(
      new Request("https://www.glohaus.shop/api/v1/support", {
        method: "POST",
        headers: {
          origin: "https://www.glohaus.shop",
          "Content-Type": "application/json",
          "x-vercel-forwarded-for": "192.0.2.2",
        },
        body: JSON.stringify({ ...input, email: "api-fixture@example.test" }),
      }),
    );
    expect(response.status).toBe(201);
    const { id } = await response.json();
    const inbox = await asUser("support-admin", supportInbox, true);
    expect(inbox.find((request) => request.id === id)).toMatchObject({
      email: "api-fixture@example.test",
      message: input.message,
      status: "open",
    });
  });
  it("limits an email to five submissions per hour", async () => {
    for (let i = 0; i < 5; i++)
      await asUser("", (sql) =>
        createSupportRequest(
          sql,
          { ...input, email: "rate-email@example.test" },
          "b".repeat(64),
        ),
      );
    await expect(
      asUser("", (sql) =>
        createSupportRequest(
          sql,
          { ...input, email: "rate-email@example.test" },
          "c".repeat(64),
        ),
      ),
    ).rejects.toThrow("SUPPORT_RATE_LIMIT");
  });
  it("limits one network bucket despite changing email addresses", async () => {
    for (let i = 0; i < 10; i++)
      await asUser("", (sql) =>
        createSupportRequest(
          sql,
          { ...input, email: `rate-${i}@example.test` },
          "d".repeat(64),
        ),
      );
    await expect(
      asUser("", (sql) =>
        createSupportRequest(
          sql,
          { ...input, email: "rate-11@example.test" },
          "d".repeat(64),
        ),
      ),
    ).rejects.toThrow("SUPPORT_RATE_LIMIT");
  });
  it("does not grant browser roles the intake or inbox functions", async () => {
    const result = await db.query<{ allowed: boolean }>(
      "SELECT has_function_privilege('anon','beauty.submit_support_request(text,text,text,text,text,text)','EXECUTE') OR has_function_privilege('authenticated','beauty.admin_support_requests()','EXECUTE') AS allowed",
    );
    expect(result.rows[0].allowed).toBe(false);
    expect(
      supportInputSchema.safeParse({ ...input, email: "bad", message: "short" })
        .success,
    ).toBe(false);
  });
});
describe.sequential("Shop collections use actual data", () => {
  it("ranks paid sales while excluding cancelled/refunded orders and keeping buyer data private", async () => {
    const products = await asUser("", (sql) =>
      publicProducts(sql, { collection: "bestsellers" }),
    );
    expect(products).toHaveLength(1);
    expect(products[0].id).toBe(offer);
    expect(Number(products[0].sold_units)).toBe(7);
    expect(Number(products[0].recent_sold_units)).toBe(2);
    expect(products[0]).not.toHaveProperty("customer_id");
    expect(
      (
        await asUser("", (sql) =>
          sql.query("SELECT customer_id FROM beauty.product_orders"),
        )
      ).rows,
    ).toEqual([]);
  });
  it("combines literal search with real collections", async () => {
    expect(
      (
        await asUser("", (sql) =>
          publicProducts(sql, { collection: "trending", query: "oil" }),
        )
      ).map((p) => p.id),
    ).toEqual([offer]);
    expect(
      await asUser("", (sql) =>
        publicProducts(sql, { collection: "bestsellers", query: "Regular" }),
      ),
    ).toEqual([]);
    expect(
      await asUser("", (sql) => publicProducts(sql, { query: "%" })),
    ).toEqual([]);
  });
  it("shows only genuine seller-entered reductions and can remove an offer", async () => {
    expect(
      (
        await asUser("", (sql) => publicProducts(sql, { collection: "deals" }))
      ).map((p) => p.id),
    ).toEqual([offer]);
    const current = (
      await asUser("filter-pro", (sql) => publicProducts(sql))
    ).find((p) => p.id === offer)!;
    await asUser("filter-pro", (sql) =>
      saveProduct(
        sql,
        professional,
        {
          name: current.name,
          description: current.description,
          sku: null,
          pricePence: 2000,
          compareAtPricePence: null,
          stockQuantity: 20,
          imageAssetId: null,
          publicationStatus: "published",
        },
        offer,
      ),
    );
    expect(
      await asUser("", (sql) => publicProducts(sql, { collection: "deals" })),
    ).toEqual([]);
    expect((await asUser("", publicProducts)).map((p) => p.id)).toContain(
      regular,
    );
  });
  it("rejects invalid previous prices and never exposes draft products in sales", async () => {
    expect(
      productInputSchema.safeParse({
        name: "Oil",
        description: "",
        sku: null,
        pricePence: 2000,
        compareAtPricePence: 1900,
        stockQuantity: 2,
        imageAssetId: null,
        publicationStatus: "published",
      }).success,
    ).toBe(false);
    await db.query(
      "UPDATE beauty.products SET publication_status='draft' WHERE id=$1",
      [offer],
    );
    expect(
      await asUser("", (sql) =>
        publicProducts(sql, { collection: "bestsellers" }),
      ),
    ).toEqual([]);
  });
});
