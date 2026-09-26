import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { enrolAccount, type SqlClient } from "@/modules/accounts/repository";
import { updateProfile } from "@/modules/professionals/repository";
import {
  addCartItem,
  clearCart,
  customerCart,
  professionalProducts,
  publicProducts,
  saveProduct,
  setCartItem,
} from "@/modules/shop/repository";

const db = new PGlite();
let firstProfessional: string;
let secondProfessional: string;
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

beforeAll(async () => {
  const directory = new URL("../db/migrations/", import.meta.url);
  for (const file of (await readdir(directory))
    .filter((file) => file.endsWith(".sql"))
    .sort())
    await db.exec(await readFile(new URL(file, directory), "utf8"));

  for (const [authId, slug, business] of [
    ["shop-pro-one", "shop-studio-one", "Shop Studio One"],
    ["shop-pro-two", "shop-studio-two", "Shop Studio Two"],
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
    if (authId === "shop-pro-one")
      firstProfessional = account.professionalId!;
    else secondProfessional = account.professionalId!;

    await asUser(authId, (sql) =>
      updateProfile(sql, account.professionalId!, {
        slug,
        businessName: business,
        bio: "A published GLOHAUS professional used to test marketplace products.",
        city: "London",
        category: "Hair",
        publicationStatus: "published",
      }),
    );
  }

  for (const authId of ["shop-customer", "shop-customer-two"]) {
    await asUser(authId, (sql) =>
      enrolAccount(
        sql,
        {
          authId,
          email: `${authId}@example.test`,
          displayName:
            authId === "shop-customer" ? "Shop Customer" : "Other Customer",
          secondFactorAge: null,
        },
        "customer",
      ),
    );
  }
});

afterAll(() => db.close());

describe.sequential("Shop product catalogue", () => {
  it("keeps draft inventory private to the professional", async () => {
    const product = await asUser("shop-pro-one", (sql) =>
      saveProduct(sql, firstProfessional, {
        name: "Hydrating Hair Oil",
        description: "A lightweight finishing oil for styled hair.",
        sku: "OIL-001",
        pricePence: 2400,
        stockQuantity: 12,
        imageAssetId: null,
        publicationStatus: "draft",
      }),
    );
    productId = product.id;

    expect(
      await asUser("shop-pro-one", (sql) =>
        professionalProducts(sql, firstProfessional),
      ),
    ).toHaveLength(1);
    expect(await asUser("", publicProducts)).toEqual([]);
  });

  it("does not let another professional manage private inventory", async () => {
    expect(
      await asUser("shop-pro-two", (sql) =>
        professionalProducts(sql, firstProfessional),
      ),
    ).toEqual([]);

    expect(
      await asUser("shop-pro-two", (sql) =>
        saveProduct(
          sql,
          secondProfessional,
          {
            name: "Changed product",
            description: "",
            sku: "OTHER",
            pricePence: 500,
            stockQuantity: 1,
            imageAssetId: null,
            publicationStatus: "draft",
          },
          productId,
        ),
      ),
    ).toBeNull();
  });

  it("publishes only the safe catalogue projection", async () => {
    const published = await asUser("shop-pro-one", (sql) =>
      saveProduct(
        sql,
        firstProfessional,
        {
          name: "Hydrating Hair Oil",
          description: "A lightweight finishing oil for styled hair.",
          sku: "OIL-001",
          pricePence: 2400,
          stockQuantity: 12,
          imageAssetId: null,
          publicationStatus: "published",
        },
        productId,
      ),
    );
    expect(published?.publication_status).toBe("published");

    const catalogue = await asUser("", publicProducts);
    expect(catalogue).toHaveLength(1);
    expect(catalogue[0]).toMatchObject({
      id: productId,
      professional_id: firstProfessional,
      professional_name: "Shop Studio One",
      professional_slug: "shop-studio-one",
      name: "Hydrating Hair Oil",
      price_pence: 2400,
      in_stock: true,
    });
    expect(catalogue[0]).not.toHaveProperty("stock_quantity");
    expect(catalogue[0]).not.toHaveProperty("sku");
  });

  it("persists a private customer cart and increments atomically", async () => {
    const first = await asUser("shop-customer", (sql) =>
      addCartItem(sql, productId),
    );
    expect(first).toMatchObject({
      itemCount: 1,
      totalPence: 2400,
    });
    expect(first.items[0]).toMatchObject({
      productId,
      quantity: 1,
      available: true,
      inStockForQuantity: true,
      pricePence: 2400,
    });

    const second = await asUser("shop-customer", (sql) =>
      addCartItem(sql, productId),
    );
    expect(second).toMatchObject({
      itemCount: 2,
      totalPence: 4800,
    });
    expect(second.items[0].quantity).toBe(2);
  });

  it("keeps carts isolated between customers", async () => {
    expect(
      await asUser("shop-customer-two", (sql) => customerCart(sql)),
    ).toMatchObject({ itemCount: 0, totalPence: 0, items: [] });

    await expect(
      asUser("shop-customer-two", (sql) =>
        sql.query(
          "UPDATE beauty.cart_items SET quantity=5 WHERE product_id=$1",
          [productId],
        ),
      ),
    ).rejects.toThrow();
  });

  it("rejects quantities above current stock and supports exact updates", async () => {
    await expect(
      asUser("shop-customer", (sql) =>
        setCartItem(sql, productId, 13),
      ),
    ).rejects.toThrow();

    const updated = await asUser("shop-customer", (sql) =>
      setCartItem(sql, productId, 3),
    );
    expect(updated).toMatchObject({
      itemCount: 3,
      totalPence: 7200,
    });
  });

  it("prevents customer accounts from writing product inventory", async () => {
    await expect(
      asUser("shop-customer", (sql) =>
        sql.query(
          "INSERT INTO beauty.products(professional_id,name,price_pence,stock_quantity) VALUES($1,'Forged product',100,1)",
          [firstProfessional],
        ),
      ),
    ).rejects.toThrow();
  });

  it("removes archived inventory from the public catalogue", async () => {
    await asUser("shop-pro-one", (sql) =>
      saveProduct(
        sql,
        firstProfessional,
        {
          name: "Hydrating Hair Oil",
          description: "A lightweight finishing oil for styled hair.",
          sku: "OIL-001",
          pricePence: 2400,
          stockQuantity: 0,
          imageAssetId: null,
          publicationStatus: "archived",
        },
        productId,
      ),
    );
    expect(await asUser("", publicProducts)).toEqual([]);

    const cart = await asUser("shop-customer", (sql) => customerCart(sql));
    expect(cart.items[0]).toMatchObject({
      productId,
      quantity: 3,
      available: false,
      inStockForQuantity: false,
    });
    expect(cart.totalPence).toBe(0);

    expect(
      await asUser("shop-customer", (sql) => clearCart(sql)),
    ).toMatchObject({ itemCount: 0, totalPence: 0, items: [] });
  });
});
