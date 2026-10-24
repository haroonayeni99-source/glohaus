"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function ReviewResponseForm({
  reviewId,
  body,
}: {
  reviewId: string;
  body: string;
}) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const router = useRouter();
  return (
    <details>
      <summary>
        {body ? "Edit professional response" : "Respond to this review"}
      </summary>
      <p>
        Reply respectfully. Do not share private contact details, health
        information or details about other customers. Moderation applies to
        responses as well as reviews.
      </p>
      <form
        className="editor-form"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setNotice("");
          const form = new FormData(event.currentTarget);
          try {
            const response = await fetch(
              `/api/v1/professional/reviews/${reviewId}/response`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ body: form.get("body") }),
              },
            );
            if (!response.ok) throw Error("Could not save the response.");
            setNotice(
              "Response saved. Any existing moderation restriction remains in place.",
            );
            router.refresh();
          } catch (error) {
            setNotice(
              error instanceof Error ? error.message : "Could not save.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Public professional response
          <textarea
            name="body"
            minLength={10}
            maxLength={1000}
            defaultValue={body}
            required
          />
        </label>
        <button disabled={busy} className="button">
          Save response
        </button>
        {notice && <p role="status">{notice}</p>}
      </form>
    </details>
  );
}
