"use client";

export function ShopCatalogueRetry() {
  return (
    <button
      className="button"
      type="button"
      onClick={() => window.location.reload()}
    >
      Try again
    </button>
  );
}
