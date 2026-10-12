"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function ReviewForm({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [published, setPublished] = useState(false);
  return (
    <form
      className="editor-form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy || published) return;
        const data = new FormData(event.currentTarget);
        setBusy(true);
        try {
          const response = await fetch("/api/v1/reviews", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              bookingId,
              rating: Number(data.get("rating")),
              body: data.get("body"),
              publicName: data.get("publicName"),
            }),
          });
          if (response.status === 409) {
            const result = await response.json();
            if (result.error?.code === "REVIEW_ALREADY_EXISTS") {
              setPublished(true);
              setNotice("You have already reviewed this appointment.");
              router.refresh();
              return;
            }
          }
          if (response.status === 403)
            throw new Error(
              "You can review only your own completed appointments after they have ended.",
            );
          if (!response.ok)
            throw new Error(
              "Your review could not be saved. Please refresh and try again.",
            );
          setPublished(true);
          setNotice(
            "Your review has been published. Thank you for sharing your experience.",
          );
          router.refresh();
        } catch (error) {
          setNotice(
            error instanceof Error ? error.message : "Could not save review.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>How was your appointment?</h2>
      <label>
        Public display name
        <input name="publicName" required maxLength={80} />
        <small>
          This name will appear alongside your review. You can use your first
          name.
        </small>
      </label>
      <label>
        Your rating
        <select name="rating" defaultValue="5">
          {[5, 4, 3, 2, 1].map((rating) => (
            <option key={rating} value={rating}>
              {rating} {rating === 1 ? "star" : "stars"}
            </option>
          ))}
        </select>
      </label>
      <label>
        Your experience
        <textarea name="body" required minLength={20} maxLength={2000} />
      </label>
      <button className="button" disabled={busy || published}>
        {published
          ? "Review published"
          : busy
            ? "Publishing…"
            : "Publish review"}
      </button>
      {notice && (
        <p role="status" className="form-notice">
          {notice}
        </p>
      )}
    </form>
  );
}
