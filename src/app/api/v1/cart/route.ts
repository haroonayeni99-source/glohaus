import { withAccount } from "@/lib/api-account";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
import { cartItemInputSchema } from "@/modules/shop/domain";
import {
  addCartItem,
  clearCart,
  customerCart,
  setCartItem,
} from "@/modules/shop/repository";

export async function GET() {
  try {
    const cart = await withAccount("customer", (db) => customerCart(db));
    return json({ cart });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const parsed = cartItemInputSchema.safeParse(await smallJson(request, 2048));
    if (!parsed.success || parsed.data.quantity < 1)
      throw new AccessError("INVALID_REQUEST", 400);

    const cart = await withAccount("customer", (db) =>
      addCartItem(db, parsed.data.productId, parsed.data.quantity),
    );
    return json({ cart }, 201);
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const parsed = cartItemInputSchema.safeParse(await smallJson(request, 2048));
    if (!parsed.success) throw new AccessError("INVALID_REQUEST", 400);

    const cart = await withAccount("customer", (db) =>
      setCartItem(db, parsed.data.productId, parsed.data.quantity),
    );
    return json({ cart });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const cart = await withAccount("customer", (db) => clearCart(db));
    return json({ cart });
  } catch (error) {
    return apiError(error);
  }
}
