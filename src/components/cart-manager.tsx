"use client";

import Image from "next/image";
import Link from "next/link";
import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { useState } from "react";
import type { CartOverview } from "@/modules/shop/domain";

function money(pence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(pence / 100);
}

export function CartManager({ initialCart }: { initialCart: CartOverview }) {
  const [cart, setCart] = useState(initialCart);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  async function change(productId: string, quantity: number) {
    setBusyId(productId);
    setNotice("");
    try {
      const response = await fetch("/api/v1/cart", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, quantity }),
      });
      const data = await response.json();
      if (!response.ok) {
        setNotice(
          data.error?.code === "INVALID_REQUEST"
            ? "That quantity is not available."
            : "Your cart could not be updated.",
        );
        return;
      }
      setCart(data.cart);
    } catch {
      setNotice("Your cart could not be updated.");
    } finally {
      setBusyId(null);
    }
  }

  async function checkout() {
    if (busyId !== null || hasUnavailable) return;
    setBusyId("checkout");
    setNotice("");
    try {
      const response = await fetch("/api/v1/shop/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = await response.json();
      if (!response.ok || !data.url) {
        setNotice(
          data.error?.code === "INVALID_REQUEST"
            ? "Checkout is not available for this cart right now."
            : "Secure checkout is temporarily unavailable.",
        );
        return;
      }
      window.location.assign(data.url);
    } catch {
      setNotice("Secure checkout is temporarily unavailable.");
    } finally {
      setBusyId(null);
    }
  }

  async function clear() {
    setBusyId("all");
    setNotice("");
    try {
      const response = await fetch("/api/v1/cart", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = await response.json();
      if (!response.ok) {
        setNotice("Your cart could not be cleared.");
        return;
      }
      setCart(data.cart);
    } catch {
      setNotice("Your cart could not be cleared.");
    } finally {
      setBusyId(null);
    }
  }

  if (!cart.items.length) {
    return (
      <section className="cart-empty">
        <ShoppingBag size={32} aria-hidden />
        <h2>Your cart is empty.</h2>
        <p>Published products you add from the GLOHAUS Shop will appear here.</p>
        <Link className="button" href="/shop">Browse products</Link>
      </section>
    );
  }

  const hasUnavailable = cart.items.some(
    (item) => !item.available || !item.inStockForQuantity,
  );

  return (
    <div className="cart-layout">
      <section className="cart-items" aria-label="Cart items">
        <div className="cart-section-heading">
          <div>
            <p className="eyebrow">YOUR CART</p>
            <h1>{cart.itemCount} item{cart.itemCount === 1 ? "" : "s"}</h1>
          </div>
          <button type="button" onClick={clear} disabled={busyId !== null}>
            Clear cart
          </button>
        </div>

        {cart.items.map((item) => {
          const unavailable = !item.available || !item.inStockForQuantity;
          return (
            <article className="cart-item" key={item.productId}>
              <div className="cart-item-image">
                {item.imageAssetId ? (
                  <Image
                    fill
                    unoptimized
                    sizes="96px"
                    src={`/api/media/${item.imageAssetId}`}
                    alt={item.name}
                  />
                ) : (
                  <ShoppingBag size={26} aria-hidden />
                )}
              </div>
              <div className="cart-item-copy">
                <Link href={`/p/${item.professionalSlug}`}>
                  {item.professionalName}
                </Link>
                <h2>{item.name}</h2>
                <strong>{money(item.pricePence)}</strong>
                {unavailable && (
                  <small className="cart-unavailable">
                    {!item.available
                      ? "This product is no longer available."
                      : "There is not enough stock for this quantity."}
                  </small>
                )}
              </div>
              <div className="cart-item-controls">
                <div className="cart-quantity" aria-label={`Quantity for ${item.name}`}>
                  <button
                    type="button"
                    aria-label="Decrease quantity"
                    disabled={busyId !== null}
                    onClick={() =>
                      change(item.productId, Math.max(0, item.quantity - 1))
                    }
                  >
                    <Minus size={14} aria-hidden />
                  </button>
                  <span>{item.quantity}</span>
                  <button
                    type="button"
                    aria-label="Increase quantity"
                    disabled={busyId !== null || item.quantity >= 20}
                    onClick={() => change(item.productId, item.quantity + 1)}
                  >
                    <Plus size={14} aria-hidden />
                  </button>
                </div>
                <button
                  type="button"
                  className="cart-remove"
                  aria-label={`Remove ${item.name}`}
                  disabled={busyId !== null}
                  onClick={() => change(item.productId, 0)}
                >
                  <Trash2 size={15} aria-hidden /> Remove
                </button>
              </div>
            </article>
          );
        })}
        {notice && <p className="cart-notice" role="status">{notice}</p>}
      </section>

      <aside className="cart-summary">
        <p className="eyebrow">ORDER SUMMARY</p>
        <div>
          <span>Items</span>
          <strong>{money(cart.totalPence)}</strong>
        </div>
        <div>
          <span>Delivery</span>
          <strong>Calculated later</strong>
        </div>
        <div className="cart-summary-total">
          <span>Current product total</span>
          <strong>{money(cart.totalPence)}</strong>
        </div>
        {hasUnavailable && (
          <p className="cart-summary-warning">
            Remove unavailable or over-stock items before checkout can open.
          </p>
        )}
        <button
          type="button"
          disabled={hasUnavailable || busyId !== null}
          onClick={checkout}
        >
          {busyId === "checkout" ? "Opening secure checkout…" : "Checkout securely"}
        </button>
        <p>
          Payment is completed securely with Stripe. Stock is reserved while
          checkout is open, and paid orders are created only after Stripe
          confirms the payment.
        </p>
        <Link href="/shop">Continue shopping</Link>
      </aside>
    </div>
  );
}
