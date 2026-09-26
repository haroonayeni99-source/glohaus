import "server-only";

import type { SqlClient } from "@/modules/accounts/repository";
import type {
  ProductInput,
  ProfessionalProduct,
  PublicProduct,
  CartOverview,
} from "./domain";

export async function professionalProducts(
  db: SqlClient,
  professionalId: string,
) {
  return (
    await db.query<ProfessionalProduct>(
      `SELECT id,professional_id,image_asset_id,name,description,sku,
        price_pence,stock_quantity,publication_status,created_at,updated_at
       FROM beauty.products
       WHERE professional_id=$1
       ORDER BY updated_at DESC,id DESC`,
      [professionalId],
    )
  ).rows;
}

export async function saveProduct(
  db: SqlClient,
  professionalId: string,
  input: ProductInput,
  id?: string,
) {
  if (id) {
    return (
      await db.query<ProfessionalProduct>(
        `UPDATE beauty.products
         SET image_asset_id=$3,name=$4,description=$5,sku=$6,price_pence=$7,
             stock_quantity=$8,publication_status=$9,updated_at=now()
         WHERE id=$1 AND professional_id=$2
         RETURNING id,professional_id,image_asset_id,name,description,sku,
           price_pence,stock_quantity,publication_status,created_at,updated_at`,
        [
          id,
          professionalId,
          input.imageAssetId,
          input.name,
          input.description,
          input.sku,
          input.pricePence,
          input.stockQuantity,
          input.publicationStatus,
        ],
      )
    ).rows[0] ?? null;
  }

  return (
    await db.query<ProfessionalProduct>(
      `INSERT INTO beauty.products(
         professional_id,image_asset_id,name,description,sku,price_pence,
         stock_quantity,publication_status
       ) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id,professional_id,image_asset_id,name,description,sku,
         price_pence,stock_quantity,publication_status,created_at,updated_at`,
      [
        professionalId,
        input.imageAssetId,
        input.name,
        input.description,
        input.sku,
        input.pricePence,
        input.stockQuantity,
        input.publicationStatus,
      ],
    )
  ).rows[0];
}

export async function publicProducts(db: SqlClient) {
  return (
    await db.query<PublicProduct>(
      `SELECT id,professional_id,image_asset_id,name,description,price_pence,
        in_stock,professional_slug,professional_name,updated_at
       FROM beauty.public_products
       ORDER BY updated_at DESC,id DESC
       LIMIT 100`,
    )
  ).rows;
}


export async function customerCart(db: SqlClient): Promise<CartOverview> {
  const result = await db.query<{ data: CartOverview }>(
    "SELECT beauty.my_cart() AS data",
  );
  return result.rows[0]?.data ?? { items: [], totalPence: 0, itemCount: 0 };
}

export async function setCartItem(
  db: SqlClient,
  productId: string,
  quantity: number,
): Promise<CartOverview> {
  const result = await db.query<{ data: CartOverview }>(
    "SELECT beauty.set_cart_item($1,$2) AS data",
    [productId, quantity],
  );
  return result.rows[0].data;
}

export async function clearCart(db: SqlClient): Promise<CartOverview> {
  const result = await db.query<{ data: CartOverview }>(
    "SELECT beauty.clear_cart() AS data",
  );
  return result.rows[0].data;
}
