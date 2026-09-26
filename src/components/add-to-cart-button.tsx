"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShoppingBag } from "lucide-react";
import { useState } from "react";

export function AddToCartButton({
  productId,
  disabled = false,
}: {
  productId: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function add() {
    if (busy || disabled) return;
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/v1/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, quantity: 1 }),
      });
      const data = await response.json();
      if (!response.ok) {
        const code = data.error?.code;
        if (code === "UNAUTHENTICATED") {
          router.push("/sign-in?returnTo=" + encodeURIComponent("/shop"));
          return;
        }
        if (code === "ONBOARDING_REQUIRED") {
          router.push("/onboarding");
          return;
        }
        if (code === "FORBIDDEN") {
          setNotice("A customer account is required to use the cart.");
          return;
        }
        throw new Error(
          code === "INVALID_REQUEST"
            ? "This product cannot be added right now."
            : "Cart is temporarily unavailable.",
        );
      }
      setNotice(
        `Added · ${data.cart?.itemCount ?? 1} item${
          data.cart?.itemCount === 1 ? "" : "s"
        } in cart`,
      );
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Cart is temporarily unavailable.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shop-add-wrap">
      <button
        type="button"
        className="shop-add-button"
        disabled={disabled || busy}
        onClick={add}
      >
        <ShoppingBag size={15} aria-hidden />
        {disabled ? "Out of stock" : busy ? "Adding…" : "Add to cart"}
      </button>
      {notice && (
        <small className="shop-add-notice" role="status">
          {notice}
          {notice.startsWith("Added") && (
            <>
              {" · "}
              <Link href="/cart">View cart</Link>
            </>
          )}
        </small>
      )}
    </div>
  );
}
