import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { enrolAccount, type SqlClient } from "@/modules/accounts/repository";
import { updateProfile } from "@/modules/professionals/repository";
import {
  addCartItem,
  attachShopCheckoutSession,
  customerProductOrders,
  prepareShopCheckout,
  saveProduct,
  shopCartPayoutsReady,
} from "@/modules/shop/repository";

const db = new PGlite();
let customerId: string;
let professionalId: string;
let productId: string;

async function asUser<T>(
  authId: string,
  work: (sql: SqlClient) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE beauty_app");
    await tx.query("SELECT set_config('app.auth_id',$1,true)", [authId]);
    return work(tx);
  });
}

async function asPaymentWorker<T>(
  work: (sql: SqlClient) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE beauty_payment_worker");
    return work(tx);
  });
}

beforeAll(async () => {
  const directory = new URL("../db/migrations/", import.meta.url);
  for (const file of (await readdir(directory))
    .filter((file) => file.endsWith(".sql"))
    .sort())
    await db.exec(await readFile(new URL(file, directory), "utf8"));

  const pro = await asUser("checkout-pro", (sql) =>
    enrolAccount(
      sql,
      {
        authId: "checkout-pro",
        email: "checkout-pro@example.test",
        displayName: "Checkout Studio",
        secondFactorAge: null,
      },
      "professional",
    ),
  );
  professionalId = pro.professionalId!;

  await asUser("checkout-pro", (sql) =>
    updateProfile(sql, professionalId, {
      slug: "checkout-studio",
      businessName: "Checkout Studio",
      bio: "Secure checkout test professional.",
      city: "London",
      category: "Hair",
      publicationStatus: "published",
    }),
  );

  const customer = await asUser("checkout-customer", (sql) =>
    enrolAccount(
      sql,
      {
        authId: "checkout-customer",
        email: "checkout-customer@example.test",
        displayName: "Checkout Customer",
        secondFactorAge: null,
      },
      "customer",
    ),
  );
  customerId = customer.id;

  productId = (
    await asUser("checkout-pro", (sql) =>
      saveProduct(sql, professionalId, {
        name: "Checkout Oil",
        description: "Secure checkout test item.",
        sku: "CHECKOUT-001",
        pricePence: 2000,
        stockQuantity: 5,
        imageAssetId: null,
        publicationStatus: "published",
      }),
    )
  ).id;

  await asUser("checkout-pro", (sql) =>
    sql.query(
      "INSERT INTO beauty.professional_payment_accounts(professional_id,stripe_account_id) VALUES($1,$2)",
      [professionalId, "acct_checkout_test"],
    ),
  );

  await db.query(
    `INSERT INTO beauty.financial_fee_rules(
      transaction_kind,category_key,fee_payer,percentage_basis_points,
      fixed_fee_pence,minimum_fee_pence,minimum_transaction_pence,
      processing_cost_payer,created_by_user_id
    ) VALUES('product',NULL,'professional',1000,0,0,1,'platform',$1)`,
    [customerId],
  );
});

afterAll(() => db.close());

