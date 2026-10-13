"use client";
import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ContentMediaUpload,
  type ContentMediaAsset,
} from "./content-media-upload";
import type { Service } from "@/modules/professionals/domain";

type StoryRow = {
  id: string;
  asset_id: string;
  caption: string;
  expires_at: string;
  media_type: "image" | "video";
};

type StoryAsset = {
  id: string;
  alt_text: string;
  media_type: "image" | "video";
  publication_status?: "draft" | "published" | "hidden";
};

export function StoryEditor({
  stories,
  assets,
  services,
}: {
  stories: StoryRow[];
  assets: StoryAsset[];
  services: Service[];
}) {
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const [uploads, setUploads] = useState<ContentMediaAsset[]>([]);
  const media = [
    ...uploads.filter((item) => !assets.some((asset) => asset.id === item.id)),
    ...assets,
  ];
  const [selectedAsset, setSelectedAsset] = useState("");
  const [uploading, setUploading] = useState(false);
  function attach(asset: ContentMediaAsset) {
    setUploads((current) => [
      asset,
      ...current.filter((item) => item.id !== asset.id),
    ]);
    setSelectedAsset(asset.id);
  }

  return (
    <section className="story-editor">
      <div className="story-editor-heading">
        <div>
          <p className="pro-kicker">LIVE FOR 24 HOURS</p>
          <h2>GLOHAUS Stories</h2>
          <p>
            Share what you are working on right now. Stories disappear after 24
            hours and can link directly to one of your services.
          </p>
        </div>
      </div>

      {!!stories.length && (
        <div className="story-editor-list">
          {stories.map((story) => (
            <article key={story.id}>
              {story.media_type === "video" ? (
                <video
                  src={`/api/media/${story.asset_id}`}
                  muted
                  playsInline
                  preload="metadata"
                />
              ) : (
                <Image
                  src={`/api/media/${story.asset_id}`}
                  width={72}
                  height={72}
                  unoptimized
                  alt=""
                />
              )}
              <div>
                <strong>{story.caption || "Your Story"}</strong>
                <small>
                  Ends{" "}
                  {new Intl.DateTimeFormat("en-GB", {
                    hour: "2-digit",
                    minute: "2-digit",
                  }).format(new Date(story.expires_at))}
                </small>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const response = await fetch(
                      `/api/v1/professional/stories/${story.id}`,
                      {
                        method: "DELETE",
                        headers: { "Content-Type": "application/json" },
                      },
                    );
                    if (!response.ok)
                      throw new Error("Could not remove Story.");
                    router.refresh();
                  } catch (error) {
                    setNotice(
                      error instanceof Error
                        ? error.message
                        : "Could not remove Story.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Remove
              </button>
            </article>
          ))}
        </div>
      )}

      <form
        className="editor-form"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = new FormData(form);
          const assetId = String(data.get("assetId") || "");
          const serviceId = String(data.get("serviceId") || "") || null;
          const caption = String(data.get("caption") || "").trim();

          if (!assetId) {
            setNotice("Upload or choose a photo or video first.");
            return;
          }

          setBusy(true);
          setNotice("");
          try {
            const response = await fetch("/api/v1/professional/stories", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ assetId, serviceId, caption }),
            });
            if (!response.ok) throw new Error("Could not publish this Story.");
            setNotice("Story is live for 24 hours.");
            setSelectedAsset("");
            form.reset();
            router.refresh();
          } catch (error) {
            setNotice(
              error instanceof Error
                ? error.message
                : "Could not publish Story.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <ContentMediaUpload
          disabled={busy}
          onUploaded={attach}
          onUploading={setUploading}
        />
        <label>
          Photo or video
          <select
            name="assetId"
            required
            value={selectedAsset}
            disabled={busy || uploading}
            onChange={(event) => setSelectedAsset(event.target.value)}
          >
            <option value="" disabled>
              Choose uploaded or portfolio media
            </option>
            {media.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.media_type === "video" ? "Video" : "Photo"} ·{" "}
                {asset.alt_text}
                {asset.publication_status === "draft" ? " · Private draft" : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          What are you doing?
          <input
            name="caption"
            maxLength={240}
            placeholder="Fresh knotless braids today ✨"
          />
        </label>
        <label>
          Link a service (optional)
          <select name="serviceId" defaultValue="">
            <option value="">No service link</option>
            {services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="button"
          disabled={busy || uploading || !selectedAsset}
        >
          {busy ? "Publishing…" : "Add to Story"}
        </button>
      </form>
      {notice && (
        <p className="form-notice" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}
