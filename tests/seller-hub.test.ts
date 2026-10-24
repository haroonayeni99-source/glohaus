import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, applyTestMigrations } from "./test-database";
import { enrolAccount, type SqlClient } from "@/modules/accounts/repository";
import { updateProfile } from "@/modules/professionals/repository";
import {
  addCartItem,
  clearCart,
  customerCart,
  prepareShopCheckout,
  publicProducts,
  saveProduct,
  setCartItem,
} from "@/modules/shop/repository";
import {
  saveSellerSettings,
  sellerOverview,
  sellerProductInsights,
  sellerSettings,
} from "@/modules/shop/seller-repository";
import {
  productDescriptionDraft,
  sellerIsAway,
  sellerSettingsSchema,
} from "@/modules/shop/seller";
const db = await createTestDatabase();
let pro: string;
let product: string;
let otherProduct: string;
let customer: string;
async function asUser<T>(auth: string, work: (sql: SqlClient) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE beauty_app");
    await tx.query("SELECT set_config('app.auth_id',$1,true)", [auth]);
    return work(tx);
  });
}
beforeAll(async () => {
  await applyTestMigrations(db);
  for (const authId of ["seller-one", "seller-two", "seller-buyer"]) {
    const account = await asUser(authId, (sql) =>
      enrolAccount(
        sql,
        {
          authId,
          email: authId + "@example.test",
          displayName: authId,
          secondFactorAge: null,
        },
        authId === "seller-buyer" ? "customer" : "professional",
      ),
    );
    if (authId === "seller-buyer") {
      customer = account.id;
      continue;
    }
    const id = account.professionalId!;
    await asUser(authId, (sql) =>
      updateProfile(sql, id, {
        slug: authId,
        businessName: authId,
        bio: "Isolated marketplace seller fixture.",
        city: "London",
        category: "Hair",
        publicationStatus: "published",
      }),
    );
    const item = await asUser(authId, (sql) =>
      saveProduct(sql, id, {
        name: authId + " oil",
        description: "Test fixture",
        sku: "OIL",
        pricePence: 1200,
        stockQuantity: 5,
        imageAssetId: null,
        publicationStatus: "published",
      }),
    );
    if (authId === "seller-one") {
      pro = id;
      product = item.id;
    } else {
      otherProduct = item.id;
    }
  }
  await db.query(
    `INSERT INTO beauty.financial_fee_rules(transaction_kind,fee_payer,percentage_basis_points,fixed_fee_pence,minimum_fee_pence,minimum_transaction_pence,processing_cost_payer,created_by_user_id) VALUES('product','professional',1000,0,0,1,'platform',$1)`,
    [customer],
  );
});
afterAll(() => db.close());
describe.sequential("seller controls in an isolated database", () => {
  it.skipIf(process.env.GLOHAUS_NATIVE_DATABASE !== "1")("serializes a concurrent cart addition behind a seller pause", async () => {
    await asUser("seller-buyer", (sql) => clearCart(sql));
    let pauseLocked!: () => void;
    let allowCommit!: () => void;
    const locked = new Promise<void>((resolve) => { pauseLocked = resolve; });
    const commit = new Promise<void>((resolve) => { allowCommit = resolve; });
    const pause = asUser("seller-one", async (sql) => {
      await saveSellerSettings(sql, pro, { away: true, awayUntil: null });
      pauseLocked();
      await commit;
    });
    await locked;
    // Observe the second backend's actual lock wait, rather than assuming that
    // timing alone proves serialization. No Stripe/provider requests occur.
    const add = asUser("seller-buyer", (sql) => addCartItem(sql, product, 1));
    const rejected = expect(add).rejects.toThrow("SELLER_AWAY");
    try {
      let waiting = false;
      for (let attempt = 0; attempt < 100 && !waiting; attempt++) {
        const result = await db.query<{ waiting: boolean }>(`SELECT EXISTS(
          SELECT 1 FROM pg_stat_activity WHERE datname=current_database()
          AND wait_event='advisory' AND query LIKE '%beauty.add_cart_item%') AS waiting`);
        waiting = result.rows[0].waiting;
        if (!waiting) await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(waiting).toBe(true);
    } finally { allowCommit(); }
    await pause;
    await rejected;
    expect((await asUser("seller-buyer", (sql) => customerCart(sql))).items).toHaveLength(0);
    await asUser("seller-one", (sql) => saveSellerSettings(sql, pro, { away: false, awayUntil: null }));
  });
  it("defaults existing shops to accepting orders", async () => {
    expect(
      await asUser("seller-one", (sql) => sellerSettings(sql, pro)),
    ).toEqual({ away: false, awayUntil: null });
    expect(
      (await asUser("seller-buyer", (sql) => publicProducts(sql))).find(
        (p) => p.id === product,
      )?.seller_away,
    ).toBe(false);
  });
  it("isolates settings and refuses a forged seller ID", async () => {
    await asUser("seller-one", (sql) =>
      saveSellerSettings(sql, pro, { away: true, awayUntil: null }),
    );
    expect(
      (
        await asUser("seller-two", (sql) =>
          sql.query(
            "SELECT * FROM beauty.seller_settings WHERE professional_id=$1",
            [pro],
          ),
        )
      ).rows,
    ).toEqual([]);
    await expect(
      asUser("seller-two", (sql) =>
        saveSellerSettings(sql, pro, { away: false, awayUntil: null }),
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      asUser("seller-buyer", (sql) =>
        saveSellerSettings(sql, pro, { away: false, awayUntil: null }),
      ),
    ).rejects.toThrow(/row-level security/);
    expect(
      await asUser("seller-one", (sql) => sellerSettings(sql, pro)),
    ).toEqual({ away: true, awayUntil: null });
  });
  it("labels paused sellers, blocks direct cart additions and allows other shops", async () => {
    expect(
      (await asUser("seller-buyer", (sql) => publicProducts(sql))).find(
        (p) => p.id === product,
      )?.seller_away,
    ).toBe(true);
    await expect(
      asUser("seller-buyer", (sql) => addCartItem(sql, product, 1)),
    ).rejects.toThrow("SELLER_AWAY");
    await asUser("seller-buyer", (sql) => addCartItem(sql, otherProduct, 1));
    await asUser("seller-buyer", (sql) => clearCart(sql));
  });
  it("invalidates an existing cart, blocks checkout atomically and permits removal", async () => {
    await asUser("seller-one", (sql) =>
      saveSellerSettings(sql, pro, { away: false, awayUntil: null }),
    );
    await asUser("seller-buyer", (sql) => addCartItem(sql, product, 2));
    await asUser("seller-buyer", (sql) => addCartItem(sql, otherProduct, 1));
    await asUser("seller-one", (sql) =>
      saveSellerSettings(sql, pro, { away: true, awayUntil: null }),
    );
    const cart = await asUser("seller-buyer", (sql) => customerCart(sql));
    expect(cart.items.find((item) => item.productId === product)).toMatchObject(
      { available: false, inStockForQuantity: false },
    );
    expect(cart.totalPence).toBe(1200);
    await expect(
      asUser("seller-buyer", (sql) => prepareShopCheckout(sql)),
    ).rejects.toThrow("SELLER_AWAY");
    expect(
      (
        await db.query<{ stock_quantity: number }>(
          "SELECT stock_quantity FROM beauty.products WHERE id IN($1,$2)",
          [product, otherProduct],
        )
      ).rows.map((row) => row.stock_quantity),
    ).toEqual([5, 5]);
    expect(
      (await db.query("SELECT * FROM beauty.shop_checkouts")).rows,
    ).toHaveLength(0);
    await asUser("seller-buyer", (sql) => setCartItem(sql, product, 0));
    expect(
      (await asUser("seller-buyer", (sql) => customerCart(sql))).items,
    ).toHaveLength(1);
    await asUser("seller-buyer", (sql) => clearCart(sql));
  });
  it("resumes automatically after the chosen time and preserves existing reservations", async () => {
    await asUser("seller-one", (sql) =>
      saveSellerSettings(sql, pro, {
        away: true,
        awayUntil: new Date(Date.now() - 60000).toISOString(),
      }),
    );
    expect(
      (await asUser("seller-buyer", (sql) => publicProducts(sql))).find(
        (p) => p.id === product,
      )?.seller_away,
    ).toBe(false);
    await asUser("seller-buyer", (sql) => addCartItem(sql, product, 1));
    const checkout = await asUser("seller-buyer", (sql) =>
      prepareShopCheckout(sql),
    );
    await asUser("seller-one", (sql) =>
      saveSellerSettings(sql, pro, { away: true, awayUntil: null }),
    );
    expect(
      (await asUser("seller-buyer", (sql) => prepareShopCheckout(sql))).id,
    ).toBe(checkout.id);
    expect(
      (await asUser("seller-buyer", (sql) => prepareShopCheckout(sql)))
        .totalPence,
    ).toBe(1200);
  });
  it("keeps fulfilment and one-time shipping notifications available while away", async () => {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO beauty.product_orders(checkout_reference,provider_payment_intent_id,customer_id,professional_id,professional_name,subtotal_pence,total_pence,recipient_name,address_line1,city,postcode,country_code) VALUES(gen_random_uuid(),'pi_seller_fixture',$1,$2,'Seller One',2400,2400,'Fixture Buyer','1 Test Street','London','SE1 1AA','GB') RETURNING id`,
      [customer, pro],
    );
    const order = rows[0].id;
    await db.query(
      `INSERT INTO beauty.product_order_items(order_id,product_id,product_name,unit_price_pence,quantity,line_total_pence) VALUES($1,$2,'Test oil',1200,2,2400)`,
      [order, product],
    );
    await asUser("seller-one", (sql) =>
      sql.query(
        "SELECT beauty.advance_product_order($1,'shipped','Royal Mail','TEST123')",
        [order],
      ),
    );
    await expect(
      asUser("seller-one", (sql) =>
        sql.query(
          "SELECT beauty.advance_product_order($1,'shipped','Royal Mail','TEST123')",
          [order],
        ),
      ),
    ).rejects.toThrow("INVALID_TRANSITION");
    expect(
      (
        await db.query(
          "SELECT * FROM beauty.product_notification_outbox WHERE product_order_id=$1 AND kind='order_shipped_customer'",
          [order],
        )
      ).rows,
    ).toHaveLength(1);
  });
  it("calculates own-shop metrics using actual paid items and excludes cancelled orders", async () => {
    await db.query(
      `INSERT INTO beauty.product_orders(checkout_reference,provider_payment_intent_id,customer_id,professional_id,professional_name,subtotal_pence,total_pence,status,recipient_name,address_line1,city,postcode,country_code) VALUES(gen_random_uuid(),'pi_cancelled_fixture',$1,$2,'Seller One',9999,9999,'cancelled','Fixture Buyer','1 Test Street','London','SE1 1AA','GB')`,
      [customer, pro],
    );
    const overview = await asUser("seller-one", (sql) =>
      sellerOverview(sql, pro),
    );
    expect(overview).toMatchObject({
      sales30DaysPence: 2400,
      paidOrders30Days: 1,
      publishedProducts: 1,
      lowStockProducts: 1,
      openOrders: 0,
    });
    expect(
      await asUser("seller-one", (sql) => sellerProductInsights(sql, pro)),
    ).toEqual([
      {
        productId: product,
        name: "seller-one oil",
        units: 2,
        salesPence: 2400,
      },
    ]);
    expect(
      await asUser("seller-two", (sql) => sellerProductInsights(sql, pro)),
    ).toEqual([]);
    expect(
      (await asUser("seller-two", (sql) => sellerOverview(sql, pro)))
        .sales30DaysPence,
    ).toBe(0);
  });
});
it("validates return times and never accepts a client-supplied seller ID", () => {
  expect(
    sellerSettingsSchema.safeParse({
      away: true,
      awayUntil: new Date(Date.now() + 3600000).toISOString(),
    }).success,
  ).toBe(true);
  for (const value of [
    { away: false, awayUntil: new Date(Date.now() + 3600000).toISOString() },
    { away: true, awayUntil: "not-a-date" },
    { away: true, awayUntil: "2020-01-01T00:00:00Z" },
    {
      away: true,
      awayUntil: new Date(Date.now() + 367 * 86400000).toISOString(),
    },
    { away: true, awayUntil: null, professionalId: "another-seller" },
  ])
    expect(sellerSettingsSchema.safeParse(value).success).toBe(false);
  expect(sellerIsAway({ away: true, awayUntil: "2020-01-01T00:00:00Z" })).toBe(
    false,
  );
});
it("builds an editable description only from supplied facts", () => {
  expect(
    productDescriptionDraft(
      "  Hair oil  ",
      "  50ml. Ingredients: test fixture.  ",
    ),
  ).toBe("Hair oil\n\n50ml. Ingredients: test fixture.");
  expect(productDescriptionDraft("", "facts")).toBeNull();
  expect(productDescriptionDraft("Hair oil", " ")).toBeNull();
  expect(productDescriptionDraft("Hair oil", "a".repeat(1300))!.length).toBe(
    1200,
  );
});
