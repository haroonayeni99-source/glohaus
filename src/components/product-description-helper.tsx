"use client";
import "./seller-tools.css";
import { useState } from "react";
import { productDescriptionDraft } from "@/modules/shop/seller";
export function ProductDescriptionHelper({
  name,
  onApply,
}: {
  name: string;
  onApply: (description: string) => void;
}) {
  const [facts, setFacts] = useState("");
  const [preview, setPreview] = useState("");
  return (
    <details className="seller-description-helper">
      <summary>Help me write this listing</summary>
      <p>
        Enter confirmed facts: size, quantity, materials or ingredients, how to
        use it and care instructions. This template formats your words; it does
        not check product claims.
      </p>
      <label>
        Confirmed product details
        <textarea
          value={facts}
          maxLength={1000}
          onChange={(e) => {
            setFacts(e.target.value);
            setPreview("");
          }}
        />
      </label>
      <button
        type="button"
        disabled={name.trim().length < 2 || !facts.trim()}
        onClick={() => setPreview(productDescriptionDraft(name, facts) ?? "")}
      >
        Prepare editable draft
      </button>
      {preview && (
        <>
          <label>
            Review your draft
            <textarea
              value={preview}
              maxLength={1200}
              onChange={(e) => setPreview(e.target.value)}
            />
          </label>
          <button type="button" onClick={() => onApply(preview)}>
            Use this description
          </button>
        </>
      )}
      <small>
        Review accuracy and safety information before publishing. Your listing
        is saved only when you save the product.
      </small>
    </details>
  );
}
