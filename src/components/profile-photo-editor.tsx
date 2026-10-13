"use client";
import Image from "next/image";
import { readImageFile } from "@/lib/image-file";
import { useRef, useState } from "react";
import { SOURCE_IMAGE_MAX_BYTES, imageTypes } from "@/modules/media/limits";
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
  const [description, setDescription] = useState(
    photo?.alt_text ?? "Professional profile photo",
  );
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [imageStyle, setImageStyle] = useState<"photo" | "logo">("photo");
  const [preparing, setPreparing] = useState(false);
  const selectedFile = useRef<File | null>(null);
  const preparation = useRef(0);

  async function prepare(file: File | null, style: "photo" | "logo") {
    selectedFile.current = file;
    const sequence = ++preparation.current;
    setPreview("");
    if (!file) {
      setPreparing(false);
      return;
    }
    setPreparing(true);
    setNotice("Preparing your image…");
    try {
      const result = await readImageFile(file, { logo: style === "logo" });
      if (sequence !== preparation.current) return;
      setPreview(result);
      setNotice(
        style === "logo"
          ? "Full logo preview ready. Save to apply."
          : "Preview ready. Save when you are happy with your photo.",
      );
    } catch (error) {
      if (sequence === preparation.current)
        setNotice(
          error instanceof Error ? error.message : "Could not read this photo.",
        );
    } finally {
      if (sequence === preparation.current) setPreparing(false);
    }
  }
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
              file.size > SOURCE_IMAGE_MAX_BYTES ||
              !imageTypes.includes(file.type as (typeof imageTypes)[number]) ||
              !preview
            ) {
              setNotice(
                "Choose a JPEG, PNG or WebP image up to 20 MB and wait for the preview.",
              );
              return;
            }
            setBusy(true);
            setNotice("");
            try {
              const base64 = preview.split(",")[1];
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
                  "Could not upload. Your preview is kept so you can try saving again.",
                );
              const saved = await response.json();
              setCurrentPhoto({ id: saved.id, alt_text: description });
              setPreview("");
              setNotice("Profile photo saved.");
              form.reset();
              selectedFile.current = null;
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
            Profile image style
            <select
              value={imageStyle}
              disabled={busy || preparing}
              onChange={(event) => {
                const style = event.target.value as "photo" | "logo";
                setImageStyle(style);
                void prepare(selectedFile.current, style);
              }}
            >
              <option value="photo">Photo · fill the frame</option>
              <option value="logo">Business logo · show the whole image</option>
            </select>
            <small>
              The logo option keeps the complete design visible in profile and
              listing images.
            </small>
          </label>
          <label>
            Profile image
            <input
              name="photo"
              aria-label="Profile image"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              required
              disabled={busy}
              onChange={(event) =>
                void prepare(event.target.files?.[0] ?? null, imageStyle)
              }
            />
            <small>
              JPEG, PNG or WebP · up to 20 MB. Large images are optimized and
              location metadata removed.
            </small>
          </label>
          <label>
            Image description
            <input
              name="altText"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
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
            <button className="button" disabled={busy || preparing || !preview}>
              {busy
                ? "Saving…"
                : currentPhoto
                  ? "Save new photo"
                  : "Save profile photo"}
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
