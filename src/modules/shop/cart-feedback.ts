const cartMessages = {
  SELLER_AWAY: "This seller is away and has paused new orders. You can remove the item or try again after they return.",
  PRODUCT_UNAVAILABLE:
    "This product is no longer available. Browse the Shop for another product.",
  INSUFFICIENT_STOCK:
    "There is not enough stock for that quantity. Try a smaller quantity.",
  INVALID_QUANTITY:
    "Choose a quantity between 1 and 20, or remove the item from your cart.",
  SELF_PURCHASE_NOT_ALLOWED: "You cannot buy your own products.",
} as const;

export function cartErrorMessage(code: unknown): string | undefined {
  if (typeof code !== "string" || !Object.hasOwn(cartMessages, code))
    return undefined;
  return cartMessages[code as keyof typeof cartMessages];
}
