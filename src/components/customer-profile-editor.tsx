"use client";
import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { readImageFile } from "@/lib/image-file";
import type { CustomerProfile } from "@/modules/accounts/customer-profile";
export function CustomerProfileEditor({
  profile,
  userId,
}: {
  profile: CustomerProfile;
  userId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [hasPhoto, setHasPhoto] = useState(profile.has_photo);
  const [version, setVersion] = useState(0);
  const [preview, setPreview] = useState("");
  async function save(
    url: string,
    method: string,
    body: unknown,
    success: string,
  ) {
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok)
        throw new Error("Could not save. Check your details and try again.");
      setNotice(success);
      router.refresh();
      return true;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="customer-profile-editor editor-form">
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          await save(
            "/api/v1/account/profile",
            "PUT",
            {
              firstName: data.get("firstName"),
              lastName: data.get("lastName") || "",
            },
            "Your name has been saved.",
          );
        }}
      >
        <h2>Your name</h2>
        <p>
          Use your full name or just your first name. Professionals you book
          with can see this name. New bookings use your saved name; past booking
          details stay as they were.
        </p>
        <label>
          First name
          <input
            name="firstName"
            autoComplete="given-name"
            defaultValue={profile.first_name}
            maxLength={60}
            required
            disabled={busy}
          />
        </label>
        <label>
          Last name (optional)
          <input
            name="lastName"
            autoComplete="family-name"
            defaultValue={profile.last_name}
            maxLength={59}
            disabled={busy}
          />
        </label>
        <button className="button" disabled={busy}>
          {busy ? "Saving…" : "Save name"}
        </button>
      </form>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const file = new FormData(form).get("photo");
          if (!(file instanceof File) || !file.size) return;
          try {
            const base64 = (await readImageFile(file)).split(",")[1];
            if (
              await save(
                "/api/v1/account/profile/photo",
                "POST",
                { base64, altText: "Customer profile photo" },
                "Your photo has been saved.",
              )
            ) {
              setHasPhoto(true);
              setVersion((v) => v + 1);
              setPreview("");
              form.reset();
            }
          } catch (error) {
            setNotice(
              error instanceof Error
                ? error.message
                : "Could not read this image.",
            );
          }
        }}
      >
        <h2>Your photo (optional)</h2>
        <p>
          Add a photo of yourself so your professional can recognise you. It is
          visible to you and professionals you have booked with, and is not part
          of the public directory.
        </p>
        {(preview || hasPhoto) && (
          <Image
            className="customer-profile-portrait"
            src={preview || `/api/v1/customer-photos/${userId}?v=${version}`}
            width={120}
            height={120}
            alt="Your profile photo"
            unoptimized
          />
        )}
        <label>
          Choose a photo
          <input
            name="photo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            required
            disabled={busy}
            onChange={async (event) => {
              const file = event.currentTarget.files?.[0];
              setPreview("");
              if (!file) return;
              try {
                setPreview(await readImageFile(file));
                setNotice("Preview ready. Save your photo below.");
              } catch (error) {
                setNotice(
                  error instanceof Error
                    ? error.message
                    : "Could not read this image.",
                );
              }
            }}
          />
          <small>
            JPEG, PNG or WebP, up to 20 MB. Location metadata is removed.
          </small>
        </label>
        <label className="policy-check">
          <input type="checkbox" required disabled={busy} />
          This is my photo and I have permission to use it.
        </label>
        <div className="editor-actions">
          <button className="button" disabled={busy || !preview}>
            {busy ? "Saving…" : "Save photo"}
          </button>
          {hasPhoto && (
            <button
              type="button"
              className="text-link"
              disabled={busy}
              onClick={async () => {
                if (
                  await save(
                    "/api/v1/account/profile/photo",
                    "DELETE",
                    {},
                    "Photo removed.",
                  )
                ) {
                  setHasPhoto(false);
                  setPreview("");
                }
              }}
            >
              Remove photo
            </button>
          )}
        </div>
      </form>
      {notice && (
        <p className="form-notice" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}
