"use client";

import "@/app/homepage-category-media.css";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { requireAdminResponse } from "@/lib/admin-response";
import { readImageFile } from "@/lib/image-file";
import {
  homepageCategories,
  categoryImage,
  type HomepageCategoryImages,
  type HomepageImageDevice,
} from "@/modules/platform/homepage-images";

export function HomepageCategoryMediaControl({
  initial = {},
}: {
  initial?: HomepageCategoryImages;
}) {
  const router = useRouter();
  const [images, setImages] = useState<HomepageCategoryImages>({
    desktop: { ...initial.desktop },
    mobile: { ...initial.mobile },
  });
  const [device, setDevice] = useState<HomepageImageDevice>("desktop");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  function change(key: string, value: string | null) {
    setImages((current) => ({
      ...current,
      [device]: { ...current[device], [key]: value },
    }));
    setNotice("Preview updated. Save category images to publish your changes.");
  }

  async function choose(file: File | undefined, key: string, label: string) {
    if (!file) return;
    setBusy(true);
    setNotice("");
    try {
      const image = await readImageFile(file);
      const response = await fetch("/api/v1/admin/homepage-media/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base64: image.split(",")[1],
          altText: `${device} ${label} category image`,
        }),
      });
      await requireAdminResponse(
        response,
        "Image could not be uploaded. Try a valid image up to 20 MB.",
      );
      const data = await response.json();
      change(key, data.url);
      if (!reason.trim()) setReason("Refresh homepage category imagery");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/v1/admin/homepage-media/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images, reason }),
      });
      await requireAdminResponse(
        response,
        "Category images could not be saved. Your preview is kept so you can retry.",
      );
      setNotice(
        "Category images saved. They are now published on the homepage.",
      );
      setReason("");
      router.refresh();
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Category images could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="editor-form owner-category-media" onSubmit={save}>
      <h3>Change category images</h3>
      <p className="lead">
        Choose a photo, check its circular preview, then save. Close-ups of
        finished nails, hair or the relevant body area work well. Desktop and
        mobile have separate images.
      </p>
      <label>
        Category images for
        <select
          value={device}
          disabled={busy}
          onChange={(event) => {
            setDevice(event.target.value as HomepageImageDevice);
            setNotice("");
          }}
        >
          <option value="desktop">Desktop homepage</option>
          <option value="mobile">Mobile homepage</option>
        </select>
      </label>
      <p className="muted">
        Mobile keeps its current photos unless you change them here. Changing a
        category image does not change its name or search link.
      </p>
      <div className="owner-category-media-grid">
        {homepageCategories[device].map((slot) => {
          const value =
            (images[device] as Record<string, string | null>)[slot.key] ?? "";
          const valid = !value || /^https:\/\//.test(value);
          return (
            <div
              className="owner-category-media-card"
              key={`${device}-${slot.key}`}
            >
              <div className="owner-category-media-title">
                <Image
                  src={valid ? categoryImage(images, device, slot) : slot.image}
                  alt={`${device === "desktop" ? "Desktop" : "Mobile"} ${slot.label} category preview`}
                  width={100}
                  height={100}
                  unoptimized
                />
                <h4>{slot.label}</h4>
              </div>
              <label>
                {slot.label} image
                <input
                  type="file"
                  aria-label={`${device} ${slot.label} category image`}
                  accept="image/jpeg,image/png,image/webp"
                  disabled={busy}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    void choose(file, slot.key, slot.label);
                  }}
                />
              </label>
              <small>
                JPEG, PNG or WebP · up to 20 MB. A square photo works best.
              </small>
              <details className="image-url-option">
                <summary>Or use an image link</summary>
                <label>
                  {slot.label} image URL
                  <input
                    type="url"
                    aria-label={`${device} ${slot.label} category image URL`}
                    inputMode="url"
                    placeholder="https://..."
                    disabled={busy}
                    maxLength={2048}
                    value={value}
                    onChange={(event) =>
                      change(slot.key, event.target.value.trim() || null)
                    }
                  />
                </label>
              </details>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  change(slot.key, null);
                  if (!reason.trim())
                    setReason(
                      `Restore ${device} ${slot.label} category default`,
                    );
                }}
              >
                Use default for {slot.label}
              </button>
            </div>
          );
        })}
      </div>
      <small>
        Choose images you have permission to use. Uploads stay private until you
        save.
      </small>
      <label>
        Reason for category image change
        <input
          disabled={busy}
          required
          minLength={5}
          maxLength={500}
          value={reason}
          placeholder="e.g. Refresh category photos"
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      <div className="editor-actions">
        <button className="button" disabled={busy || reason.trim().length < 5}>
          {busy ? "Saving…" : "Save category images"}
        </button>
      </div>
      {notice && (
        <p className="form-notice" role="status">
          {notice}
        </p>
      )}
    </form>
  );
}
