"use client";
import "./seller-tools.css";
import { useState } from "react";
import Link from "next/link";
import type { ProductOrder } from "@/modules/shop/domain";
import { orderReplyDraft } from "@/modules/shop/seller";

export function ProductOrderReplyHelper({
  order,
}: {
  order: Pick<ProductOrder, "status" | "trackingCarrier" | "trackingNumber">;
}) {
  const [topic, setTopic] = useState<"status" | "issue">("status");
  const [draft, setDraft] = useState("");
  return (
    <details className="seller-reply-helper">
      <summary>Prepare a buyer reply</summary>
      <p>
        Choose a starting point, then review the wording before sharing it with
        the buyer.
      </p>
      <label>
        Reply topic
        <select
          value={topic}
          onChange={(event) => {
            setTopic(event.target.value as "status" | "issue");
            setDraft("");
          }}
        >
          <option value="status">Order status</option>
          <option value="issue">Order or return issue</option>
        </select>
      </label>
      <button
        type="button"
        onClick={() => setDraft(orderReplyDraft(order, topic))}
      >
        Prepare draft
      </button>
      {draft && (
        <>
          <label>
            Your editable reply
            <textarea
              maxLength={1200}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
          </label>
          <p>
            This draft has not been sent. Open{" "}
            <Link href="/messages?view=professional">buyer messages</Link>,
            select the correct customer and paste your reviewed reply.
          </p>
        </>
      )}
      <p>
        For an order review, keep the dispatch receipt, carrier tracking,
        relevant photos and buyer conversations.{" "}
        <Link href="/contact">Contact GLOHAUS support</Link> with the order
        reference. This does not automatically approve a return or refund.
      </p>
    </details>
  );
}
