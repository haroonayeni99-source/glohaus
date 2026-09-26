import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { enrolAccount, type SqlClient } from "@/modules/accounts/repository";
import { updateProfile } from "@/modules/professionals/repository";
import {
  customerProductOrders,
  professionalProductOrders,
  saveProduct,
  confirmProductOrderDelivery,
} from "@/modules/shop/repository";
import {
  professionalWallet,
  releaseMatureProductProceeds,
} from "@/modules/finance/repository";

const db = new PGlite();

let customerId: string;
let otherCustomerId: string;
let professionalId: string;
let otherProfessionalId: string;
let productId: string;
let orderId: string;

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

beforeAll(async () => {
  const directory = new URL("../db/migrations/", import.meta.url);
  for (const file of (await readdir(directory))
    .filter((file) => file.endsWith(".sql"))
    .sort())
    await db.exec(await readFile(new URL(file, directory), "utf8"));

  for (const [authId, slug, business] of [
    ["order-pro", "order-studio", "Order Studio"],
    ["order-pro-two", "order-studio-two", "Other Order Studio"],
  ] as const) {
    const account = await asUser(authId, (sql) =>
      enrolAccount(
        sql,
        {
          authId,
          email: `${authId}@example.test`,
          displayName: business,
          secondFactorAge: null,
        },
        "professional",
      ),
    );
    if (authId === "order-pro") professionalId = account.professionalId!;
    else otherProfessionalId = account.professionalId!;

    await asUser(authId, (sql) =>
      updateProfile(sql, account.professionalId!, {
        slug,
        businessName: business,
        bio: "Published professional for Shop order isolation tests.",
        city: "London",
        category: "Hair",
        publicationStatus: "published",
      }),
    );
  }

  for (const authId of ["order-customer", "order-customer-two"]) {
    const account = await asUser(authId, (sql) =>
      enrolAccount(
        sql,
        {
          authId,
          email: `${authId}@example.test`,
          displayName:
            authId === "order-customer"
              ? "Order Customer"
              : "Other Order Customer",
          secondFactorAge: null,
        },
        "customer",
      ),
    );
    if (authId === "order-customer") customerId = account.id;
    else otherCustomerId = account.id;
  }

  productId = (
    await asUser("order-pro", (sql) =>
      saveProduct(sql, professionalId, {
        name: "Order Test Oil",
        description: "Product snapshot used by Shop order tests.",
        sku: "ORDER-001",
        pricePence: 2500,
        stockQuantity: 5,
        imageAssetId: null,
        publicationStatus: "published",
      }),
    )
  ).id;

  orderId = (
    await db.query<{ id: string }>(
      `INSERT INTO beauty.product_orders(
        checkout_reference,provider_payment_intent_id,
        customer_id,professional_id,professional_name,
        subtotal_pence,delivery_pence,total_pence,
        recipient_name,address_line1,address_line2,city,postcode,country_code
      ) VALUES(
        gen_random_uuid(),'pi_verified_test_order',
        $1,$2,'Order Studio',
        5000,399,5399,
        'Order Customer','1 Test Street',NULL,'London','SE1 1AA','GB'
      ) RETURNING id`,
      [customerId, professionalId],
    )
  ).rows[0].id;

  await db.query(
    `INSERT INTO beauty.product_order_items(
      order_id,product_id,product_name,image_asset_id,
      unit_price_pence,quantity,line_total_pence
    ) VALUES($1,$2,'Order Test Oil',NULL,2500,2,5000)`,
    [orderId, productId],
  );
});

afterAll(() => db.close());

