"use client";
import { requireAdminResponse } from "@/lib/admin-response";

import { readImageFile } from "@/lib/image-file";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Image from "next/image";

function previewUrl(value: string) {
  try { const url = new URL(value); return url.protocol === "https:" ? value : null; }
  catch { return null; }
}

export function HomepageMediaControl({
  initial,
}: {
  initial: { desktopHero: string | null; mobileHero: string | null };
}) {
  const router = useRouter();
  const [desktopHero, setDesktopHero] = useState(initial.desktopHero ?? "");
  const [mobileHero, setMobileHero] = useState(initial.mobileHero ?? "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function choose(file: File | undefined, target: "desktop" | "mobile") {
    if (!file) return;
    setBusy(true); setNotice("");
    try {
      const image = await readImageFile(file);
      const response = await fetch("/api/v1/admin/homepage-media/upload", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64: image.split(",")[1], altText: `${target} homepage image` }),
      });
      await requireAdminResponse(response, "Image could not be uploaded. Try a valid image up to 3 MB.");
      const data = await response.json();
      if (target === "desktop") setDesktopHero(data.url); else setMobileHero(data.url);
      if (!reason.trim()) setReason("Refresh homepage imagery");
      setNotice("Image uploaded for preview. Save homepage images to publish it.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Upload failed."); }
    finally { setBusy(false); }
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/v1/admin/homepage-media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          desktopHero: desktopHero.trim() || null,
          mobileHero: mobileHero.trim() || null,
          reason,
        }),
      });
      await requireAdminResponse(response, "Homepage imagery could not be saved.");
      setNotice("Homepage model imagery updated.");
      setReason("");
      router.refresh();
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Homepage imagery could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="editor-form" onSubmit={save}>
      <h3>Change homepage images</h3>
      <p className="lead">
        Choose a photo from your device, check the preview, then save. Desktop and mobile can use different images. Use the defaults to restore the original photos.
      </p>

      <label>Desktop homepage image
        <input type="file" aria-label="Desktop homepage image" accept="image/jpeg,image/png,image/webp" disabled={busy}
          onChange={event => void choose(event.target.files?.[0], "desktop")} />
        <small>JPEG, PNG or WebP · up to 3 MB. Choose an image you have permission to use.</small>
      </label>
      <details className="image-url-option"><summary>Or use a desktop image link</summary><label>
        Desktop hero model image URL
        <input
          type="url"
          inputMode="url"
          placeholder="https://..."
          disabled={busy}
          value={desktopHero}
          onChange={(event) => setDesktopHero(event.target.value)}
        />
      </label>
      </details>
      {previewUrl(desktopHero) && (
        <div className="owner-homepage-media-preview">
          <Image
            src={desktopHero}
            alt="Desktop homepage model preview"
            width={560}
            height={320}
            unoptimized
          />
        </div>
      )}

      <label>Mobile homepage image
        <input type="file" aria-label="Mobile homepage image" accept="image/jpeg,image/png,image/webp" disabled={busy}
          onChange={event => void choose(event.target.files?.[0], "mobile")} />
        <small>A portrait image works best. Choose an image you have permission to use.</small>
      </label>
      <details className="image-url-option"><summary>Or use a mobile image link</summary><label>
        Mobile hero model image URL
        <input
          type="url"
          inputMode="url"
          placeholder="https://..."
          disabled={busy}
          value={mobileHero}
          onChange={(event) => setMobileHero(event.target.value)}
        />
      </label>
      </details>
      {previewUrl(mobileHero) && (
        <div className="owner-homepage-media-preview">
          <Image
            src={mobileHero}
            alt="Mobile homepage model preview"
            width={360}
            height={420}
            unoptimized
          />
        </div>
      )}

      <label>
        Reason for change
        <input
          disabled={busy}
          value={reason}
          minLength={5}
          maxLength={500}
          required
          placeholder="e.g. Refresh homepage imagery for a more relatable campaign"
          onChange={(event) => setReason(event.target.value)}
        />
      </label>

      <div className="editor-actions">
        <button className="button" disabled={busy || reason.trim().length < 5}>
          {busy ? "Saving…" : "Save homepage images"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setDesktopHero("");
            setMobileHero("");
            if (!reason.trim()) setReason("Restore original homepage images");
            setNotice("Defaults selected. Save to apply.");
          }}
        >
          Use GLOHAUS defaults
        </button>
      </div>

      {notice && <p className="form-notice" role="status">{notice}</p>}
    </form>
  );
}
