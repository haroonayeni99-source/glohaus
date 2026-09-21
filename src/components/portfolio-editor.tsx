"use client";
import Image from "next/image";

import { useState } from "react";
import { useRouter } from "next/navigation";
export type PortfolioAsset = {
  id: string;
  alt_text: string;
  publication_status: string;
};
export function PortfolioEditor({ assets }: { assets: PortfolioAsset[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  return (
    <>
      <form
        className="editor-form"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = new FormData(form);
          const file = data.get("image");
          if (
            !(file instanceof File) ||
            !file.size ||
            file.size > 3 * 1024 * 1024
          ) {
            setNotice("Choose a JPEG, PNG or WebP image up to 3 MB.");
            return;
          }
          setBusy(true);
          try {
            const base64 = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () =>
                resolve(String(reader.result).split(",")[1]);
              reader.onerror = () =>
                reject(new Error("Could not read this file."));
              reader.readAsDataURL(file);
            });
            const response = await fetch("/api/v1/professional/portfolio", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ base64, altText: data.get("altText") }),
            });
            if (!response.ok)
              throw new Error(
                "Upload failed. Check the image format and that storage is connected.",
              );
            setNotice(
              "Uploaded privately. Choose Publish when you are ready to share it.",
            );
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
        <h2>Let your work shine.</h2>
        <label>
          Your image
          <input
            name="image"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            required
          />
          <small>JPEG, PNG or WebP · up to 3 MB</small>
        </label>
        <label>
          Describe the image
          <input name="altText" minLength={3} maxLength={200} required />
          <small>
            A short description makes your portfolio accessible to everyone.
          </small>
        </label>
        <label className="policy-check">
          <input type="checkbox" required />I have permission to share this
          image, including consent from anyone pictured.
        </label>
        <button className="button" disabled={busy}>
          Upload to portfolio
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
              {}
              <Image
                width={1600}
                height={2000}
                unoptimized
                src={`/api/media/${asset.id}`}
                alt={asset.alt_text}
              />
            </div>
            <div className="portfolio-caption">
              <p>{asset.alt_text}</p>
              <small>{asset.publication_status}</small>
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
                      error instanceof Error
                        ? error.message
                        : "Could not save.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {asset.publication_status === "published"
                  ? "Hide image"
                  : "Publish image"}
              </button>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
