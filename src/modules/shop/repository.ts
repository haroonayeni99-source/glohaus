import "server-only";

import type { SqlClient } from "@/modules/accounts/repository";
import type {
  ProductInput,
  ProfessionalProduct,
  PublicProduct,
  CartOverview,
  ProductOrder,
  ShopCheckout,
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

export async function addCartItem(
  db: SqlClient,
  productId: string,
  quantity = 1,
): Promise<CartOverview> {
  const result = await db.query<{ data: CartOverview }>(
    "SELECT beauty.add_cart_item($1,$2) AS data",
    [productId, quantity],
  );
  return result.rows[0].data;
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


async function productOrders(
  db: SqlClient,
  column: "customer_id" | "professional_id",
  id: string,
): Promise<ProductOrder[]> {
  const result = await db.query<{
    id: string;
    professional_id: string;
    professional_name: string;
    status: ProductOrder["status"];
    subtotal_pence: number;
    delivery_pence: number;
    total_pence: number;
    recipient_name: string;
    address_line1: string;
    address_line2: string | null;
    city: string;
    postcode: string;
    country_code: string;
    tracking_carrier: string | null;
    tracking_number: string | null;
    shipped_at: Date | null;
    delivered_at: Date | null;
    created_at: Date;
    items: ProductOrder["items"];
  }>(
    `SELECT
      o.id,o.professional_id,o.professional_name,o.status,
      o.subtotal_pence,o.delivery_pence,o.total_pence,
      o.recipient_name,o.address_line1,o.address_line2,o.city,o.postcode,
      o.country_code,o.tracking_carrier,o.tracking_number,o.shipped_at,
      o.delivered_at,o.created_at,
      coalesce(jsonb_agg(
        jsonb_build_object(
          'id',i.id,
          'productId',i.product_id,
          'productName',i.product_name,
          'imageAssetId',i.image_asset_id,
          'unitPricePence',i.unit_price_pence,
          'quantity',i.quantity,
          'lineTotalPence',i.line_total_pence
        )
        ORDER BY i.id
      ) FILTER (WHERE i.id IS NOT NULL),'[]'::jsonb) AS items
     FROM beauty.product_orders o
     LEFT JOIN beauty.product_order_items i ON i.order_id=o.id
     WHERE o.${column}=$1
     GROUP BY o.id
     ORDER BY o.created_at DESC,o.id DESC
     LIMIT 100`,
    [id],
  );

  return result.rows.map((row) => ({
    id: row.id,
    professionalId: row.professional_id,
    professionalName: row.professional_name,
    status: row.status,
    subtotalPence: row.subtotal_pence,
    deliveryPence: row.delivery_pence,
    totalPence: row.total_pence,
    recipientName: row.recipient_name,
    addressLine1: row.address_line1,
    addressLine2: row.address_line2,
    city: row.city,
    postcode: row.postcode,
    countryCode: row.country_code,
    trackingCarrier: row.tracking_carrier,
    trackingNumber: row.tracking_number,
    shippedAt: row.shipped_at,
    deliveredAt: row.delivered_at,
    createdAt: row.created_at,
    items: row.items,
  }));
}

export function customerProductOrders(
  db: SqlClient,
  customerId: string,
) {
  return productOrders(db, "customer_id", customerId);
}

export function professionalProductOrders(
  db: SqlClient,
  professionalId: string,
) {
  return productOrders(db, "professional_id", professionalId);
}


export async function prepareShopCheckout(db: SqlClient): Promise<ShopCheckout> {
  const result = await db.query<{ data: ShopCheckout }>(
    "SELECT beauty.prepare_shop_checkout() AS data",
  );
  return result.rows[0].data;
}

export async function attachShopCheckoutSession(
  db: SqlClient,
  checkoutId: string,
  sessionId: string,
): Promise<ShopCheckout> {
  const result = await db.query<{ data: ShopCheckout }>(
    "SELECT beauty.attach_shop_checkout_session($1,$2) AS data",
    [checkoutId, sessionId],
  );
  return result.rows[0].data;
}

export async function releaseUnattachedShopCheckout(
  db: SqlClient,
  checkoutId: string,
) {
  await db.query(
    "SELECT beauty.release_unattached_shop_checkout($1)",
    [checkoutId],
  );
}