describe.sequential("secure Shop checkout", () => {
  it("hides payout account IDs and requires Stripe transfer readiness", async () => {
    const visible = await asUser("checkout-customer", (sql) =>
      sql.query<{ stripe_account_id: string }>(
        "SELECT stripe_account_id FROM beauty.professional_payment_accounts WHERE professional_id=$1",
        [professionalId],
      ),
    );
    expect(visible.rows).toEqual([]);

    await asUser("checkout-customer", (sql) => addCartItem(sql, productId, 1));
    expect(
      await asUser("checkout-customer", (sql) => shopCartPayoutsReady(sql)),
    ).toBe(false);

    await asPaymentWorker((sql) =>
      sql.query("SELECT beauty.sync_connect_account($1,true)", [
        "acct_checkout_test",
      ]),
    );

    expect(
      await asUser("checkout-customer", (sql) => shopCartPayoutsReady(sql)),
    ).toBe(true);

    await asUser("checkout-customer", (sql) =>
      sql.query("SELECT beauty.clear_cart()"),
    );
  });
  it("reserves stock before Stripe checkout opens", async () => {
    await asUser("checkout-customer", (sql) =>
      addCartItem(sql, productId, 2),
    );

    const checkout = await asUser("checkout-customer", (sql) =>
      prepareShopCheckout(sql),
    );

    expect(checkout).toMatchObject({
      totalPence: 4000,
      itemCount: 2,
    });
    expect(checkout.items[0]).toMatchObject({
      productId,
      pricePence: 2000,
      quantity: 2,
    });

    const stock = await db.query<{ stock_quantity: number }>(
      "SELECT stock_quantity FROM beauty.products WHERE id=$1",
      [productId],
    );
    expect(stock.rows[0].stock_quantity).toBe(3);

    await asUser("checkout-customer", (sql) =>
      attachShopCheckoutSession(sql, checkout.id, "cs_secure_test"),
    );

    await asPaymentWorker((sql) =>
      sql.query(
        "SELECT beauty.apply_shop_checkout_payment($1,$2,$3,$4,$5,$6,$7::jsonb)",
        [
          "evt_secure_shop_paid",
          checkout.id,
          "cs_secure_test",
          "pi_secure_shop",
          4000,
          "gbp",
          JSON.stringify({
            name: "Checkout Customer",
            address: {
              line1: "1 Beauty Street",
              line2: null,
              city: "London",
              postal_code: "SE1 1AA",
              country: "GB",
            },
          }),
        ],
      ),
    );

    const orders = await asUser("checkout-customer", (sql) =>
      customerProductOrders(sql, customerId),
    );
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({
      professionalId,
      subtotalPence: 4000,
      totalPence: 4000,
      recipientName: "Checkout Customer",
      postcode: "SE1 1AA",
    });

    const fee = await db.query<{
      platform_fee_pence: number;
      professional_proceeds_pence: number;
    }>(
      "SELECT platform_fee_pence,professional_proceeds_pence FROM beauty.product_orders WHERE checkout_reference=$1",
      [checkout.id],
    );
    expect(fee.rows[0]).toEqual({
      platform_fee_pence: 400,
      professional_proceeds_pence: 3600,
    });
  });

  it("records a released product transfer once and clears GLOHAUS available funds", async () => {
    const order = (
      await db.query<{
        id: string;
        professional_proceeds_pence: number;
      }>(
        "SELECT id,professional_proceeds_pence FROM beauty.product_orders WHERE provider_payment_intent_id='pi_secure_shop'",
      )
    ).rows[0];

    await db.query(
      "UPDATE beauty.product_orders SET status='delivered',delivered_at=now()-interval '49 hours' WHERE id=$1",
      [order.id],
    );

    await asUser("checkout-pro", (sql) =>
      sql.query("SELECT beauty.release_my_mature_product_proceeds()"),
    );

    const before = await asUser("checkout-pro", (sql) =>
      sql.query<{ data: { availablePence: number } }>(
        "SELECT beauty.my_wallet_overview() AS data",
      ),
    );
    expect(before.rows[0].data.availablePence).toBe(
      order.professional_proceeds_pence,
    );

    await asPaymentWorker((sql) =>
      sql.query("SELECT beauty.record_product_transfer($1,$2,$3)", [
        order.id,
        "tr_secure_product",
        order.professional_proceeds_pence,
      ]),
    );

    await asPaymentWorker((sql) =>
      sql.query("SELECT beauty.record_product_transfer($1,$2,$3)", [
        order.id,
        "tr_secure_product",
        order.professional_proceeds_pence,
      ]),
    );

    const row = (
      await db.query<{ stripe_transfer_id: string; transferred_at: Date }>(
        "SELECT stripe_transfer_id,transferred_at FROM beauty.product_orders WHERE id=$1",
        [order.id],
      )
    ).rows[0];
    expect(row.stripe_transfer_id).toBe("tr_secure_product");
    expect(row.transferred_at).toBeTruthy();

    const after = await asUser("checkout-pro", (sql) =>
      sql.query<{ data: { availablePence: number } }>(
        "SELECT beauty.my_wallet_overview() AS data",
      ),
    );
    expect(after.rows[0].data.availablePence).toBe(0);
  });

  it("restores reserved stock if an attached checkout expires", async () => {
    await asUser("checkout-customer", (sql) =>
      addCartItem(sql, productId, 1),
    );
    const checkout = await asUser("checkout-customer", (sql) =>
      prepareShopCheckout(sql),
    );
    await asUser("checkout-customer", (sql) =>
      attachShopCheckoutSession(sql, checkout.id, "cs_expired_test"),
    );

    const before = await db.query<{ stock_quantity: number }>(
      "SELECT stock_quantity FROM beauty.products WHERE id=$1",
      [productId],
    );

    await asPaymentWorker((sql) =>
      sql.query("SELECT beauty.release_shop_checkout($1,$2,'expired')", [
        checkout.id,
        "cs_expired_test",
      ]),
    );

    const after = await db.query<{ stock_quantity: number }>(
      "SELECT stock_quantity FROM beauty.products WHERE id=$1",
      [productId],
    );
    expect(after.rows[0].stock_quantity).toBe(before.rows[0].stock_quantity + 1);
  });
});