describe.sequential("Shop orders and fulfilment", () => {
  it("shows an order only to its customer and selling professional", async () => {
    const customerOrders = await asUser("order-customer", (sql) =>
      customerProductOrders(sql, customerId),
    );
    expect(customerOrders).toHaveLength(1);
    expect(customerOrders[0]).toMatchObject({
      id: orderId,
      professionalId,
      professionalName: "Order Studio",
      status: "paid",
      subtotalPence: 5000,
      deliveryPence: 399,
      totalPence: 5399,
      recipientName: "Order Customer",
      postcode: "SE1 1AA",
    });
    expect(customerOrders[0].items).toEqual([
      expect.objectContaining({
        productId,
        productName: "Order Test Oil",
        unitPricePence: 2500,
        quantity: 2,
        lineTotalPence: 5000,
      }),
    ]);

    expect(
      await asUser("order-pro", (sql) =>
        professionalProductOrders(sql, professionalId),
      ),
    ).toHaveLength(1);

    expect(
      await asUser("order-customer-two", (sql) =>
        customerProductOrders(sql, otherCustomerId),
      ),
    ).toEqual([]);

    expect(
      await asUser("order-pro-two", (sql) =>
        professionalProductOrders(sql, otherProfessionalId),
      ),
    ).toEqual([]);
  });

  it("does not let application users forge paid orders", async () => {
    await expect(
      asUser("order-customer", (sql) =>
        sql.query(
          `INSERT INTO beauty.product_orders(
            checkout_reference,provider_payment_intent_id,
            customer_id,professional_id,professional_name,
            subtotal_pence,delivery_pence,total_pence,
            recipient_name,address_line1,city,postcode,country_code
          ) VALUES(
            gen_random_uuid(),'pi_forged',$1,$2,'Order Studio',
            100,0,100,'Order Customer','1 Fake Street','London','SE1','GB'
          )`,
          [customerId, professionalId],
        ),
      ),
    ).rejects.toThrow();

    await expect(
      asUser("order-pro", (sql) =>
        sql.query(
          "UPDATE beauty.product_orders SET status='delivered' WHERE id=$1",
          [orderId],
        ),
      ),
    ).rejects.toThrow();
  });

  it("does not let customers or another seller change fulfilment", async () => {
    await expect(
      asUser("order-customer", (sql) =>
        sql.query(
          "SELECT beauty.advance_product_order($1,'processing',NULL,NULL)",
          [orderId],
        ),
      ),
    ).rejects.toThrow();

    await expect(
      asUser("order-pro-two", (sql) =>
        sql.query(
          "SELECT beauty.advance_product_order($1,'processing',NULL,NULL)",
          [orderId],
        ),
      ),
    ).rejects.toThrow();
  });

  it("requires tracking to ship and permits the seller fulfilment sequence", async () => {
    await expect(
      asUser("order-pro", (sql) =>
        sql.query(
          "SELECT beauty.advance_product_order($1,'shipped',NULL,NULL)",
          [orderId],
        ),
      ),
    ).rejects.toThrow();

    await asUser("order-pro", (sql) =>
      sql.query(
        "SELECT beauty.advance_product_order($1,'processing',NULL,NULL)",
        [orderId],
      ),
    );

    await asUser("order-pro", (sql) =>
      sql.query(
        "SELECT beauty.advance_product_order($1,'shipped','Royal Mail','TRACK123')",
        [orderId],
      ),
    );

    const orders = await asUser("order-customer", (sql) =>
      customerProductOrders(sql, customerId),
    );
    expect(orders[0]).toMatchObject({
      status: "shipped",
      trackingCarrier: "Royal Mail",
      trackingNumber: "TRACK123",
    });

    await expect(
      asUser("order-pro", (sql) =>
        sql.query(
          "SELECT beauty.advance_product_order($1,'delivered',NULL,NULL)",
          [orderId],
        ),
      ),
    ).rejects.toThrow();
  });

  it("lets only the customer confirm tracked delivery", async () => {
    await expect(
      asUser("order-customer-two", (sql) =>
        confirmProductOrderDelivery(sql, orderId),
      ),
    ).rejects.toThrow();

    const delivered = await asUser("order-customer", (sql) =>
      confirmProductOrderDelivery(sql, orderId),
    );
    expect(delivered.status).toBe("delivered");

    const orders = await asUser("order-customer", (sql) =>
      customerProductOrders(sql, customerId),
    );
    expect(orders[0].status).toBe("delivered");
    expect(orders[0].deliveredAt).toBeTruthy();
  });

  it("releases product proceeds only after the 48 hour protection window", async () => {
    await db.query(
      "UPDATE beauty.product_orders SET professional_proceeds_pence=3600, delivered_at=now()-interval '49 hours' WHERE id=$1",
      [orderId],
    );

    await db.query(
      "SELECT beauty.record_financial_ledger($1,'proceeds_pending','product_order',$2,$3,'{}'::jsonb,$4::jsonb)",
      [
        `test-product-pending:${orderId}`,
        orderId,
        professionalId,
        JSON.stringify([
          { accountCode: "provider_clearing", amountPence: 3600 },
          { accountCode: "professional_pending", amountPence: -3600 },
        ]),
      ],
    );

    const before = await asUser("order-pro", professionalWallet);
    expect(before.pendingPence).toBeGreaterThanOrEqual(3600);

    const released = await asUser("order-pro", releaseMatureProductProceeds);
    expect(released).toBe(1);

    const after = await asUser("order-pro", professionalWallet);
    expect(after.availablePence).toBeGreaterThanOrEqual(3600);
  });
});
