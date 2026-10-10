"use client";
import Image from "next/image";
import { readImageFile } from "@/lib/image-file";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function ProfilePhotoEditor({
  photo,
  published,
}: {
  photo: { id: string; alt_text: string } | null;
  published: boolean;
}) {
  const router = useRouter();
  const [currentPhoto, setCurrentPhoto] = useState(photo);
  const [preview, setPreview] = useState("");
  const [description, setDescription] = useState(photo?.alt_text ?? "Professional profile photo");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  return (
    <section className="editor-form profile-photo-editor">
      <div className="profile-photo-preview">
        {preview || currentPhoto ? (
          <Image
            src={preview || `/api/media/${currentPhoto!.id}`}
            width={160}
            height={160}
            unoptimized
            alt={description}
          />
        ) : (
          <span aria-label="No profile photo">✳</span>
        )}
      </div>
      <div>
        <h2>Your first impression.</h2>
        <p>
          Add a portrait or business logo.{" "}
          {published
            ? "Your photo will appear on your public profile as soon as it is saved."
            : "Your photo stays private until you publish your profile."}
        </p>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const data = new FormData(form);
            const file = data.get("photo");
            if (
              !(file instanceof File) ||
              !file.size ||
              file.size > 3 * 1024 * 1024 ||
              !["image/jpeg", "image/png", "image/webp"].includes(file.type)
            ) {
              setNotice("Choose a JPEG, PNG or WebP image up to 3 MB.");
              return;
            }
            setBusy(true);
            setNotice("");
            try {
              const base64 = (await readImageFile(file)).split(",")[1];
              const response = await fetch(
                "/api/v1/professional/profile/photo",
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    base64,
                    altText: data.get("altText"),
                  }),
                },
              );
              if (!response.ok)
                throw new Error(
                  "Could not upload. Use a valid image up to 3 MB and check that image storage is connected.",
                );
              const saved = await response.json();
              setCurrentPhoto({ id: saved.id, alt_text: description });
              setPreview("");
              setNotice("Profile photo saved.");
              form.reset();
              router.refresh();
            } catch (error) {
              setNotice(
                error instanceof Error ? error.message : "Upload failed.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Profile image
            <input
              name="photo"
              aria-label="Profile image"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              required
              disabled={busy}
              onChange={async event => {
                const file = event.target.files?.[0];
                if (!file) { setPreview(""); return; }
                try { setPreview(await readImageFile(file)); setNotice("Preview ready. Save when you are happy with your photo."); }
                catch (error) { setPreview(""); setNotice(error instanceof Error ? error.message : "Could not read this photo."); }
              }}
            />
            <small>
              JPEG, PNG or WebP · up to 3 MB. Large images are resized and
              location metadata removed.
            </small>
          </label>
          <label>
            Image description
            <input
              name="altText"
              value={description}
              onChange={event => setDescription(event.target.value)}
              minLength={3}
              maxLength={200}
              required
              placeholder="For example, Portrait of Maya at her studio"
              disabled={busy}
            />
          </label>
          <label className="policy-check">
            <input type="checkbox" required disabled={busy} />I have permission
            to use this image.
          </label>
          <div className="editor-actions">
            <button className="button" disabled={busy || !preview}>
              {busy ? "Saving…" : currentPhoto ? "Save new photo" : "Save profile photo"}
            </button>
            {currentPhoto && (
              <button
                className="text-link"
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const response = await fetch(
                      "/api/v1/professional/profile/photo",
                      {
                        method: "DELETE",
                        headers: { "Content-Type": "application/json" },
                      },
                    );
                    if (!response.ok)
                      throw new Error("Could not remove photo.");
                    setCurrentPhoto(null);
                    setPreview("");
                    setNotice("Profile photo removed.");
                    router.refresh();
                  } catch (error) {
                    setNotice(
                      error instanceof Error
                        ? error.message
                        : "Could not remove photo.",
                    );
                  } finally {
                    setBusy(false);
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
      </div>
    </section>
  );
}
