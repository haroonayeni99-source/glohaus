"use client";
import Image from "next/image";
import { readImageFile } from "@/lib/image-file";
import {
  SOURCE_IMAGE_MAX_BYTES,
  VIDEO_MAX_BYTES,
  imageTypes,
  videoTypes,
} from "@/modules/media/limits";
import { upload } from "@vercel/blob/client";
import { useEffect, useRef, useState } from "react";
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
  const [uploadStage, setUploadStage] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [pendingVideoPath, setPendingVideoPath] = useState<string | null>(null);
  const uploadingRef = useRef(false);
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
    setUploadStage("Preparing photo…");
    const base64 = (await readImageFile(file)).split(",")[1];
    setUploadStage("Uploading photo…");
    await new Promise<void>((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open("POST", "/api/v1/professional/portfolio");
      request.setRequestHeader("Content-Type", "application/json");
      // Avoid an indefinitely spinning button on interrupted connections.
      request.timeout = 90_000;
      request.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        const percentage = Math.min(
          100,
          Math.round((event.loaded / event.total) * 100),
        );
        setProgress(percentage);
        setUploadStage(
          percentage === 100
            ? "Saving photo securely…"
            : `Uploading photo… ${percentage}%`,
        );
      };
      request.onload = () => {
        if (request.status >= 200 && request.status < 300) {
          resolve();
          return;
        }
        let errorCode = "";
        try {
          errorCode = JSON.parse(request.responseText)?.error?.code || "";
        } catch {
          // A non-JSON response is still reported as an upload failure.
        }
        reject(
          new Error(
            errorCode === "UNAUTHENTICATED"
              ? "Your session expired. Sign in again before uploading."
              : errorCode === "INVALID_REQUEST"
                ? "This photo was not accepted. Check the file and portfolio limit."
                : "Photo upload failed. Please try again.",
          ),
        );
      };
      request.onerror = () =>
        reject(new Error("Upload connection interrupted. Please try again."));
      request.ontimeout = () =>
        reject(new Error("Photo upload timed out. Check your connection and retry."));
      request.send(JSON.stringify({ base64, altText }));
    });
  }

  async function uploadVideo(file: File, altText: string): Promise<string> {
    if (file.size > VIDEO_MAX_BYTES)
      throw new Error("Videos must be 250 MB or smaller.");
    const extension =
      file.type === "video/webm"
        ? "webm"
        : file.type === "video/quicktime"
          ? "mov"
          : "mp4";
    setUploadStage("Starting secure video upload…");
    const blob = await upload(`portfolio/video-${crypto.randomUUID()}.${extension}`, file, {
      access: "private",
      handleUploadUrl: "/api/v1/professional/media-upload",
      contentType: file.type,
      multipart: file.size > 10 * 1024 * 1024,
      clientPayload: JSON.stringify({ altText }),
      onUploadProgress: ({ percentage }) => {
        const next = Math.min(100, Math.round(percentage));
        setProgress(next);
        setUploadStage(
          next === 100
            ? "Finishing secure video upload…"
            : `Uploading video… ${next}%`,
        );
      },
    });
    return blob.pathname;
  }

  // Direct video uploads are registered by an asynchronous Blob callback.
  // Confirm registration before claiming success or refreshing the portfolio.
  async function waitForVideoRegistration(path: string) {
    const deadline = Date.now() + 30_000;
    setProgress(null);
    setUploadStage("Adding video to your portfolio…");
    while (Date.now() < deadline) {
      let response: Response;
      try {
        response = await fetch(
          `/api/v1/professional/portfolio?path=${encodeURIComponent(path)}`,
          {
            cache: "no-store",
            signal: AbortSignal.timeout(Math.min(5000, Math.max(1, deadline - Date.now()))),
          },
        );
      } catch {
        throw new Error(
          "The video upload finished, but its status could not be checked. Press Upload media again to finish without reuploading.",
        );
      }
      if (response.ok && response.status !== 202) return;
      if (response.status !== 202)
        throw new Error(
          "The video upload finished, but could not be attached yet. Press Upload media again to retry without reuploading.",
        );
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error(
      "The video has uploaded but is still processing. Press Upload media again to check without reuploading.",
    );
  }

  return (
    <>
      <form
        className="editor-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (uploadingRef.current) return;
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

          if (
            imageTypes.includes(file.type as (typeof imageTypes)[number]) &&
            file.size > SOURCE_IMAGE_MAX_BYTES
          ) {
            setNotice("Images must be 20 MB or smaller.");
            return;
          }

          uploadingRef.current = true;
          setBusy(true);
          setProgress(null);
          setNotice("");
          try {
            if (imageTypes.includes(file.type as (typeof imageTypes)[number])) {
              await uploadImage(file, altText);
            } else {
              let path = pendingVideoPath;
              if (!path) {
                path = await uploadVideo(file, altText);
                setPendingVideoPath(path);
              }
              await waitForVideoRegistration(path);
            }

            setPendingVideoPath(null);
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
            uploadingRef.current = false;
            setBusy(false);
            setUploadStage("");
            setProgress(null);
          }
        }}
      >
        <h2>Share your work.</h2>
        <label>
          Photo or video
          <input
            onChange={(event) => {
              const file = event.target.files?.[0];
              setPendingVideoPath(null);
              setNotice("");
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
        {busy && (
          <div className="portfolio-upload-feedback" role="status" aria-live="polite">
            <span>{uploadStage || "Preparing your upload…"}</span>
            {progress !== null && (
              <progress max={100} value={progress} aria-label="Upload progress" />
            )}
          </div>
        )}
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
              <button
                type="button"
                className="button small"
                disabled={busy}
                onClick={async () => {
                  if (!window.confirm("Permanently delete this " + asset.media_type + "? This cannot be undone.")) return;
                  setBusy(true);
                  setNotice("");
                  try {
                    const response = await fetch(`/api/v1/professional/portfolio/${asset.id}`, { method: "DELETE" });
                    if (!response.ok) throw new Error("Could not delete media. It may still be used by a service or post.");
                    setNotice("Media permanently removed from your portfolio.");
                    router.refresh();
                  } catch (error) {
                    setNotice(error instanceof Error ? error.message : "Could not delete media.");
                  } finally { setBusy(false); }
                }}
              >
                Delete permanently
              </button>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
