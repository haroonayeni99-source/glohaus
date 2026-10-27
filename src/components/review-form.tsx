"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  reviewQuestions,
  answerOptions,
  answerLabel,
} from "@/modules/reviews/domain";
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
          let photo;
          const file = data.get("photo");
          if (file instanceof File && file.size) {
            if (
              file.size > 3 * 1024 * 1024 ||
              !["image/jpeg", "image/png", "image/webp"].includes(file.type)
            )
              throw Error("Choose a JPEG, PNG or WebP photo under 3 MB.");
            if (data.get("photoConsent") !== "on")
              throw Error(
                "Please consent to public display of your photo, or remove it.",
              );
            const base64 = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () =>
                resolve(String(reader.result).split(",")[1]);
              reader.onerror = () =>
                reject(Error("Could not read your photo."));
              reader.readAsDataURL(file);
            });
            photo = {
              base64,
              altText: String(data.get("photoAlt") || "Appointment result"),
              consent: true,
            };
          }
          const response = await fetch("/api/v1/reviews", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              bookingId,
              rating: Number(data.get("rating")),
              body: data.get("body"),
              publicName: data.get("publicName"),
              answers: Object.fromEntries(
                reviewQuestions.flatMap(([key]) =>
                  data.get(key) ? [[key, data.get(key)]] : [],
                ),
              ),
              privateSuggestion: data.get("privateSuggestion") || "",
              ...(photo ? { photo } : {}),
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
        <select name="rating" aria-label="Your rating" defaultValue="" required>
          <option value="" disabled>
            Choose your overall rating
          </option>
          {[5, 4, 3, 2, 1].map((rating) => (
            <option key={rating} value={rating}>
              {rating} {rating === 1 ? "star" : "stars"}
            </option>
          ))}
        </select>
      </label>
      <details>
        <summary>Quick feedback (optional)</summary>
        <p>
          Your answers help your professional improve. They are shared privately
          with them.
        </p>
        {reviewQuestions.map(([key, question]) => (
          <label key={key}>
            {question}
            <select aria-label={question} name={key} defaultValue="">
              <option value="">Skip this question</option>
              {answerOptions[key].map((value) => (
                <option key={value} value={value}>
                  {answerLabel(value)}
                </option>
              ))}
            </select>
          </label>
        ))}
      </details>
      <label>
        Your experience (optional, public)
        <textarea name="body" maxLength={2000} />
      </label>
      <label>
        Private improvement suggestion (optional)
        <textarea name="privateSuggestion" maxLength={1000} />
        <small>
          Shared with your professional, separate from your public review. For
          sensitive concerns, contact GLOHAUS support.
        </small>
      </label>
      <details>
        <summary>Add a photo of your result (optional)</summary>
        <p>
          Share one relevant image, up to 3 MB. Avoid private details or other
          people unless you have their permission.
        </p>
        <label>
          Result photo
          <input
            name="photo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
          />
        </label>
        <label>
          Describe the photo
          <input
            name="photoAlt"
            maxLength={200}
            defaultValue="Appointment result"
          />
        </label>
        <label>
          <input type="checkbox" name="photoConsent" />I have permission to
          share this image and consent to displaying it publicly with my review.
        </label>
      </details>
      <p>
        <Link href={`/contact?reference=Booking%20${bookingId}`}>
          Report a sensitive concern privately
        </Link>
        . Your rating can be positive, mixed or negative.
      </p>
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
