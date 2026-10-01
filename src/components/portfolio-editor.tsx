"use client";
import Image from "next/image";
import { upload } from "@vercel/blob/client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export type PortfolioAsset = {
  id: string;
  alt_text: string;
  publication_status: string;
  media_type: "image" | "video";
  mime_type: string;
};

export function PortfolioEditor({ assets }: { assets: PortfolioAsset[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function uploadImage(file: File, altText: string) {
    if (file.size > 3 * 1024 * 1024)
      throw new Error("Images must be 3 MB or smaller.");
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.onerror = () => reject(new Error("Could not read this image."));
      reader.readAsDataURL(file);
    });
    const response = await fetch("/api/v1/professional/portfolio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base64, altText }),
    });
    if (!response.ok)
      throw new Error("Image upload failed. Check the format and storage connection.");
  }

  async function uploadVideo(file: File, altText: string) {
    if (file.size > 50 * 1024 * 1024)
      throw new Error("Videos must be 50 MB or smaller.");
    const extension =
      file.type === "video/webm"
        ? "webm"
        : file.type === "video/quicktime"
          ? "mov"
          : "mp4";
    await upload(
      `portfolio/video-${crypto.randomUUID()}.${extension}`,
      file,
      {
        access: "private",
        handleUploadUrl: "/api/v1/professional/media-upload",
        contentType: file.type,
        multipart: file.size > 10 * 1024 * 1024,
        clientPayload: JSON.stringify({ altText }),
      },
    );
  }

  return (
    <>
      <form
        className="editor-form"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = new FormData(form);
          const file = data.get("media");
          const altText = String(data.get("altText") || "").trim();

          if (!(file instanceof File) || !file.size) {
            setNotice("Choose an image or short video.");
            return;
          }
          if (altText.length < 3 || altText.length > 200) {
            setNotice("Add a short description between 3 and 200 characters.");
            return;
          }

          const imageTypes = ["image/jpeg", "image/png", "image/webp"];
          const videoTypes = ["video/mp4", "video/webm", "video/quicktime"];
          if (![...imageTypes, ...videoTypes].includes(file.type)) {
            setNotice("Use JPEG, PNG, WebP, MP4, WebM or MOV.");
            return;
          }

          setBusy(true);
          setNotice("");
          try {
            if (imageTypes.includes(file.type)) await uploadImage(file, altText);
            else await uploadVideo(file, altText);

            setNotice(
              "Uploaded privately. Publish it when you are ready to show it on GLOHAUS.",
            );
            form.reset();
            router.refresh();
          } catch (error) {
            setNotice(error instanceof Error ? error.message : "Upload failed.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <h2>Share your work.</h2>
        <label>
          Photo or video
          <input
            name="media"
            type="file"
            accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
            required
          />
          <small>
            Images: JPEG, PNG or WebP up to 3 MB · Videos: MP4, WebM or MOV up to 50 MB
          </small>
        </label>
        <label>
          Describe your work
          <input name="altText" minLength={3} maxLength={200} required />
          <small>
            This description is also used for accessibility and when choosing media for a post or Story.
          </small>
        </label>
        <label className="policy-check">
          <input type="checkbox" required />I have permission to share this
          media, including consent from anyone pictured.
        </label>
        <button className="button" disabled={busy}>
          {busy ? "Uploading…" : "Upload media"}
        </button>
      </form>

      {notice && (
        <p role="status" className="form-notice">
          {notice}
        </p>
      )}

      <div className="portfolio-grid">
        {assets.map((asset) => (
          <article key={asset.id}>
            <div className="portfolio-image">
              {asset.media_type === "video" ? (
                <video
                  src={`/api/media/${asset.id}`}
                  controls
                  playsInline
                  preload="metadata"
                  aria-label={asset.alt_text}
                />
              ) : (
                <Image
                  width={1600}
                  height={2000}
                  unoptimized
                  src={`/api/media/${asset.id}`}
                  alt={asset.alt_text}
                />
              )}
            </div>
            <div className="portfolio-caption">
              <p>{asset.alt_text}</p>
              <small>
                {asset.media_type} · {asset.publication_status}
              </small>
              <button
                disabled={busy}
                className="button small"
                onClick={async () => {
                  setBusy(true);
                  try {
                    const response = await fetch(
                      `/api/v1/professional/portfolio/${asset.id}`,
                      {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          status:
                            asset.publication_status === "published"
                              ? "hidden"
                              : "published",
                        }),
                      },
                    );
                    if (!response.ok)
                      throw new Error("Could not change visibility.");
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
                {asset.publication_status === "published"
                  ? "Hide media"
                  : "Publish media"}
              </button>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
