import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { enrolAccount, type SqlClient } from "@/modules/accounts/repository";
import { updateProfile } from "@/modules/professionals/repository";
import {
  addCartItem,
  attachShopCheckoutSession,
  prepareShopCheckout,
  saveProduct,
  customerProductOrders,
} from "@/modules/shop/repository";

const db = new PGlite();
let professionalId = "";
let customerId = "";
let productId = "";
let orderId = "";

async function asUser<T>(authId: string, work: (sql: SqlClient) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE beauty_app");
    await tx.query("SELECT set_config('app.auth_id',$1,true)", [authId]);
    return work(tx);
  });
}

async function worker<T>(work: (sql: SqlClient) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE beauty_payment_worker");
    return work(tx);
  });
}

beforeAll(async () => {
  const directory = new URL("../db/migrations/", import.meta.url);
  for (const file of (await readdir(directory)).filter((file) => file.endsWith(".sql")).sort())
    await db.exec(await readFile(new URL(file, directory), "utf8"));

  const pro = await asUser("refund-pro", (sql) =>
    enrolAccount(sql, {
      authId: "refund-pro",
      email: "refund-pro@example.test",
      displayName: "Refund Studio",
      secondFactorAge: null,
    }, "professional"),
  );
  professionalId = pro.professionalId!;

  await asUser("refund-pro", async (sql) => {
    await updateProfile(sql, professionalId, {
      slug: "refund-studio",
      businessName: "Refund Studio",
      bio: "Product refund test studio.",
      city: "London",
      category: "Hair",
      publicationStatus: "published",
    });
    productId = (
      await saveProduct(sql, professionalId, {
        name: "Refund test oil",
        description: "Product used to test unshipped refunds.",
        sku: "REFUND-1",
        pricePence: 5000,
        stockQuantity: 2,
        imageAssetId: null,
        publicationStatus: "published",
      })
    ).id;
    await sql.query(
      "INSERT INTO beauty.professional_payment_accounts(professional_id,stripe_account_id) VALUES($1,'acct_refund_test')",
      [professionalId],
    );
  });

  await worker((sql) =>
    sql.query("SELECT beauty.sync_connect_account('acct_refund_test',true)"),
  );

  const customer = await asUser("refund-customer", (sql) =>
    enrolAccount(sql, {
      authId: "refund-customer",
      email: "refund-customer@example.test",
      displayName: "Refund Customer",
      secondFactorAge: null,
    }, "customer"),
  );
  customerId = customer.id;

  await db.query(
    `INSERT INTO beauty.financial_fee_rules(
      transaction_kind,category_key,fee_payer,percentage_basis_points,
      fixed_fee_pence,minimum_fee_pence,minimum_transaction_pence,
      processing_cost_payer,created_by_user_id
    ) VALUES('product',NULL,'professional',1000,0,0,1,'platform',$1)`,
    [customerId],
  );

  await asUser("refund-customer", (sql) => addCartItem(sql, productId, 1));
  const checkout = await asUser("refund-customer", (sql) => prepareShopCheckout(sql));
  await asUser("refund-customer", (sql) =>
    attachShopCheckoutSession(sql, checkout.id, "cs_product_refund"),
  );

  await worker((sql) =>
    sql.query(
      "SELECT beauty.apply_shop_checkout_payment($1,$2,$3,$4,$5,$6,$7::jsonb)",
      [
        "evt_product_refund_paid",
        checkout.id,
        "cs_product_refund",
        "pi_product_refund",
        5000,
        "gbp",
        JSON.stringify({
          name: "Refund Customer",
          address: {
            line1: "1 Refund Road",
            line2: null,
            city: "London",
            postal_code: "SE1 1AA",
            country: "GB",
          },
        }),
      ],
    ),
  );

  orderId = (
    await db.query<{ id: string }>(
      "SELECT id FROM beauty.product_orders WHERE provider_payment_intent_id='pi_product_refund'",
    )
  ).rows[0].id;
});

afterAll(() => db.close());

describe.sequential("unshipped product refunds", () => {
  it("only lets the owning professional start a full refund before shipping", async () => {
    const decision = (
      await asUser("refund-pro", (sql) =>
        sql.query<{
          data: {
            id: string;
            amountPence: number;
            paymentIntentId: string;
            status: string;
          };
        }>(
          "SELECT beauty.request_product_order_refund($1,$2) AS data",
          [orderId, "Unable to fulfil this product order"],
        ),
      )
    ).rows[0].data;

    expect(decision).toMatchObject({
      amountPence: 5000,
      paymentIntentId: "pi_product_refund",
      status: "queued",
    });

    expect(
      (
        await db.query<{ status: string }>(
          "SELECT status FROM beauty.product_orders WHERE id=$1",
          [orderId],
        )
      ).rows[0].status,
    ).toBe("refund_pending");
  });

  it("records the successful customer refund while preserving platform commission", async () => {
    const decision = (
      await db.query<{ id: string }>(
        "SELECT id FROM beauty.product_order_refund_decisions WHERE order_id=$1",
        [orderId],
      )
    ).rows[0];

    await worker(async (sql) => {
      await sql.query(
        "SELECT beauty.apply_product_order_refund_result($1,$2,$3,$4,$5)",
        [decision.id, "re_product_refund", 5000, "succeeded", "pi_product_refund"],
      );
      await sql.query(
        "SELECT beauty.record_product_order_refund_finance($1)",
        [decision.id],
      );
    });

    expect(
      (
        await db.query<{ status: string }>(
          "SELECT status FROM beauty.product_orders WHERE id=$1",
          [orderId],
        )
      ).rows[0].status,
    ).toBe("refunded");

    const wallet = (
      await asUser("refund-pro", (sql) =>
        sql.query<{
          data: {
            pendingPence: number;
            outstandingObligationPence: number;
          };
        }>("SELECT beauty.my_wallet_overview() AS data"),
      )
    ).rows[0].data;

    expect(wallet.pendingPence).toBe(0);
    expect(wallet.outstandingObligationPence).toBe(500);
  });

  it("shows the confirmed refund in the customer order history", async () => {
    const orders = await asUser("refund-customer", (sql) =>
      customerProductOrders(sql, customerId),
    );
    const order = orders.find((item) => item.id === orderId);
    expect(order).toMatchObject({
      status: "refunded",
      refundAmountPence: 5000,
      refundStatus: "succeeded",
      refundReason: "Unable to fulfil this product order",
    });
  });

  it("is idempotent when Stripe repeats the successful refund event", async () => {
    const decision = (
      await db.query<{ id: string }>(
        "SELECT id FROM beauty.product_order_refund_decisions WHERE order_id=$1",
        [orderId],
      )
    ).rows[0];

    await worker(async (sql) => {
      await sql.query(
        "SELECT beauty.apply_product_order_refund_result($1,$2,$3,$4,$5)",
        [decision.id, "re_product_refund", 5000, "succeeded", "pi_product_refund"],
      );
      await sql.query(
        "SELECT beauty.record_product_order_refund_finance($1)",
        [decision.id],
      );
    });

    expect(
      (
        await db.query<{ count: number }>(
          "SELECT count(*)::integer AS count FROM beauty.financial_ledger_transactions WHERE event_reference=$1",
          ["product-refund:" + decision.id],
        )
      ).rows[0].count,
    ).toBe(1);
  });
});
