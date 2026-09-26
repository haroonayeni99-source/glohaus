"use client";

import { useMemo, useState } from "react";
import type { ProfessionalProduct } from "@/modules/shop/domain";
import { money } from "@/modules/professionals/domain";

type Asset = { id: string; alt_text: string };

type Draft = {
  id?: string;
  name: string;
  description: string;
  sku: string;
  price: string;
  stock: string;
  imageAssetId: string;
  publicationStatus: "draft" | "published" | "archived";
};

const emptyDraft: Draft = {
  name: "",
  description: "",
  sku: "",
  price: "",
  stock: "0",
  imageAssetId: "",
  publicationStatus: "draft",
};

export function ProfessionalProductsManager({
  initialProducts,
  assets,
}: {
  initialProducts: ProfessionalProduct[];
  assets: Asset[];
}) {
  const [products, setProducts] = useState(initialProducts);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const editing = useMemo(
    () => products.find((item) => item.id === draft.id) ?? null,
    [products, draft.id],
  );

  function edit(product: ProfessionalProduct) {
    setDraft({
      id: product.id,
      name: product.name,
      description: product.description,
      sku: product.sku || "",
      price: (product.price_pence / 100).toFixed(2),
      stock: String(product.stock_quantity),
      imageAssetId: product.image_asset_id || "",
      publicationStatus: product.publication_status,
    });
    setNotice("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const pricePence = Math.round(Number(draft.price) * 100);
    const stockQuantity = Number(draft.stock);
    if (!Number.isFinite(pricePence) || pricePence < 50) {
      setNotice("Enter a valid product price of at least £0.50.");
      return;
    }
    if (!Number.isInteger(stockQuantity) || stockQuantity < 0) {
      setNotice("Stock must be a whole number of 0 or more.");
      return;
    }

    setBusy(true);
    setNotice("");
    try {
      const response = await fetch(
        draft.id
          ? `/api/v1/professional/products/${draft.id}`
          : "/api/v1/professional/products",
        {
          method: draft.id ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: draft.name,
            description: draft.description,
            sku: draft.sku.trim() || null,
            pricePence,
            stockQuantity,
            imageAssetId: draft.imageAssetId || null,
            publicationStatus: draft.publicationStatus,
          }),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.error?.code === "INVALID_REQUEST"
            ? "Check the product details and try again."
            : "This product could not be saved.",
        );

      const product = data.product as ProfessionalProduct;
      setProducts((current) => {
        const exists = current.some((item) => item.id === product.id);
        return exists
          ? current.map((item) => (item.id === product.id ? product : item))
          : [product, ...current];
      });
      setDraft(emptyDraft);
      setNotice("Product saved.");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "This product could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pro-products-layout">
      <section className="pro-panel pro-product-editor">
        <div className="pro-panel-title">
          <div>
            <p className="pro-kicker">{editing ? "EDIT PRODUCT" : "NEW PRODUCT"}</p>
            <h2>{editing ? editing.name : "Add something to your shop"}</h2>
          </div>
          {editing && (
            <button type="button" onClick={() => setDraft(emptyDraft)}>
              New product
            </button>
          )}
        </div>

        <form onSubmit={save}>
          <label>
            Product name
            <input
              value={draft.name}
              maxLength={120}
              required
              onChange={(event) =>
                setDraft((current) => ({ ...current, name: event.target.value }))
              }
            />
          </label>
          <label>
            Description
            <textarea
              value={draft.description}
              maxLength={1200}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
            />
          </label>
          <div className="pro-product-grid-fields">
            <label>
              Price (£)
              <input
                value={draft.price}
                inputMode="decimal"
                placeholder="25.00"
                required
                onChange={(event) =>
                  setDraft((current) => ({ ...current, price: event.target.value }))
                }
              />
            </label>
            <label>
              Stock
              <input
                value={draft.stock}
                inputMode="numeric"
                required
                onChange={(event) =>
                  setDraft((current) => ({ ...current, stock: event.target.value }))
                }
              />
            </label>
          </div>
          <label>
            SKU (optional)
            <input
              value={draft.sku}
              maxLength={80}
              onChange={(event) =>
                setDraft((current) => ({ ...current, sku: event.target.value }))
              }
            />
          </label>
          <label>
            Product image
            <select
              value={draft.imageAssetId}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  imageAssetId: event.target.value,
                }))
              }
            >
              <option value="">No image</option>
              {assets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.alt_text}
                </option>
              ))}
            </select>
          </label>
          <label>
            Visibility
            <select
              value={draft.publicationStatus}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  publicationStatus: event.target.value as Draft["publicationStatus"],
                }))
              }
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </label>
          <button className="pro-pink-button" disabled={busy}>
            {busy ? "Saving…" : editing ? "Save changes" : "Create product"}
          </button>
          {notice && <p className="form-notice" role="status">{notice}</p>}
        </form>
      </section>

      <section className="pro-panel">
        <div className="pro-panel-title">
          <h2>Your products</h2>
          <span>{products.length}</span>
        </div>
        {products.length ? (
          <div className="pro-product-list">
            {products.map((product) => (
              <button type="button" key={product.id} onClick={() => edit(product)}>
                <span>
                  <strong>{product.name}</strong>
                  <small>
                    {money(product.price_pence)} · {product.stock_quantity} in stock
                  </small>
                </span>
                <span className={`pro-status pro-product-${product.publication_status}`}>
                  {product.publication_status}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="pro-page-lead">
            No products yet. Add your first product when you are ready.
          </p>
        )}
      </section>
    </div>
  );
}
