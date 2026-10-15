"use client";
import Image from "next/image";
import { readImageFile } from "@/lib/image-file";
import {
  VIDEO_MAX_BYTES,
  imageTypes,
  videoTypes,
} from "@/modules/media/limits";
import { upload } from "@vercel/blob/client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export type PortfolioAsset = {
  speciality_ids?:string[];
  id: string;
  alt_text: string;
  publication_status: string;
  media_type: "image" | "video";
  mime_type: string;
};

export function PortfolioEditor({ assets,specialities=[] }: { assets: PortfolioAsset[];specialities?:{id:string;name:string}[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState<{
    url: string;
    type: string;
    name: string;
  } | null>(null);
  const [search, setSearch] = useState("");
  const [visibility, setVisibility] = useState("all");
  const visibleAssets = assets.filter(
    (asset) =>
      asset.alt_text.toLowerCase().includes(search.trim().toLowerCase()) &&
      (visibility === "all" || asset.publication_status === visibility),
  );
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview.url);
    },
    [preview],
  );

  async function uploadImage(file: File, altText: string) {
    const base64 = (await readImageFile(file)).split(",")[1];
    const response = await fetch("/api/v1/professional/portfolio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base64, altText }),
    });
    if (!response.ok)
      throw new Error(
        "Image upload failed. Check the format and storage connection.",
      );
  }

  async function uploadVideo(file: File, altText: string) {
    if (file.size > VIDEO_MAX_BYTES)
      throw new Error("Videos must be 250 MB or smaller.");
    const extension =
      file.type === "video/webm"
        ? "webm"
        : file.type === "video/quicktime"
          ? "mov"
          : "mp4";
    await upload(`portfolio/video-${crypto.randomUUID()}.${extension}`, file, {
      access: "private",
      handleUploadUrl: "/api/v1/professional/media-upload",
      contentType: file.type,
      multipart: file.size > 10 * 1024 * 1024,
      clientPayload: JSON.stringify({ altText }),
    });
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

          if (
            !([...imageTypes, ...videoTypes] as readonly string[]).includes(
              file.type,
            )
          ) {
            setNotice("Use JPEG, PNG, WebP, MP4, WebM or MOV.");
            return;
          }

          setBusy(true);
          setNotice("");
          try {
            if (imageTypes.includes(file.type as (typeof imageTypes)[number]))
              await uploadImage(file, altText);
            else await uploadVideo(file, altText);

            setNotice(
              "Uploaded privately. Publish it when you are ready to show it on GLOHAUS.",
            );
            form.reset();
            setPreview(null);
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
        <h2>Share your work.</h2>
        <label>
          Photo or video
          <input
            onChange={(event) => {
              const file = event.target.files?.[0];
              setPreview(
                file
                  ? {
                      url: URL.createObjectURL(file),
                      type: file.type,
                      name: file.name,
                    }
                  : null,
              );
            }}
            name="media"
            type="file"
            accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
            required
          />
          <small>
            Images: JPEG, PNG or WebP up to 20 MB · Videos: MP4, WebM or MOV up
            to 250 MB
          </small>
        </label>
        {preview && (
          <div className="portfolio-upload-preview">
            {preview.type.startsWith("video/") ? (
              <video src={preview.url} controls playsInline />
            ) : (
              <Image
                src={preview.url}
                width={480}
                height={360}
                unoptimized
                alt="Selected upload preview"
              />
            )}
            <small>{preview.name} · preview only, not published</small>
          </div>
        )}
        <label>
          Describe your work
          <input name="altText" minLength={3} maxLength={200} required />
          <small>
            This description is also used for accessibility and when choosing
            media for a post or Story.
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

      <div className="service-editor-tools">
        <label>
          Find portfolio media
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search descriptions"
          />
        </label>
        <label>
          Visibility
          <select
            value={visibility}
            onChange={(event) => setVisibility(event.target.value)}
          >
            <option value="all">All media</option>
            <option value="published">Published</option>
            <option value="draft">Private drafts</option>
            <option value="hidden">Hidden</option>
          </select>
        </label>
        <p role="status">
          {visibleAssets.length} of {assets.length} items shown
        </p>
      </div>
      {!visibleAssets.length && (
        <p className="lead">
          {assets.length
            ? "No photos or videos match. Clear your search or change the visibility filter."
            : "Show clients your work. Choose a photo or video above, add a description and upload it. It stays private until you publish it."}
        </p>
      )}
      <div className="portfolio-grid">
        {visibleAssets.map((asset) => (
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
              {!!specialities.length&&<form onSubmit={async e=>{e.preventDefault();const specialityIds=new FormData(e.currentTarget).getAll("specialityId");setBusy(true);try{const r=await fetch(`/api/v1/professional/portfolio/${asset.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({specialityIds})});if(!r.ok)throw Error();setNotice("Portfolio specialities saved.");router.refresh();}catch{setNotice("Could not save portfolio specialities.");}finally{setBusy(false);}}}><fieldset><legend>Shown under</legend>{specialities.map(s=><label className="policy-check" key={s.id}><input type="checkbox" name="specialityId" value={s.id} defaultChecked={asset.speciality_ids?.includes(s.id)}/>{s.name}</label>)}</fieldset><button disabled={busy}>Save specialities</button></form>}
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
