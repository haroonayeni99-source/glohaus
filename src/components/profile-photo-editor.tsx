"use client";
import Image from "next/image";
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
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  return (
    <section className="editor-form profile-photo-editor">
      <div className="profile-photo-preview">
        {photo ? (
          <Image
            src={`/api/media/${photo.id}`}
            width={160}
            height={160}
            unoptimized
            alt={photo.alt_text}
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
              const base64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () =>
                  resolve(String(reader.result).split(",")[1]);
                reader.onerror = () =>
                  reject(new Error("Could not read this image."));
                reader.readAsDataURL(file);
              });
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
              type="file"
              accept="image/jpeg,image/png,image/webp"
              required
              disabled={busy}
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
            <button className="button" disabled={busy}>
              {photo ? "Replace photo" : "Upload profile photo"}
            </button>
            {photo && (
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
