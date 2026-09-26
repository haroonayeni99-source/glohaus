import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { enrolAccount, type SqlClient } from "@/modules/accounts/repository";
import { saveProduct } from "@/modules/shop/repository";

const db = new PGlite();

let customerId: string;
let professionalId: string;
let orderId: string;

async function asUser<T>(
  authId: string,
  verified: boolean,
  work: (sql: SqlClient) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE beauty_app");
    await tx.query("SELECT set_config('app.auth_id',$1,true)", [authId]);
    if (verified)
      await tx.query("SELECT set_config('app.admin_verified','true',true)");
    return work(tx);
  });
}

beforeAll(async () => {
  const directory = new URL("../db/migrations/", import.meta.url);
  for (const file of (await readdir(directory))
    .filter((file) => file.endsWith(".sql"))
    .sort())
    await db.exec(await readFile(new URL(file, directory), "utf8"));

  customerId = (
    await asUser("shop-admin-customer", false, (sql) =>
      enrolAccount(
        sql,
        {
          authId: "shop-admin-customer",
          email: "shop-admin-customer@example.test",
          displayName: "Shop Customer",
          secondFactorAge: null,
        },
        "customer",
      ),
    )
  ).id;

  const professional = await asUser("shop-admin-professional", false, (sql) =>
    enrolAccount(
      sql,
      {
        authId: "shop-admin-professional",
        email: "shop-admin-professional@example.test",
        displayName: "Shop Professional",
        secondFactorAge: null,
      },
      "professional",
    ),
  );
  professionalId = professional.professionalId!;

  await db.query(
    "UPDATE beauty.professional_profiles SET business_name='Admin Order Studio' WHERE id=$1",
    [professionalId],
  );

  const product = await asUser("shop-admin-professional", false, (sql) =>
    saveProduct(sql, professionalId, {
      name: "Admin Test Oil",
      description: "Fixture product for admin order visibility tests.",
      sku: "ADMIN-ORDER-1",
      pricePence: 2500,
      stockQuantity: 4,
      imageAssetId: null,
      publicationStatus: "draft",
    }),
  );

  const admin = await asUser("shop-admin-user", false, (sql) =>
    enrolAccount(
      sql,
      {
        authId: "shop-admin-user",
        email: "shop-admin-user@example.test",
        displayName: "Shop Admin",
        secondFactorAge: null,
      },
      "customer",
    ),
  );
  await db.query(
    "INSERT INTO beauty.user_roles(user_id,role) VALUES($1,'admin')",
    [admin.id],
  );

  orderId = (
    await db.query<{ id: string }>(
      `INSERT INTO beauty.product_orders(
        checkout_reference,provider_payment_intent_id,
        customer_id,professional_id,professional_name,
        subtotal_pence,delivery_pence,total_pence,
        recipient_name,address_line1,address_line2,city,postcode,country_code
      ) VALUES(
        gen_random_uuid(),'pi_admin_fixture',
        $1,$2,'Admin Order Studio',
        5000,399,5399,
        'Order Recipient','Fixture address',NULL,'London','SE1 1AA','GB'
      ) RETURNING id`,
      [customerId, professionalId],
    )
  ).rows[0].id;

  await db.query(
    `INSERT INTO beauty.product_order_items(
      order_id,product_id,product_name,image_asset_id,
      unit_price_pence,quantity,line_total_pence
    ) VALUES($1,$2,'Admin Test Oil',NULL,2500,2,5000)`,
    [orderId, product.id],
  );
});

afterAll(() => db.close());

describe("verified Admin Shop order overview", () => {
  it("rejects customers and admins without verified MFA context", async () => {
    await expect(
      asUser("shop-admin-customer", true, (sql) =>
        sql.query("SELECT beauty.admin_shop_order_overview()"),
      ),
    ).rejects.toThrow("FORBIDDEN");

    await expect(
      asUser("shop-admin-user", false, (sql) =>
        sql.query("SELECT beauty.admin_shop_order_overview()"),
      ),
    ).rejects.toThrow("FORBIDDEN");
  });

  it("returns bounded support data to a verified admin without full address", async () => {
    const result = await asUser("shop-admin-user", true, (sql) =>
      sql.query<{
        data: {
          counts: { total: number; paid: number };
          orders: Array<Record<string, unknown> & {
            id: string;
            professional_name: string;
            recipient_name: string;
            city: string;
            postcode: string;
            total_pence: number;
            items: { name: string; quantity: number; lineTotalPence: number }[];
          }>;
        };
      }>("SELECT beauty.admin_shop_order_overview() AS data"),
    );

    expect(result.rows[0].data.counts).toMatchObject({ total: 1, paid: 1 });
    expect(result.rows[0].data.orders[0]).toMatchObject({
      id: orderId,
      professional_name: "Admin Order Studio",
      recipient_name: "Order Recipient",
      city: "London",
      postcode: "SE1 1AA",
      total_pence: 5399,
      items: [
        {
          name: "Admin Test Oil",
          quantity: 2,
          lineTotalPence: 5000,
        },
      ],
    });
    expect(result.rows[0].data.orders[0]).not.toHaveProperty("address_line1");
  });

  it("does not broaden normal application-role order visibility", async () => {
    const direct = await asUser("shop-admin-user", true, (sql) =>
      sql.query<{ id: string }>("SELECT id FROM beauty.product_orders"),
    );
    expect(direct.rows).toEqual([]);
  });
});
