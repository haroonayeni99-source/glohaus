"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { readImageFile } from "@/lib/image-file";
import {
  SOURCE_IMAGE_MAX_BYTES,
  VIDEO_MAX_BYTES,
  imageTypes,
  videoTypes,
} from "@/modules/media/limits";

export type ContentMediaAsset = {
  id: string;
  alt_text: string;
  media_type: "image" | "video";
  publication_status?: "draft" | "published" | "hidden";
};

export function ContentMediaUpload({
  disabled,
  onUploaded,
  onUploading,
}: {
  disabled: boolean;
  onUploaded: (asset: ContentMediaAsset) => void;
  onUploading: (busy: boolean) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  async function registeredVideo(path: string): Promise<ContentMediaAsset> {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      const response = await fetch(
        `/api/v1/professional/portfolio?path=${encodeURIComponent(path)}`,
        {
          cache: "no-store",
          signal: AbortSignal.timeout(Math.min(5000, deadline - Date.now())),
        },
      );
      if (response.ok && response.status !== 202)
        return (await response.json()).asset;
      if (response.status !== 202)
        throw new Error(
          "Could not attach this upload. Your private upload is kept.",
        );
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error(
      "Your video is still processing. Press Upload and attach again to retry without uploading another copy.",
    );
  }

  return (
    <fieldset className="content-media-upload" disabled={disabled || busy}>
      <legend>Upload a photo or video</legend>
      <p>
        Choose a file here, then attach it to your post or Story. It stays
        private until you publish. Published media also appears in your
        portfolio.
      </p>
      <label>
        Choose photo or video
        <input
          ref={fileInput}
          type="file"
          accept={[...imageTypes, ...videoTypes].join(",")}
          onChange={(event) => {
            const chosen = event.target.files?.[0] ?? null;
            setFile(null);
            setPreview("");
            onUploading(false);
            setPendingPath(null);
            setNotice("");
            if (!chosen) return;
            const photo = (imageTypes as readonly string[]).includes(
              chosen.type,
            );
            const video = (videoTypes as readonly string[]).includes(
              chosen.type,
            );
            if (
              (!photo && !video) ||
              !chosen.size ||
              chosen.size > (video ? VIDEO_MAX_BYTES : SOURCE_IMAGE_MAX_BYTES)
            ) {
              setNotice(
                "Use JPEG, PNG or WebP up to 20 MB, or MP4, WebM or MOV up to 250 MB.",
              );
              return;
            }
            setFile(chosen);
            setPreview(URL.createObjectURL(chosen));
            onUploading(true);
          }}
        />
        <small>Photos up to 20 MB · Videos up to 250 MB</small>
      </label>
      {preview &&
        (file?.type.startsWith("video/") ? (
          <video
            className="content-media-preview"
            src={preview}
            controls
            playsInline
            preload="metadata"
            aria-label="Selected video preview"
          />
        ) : (
          <Image
            className="content-media-preview"
            src={preview}
            width={720}
            height={600}
            unoptimized
            alt={description || "Selected photo preview"}
          />
        ))}
      <label>
        Media description (optional)
        <input
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={200}
          placeholder="Describe this photo or video"
        />
        <small>Add a description to help people understand your work.</small>
      </label>
      <button
        className="button"
        type="button"
        disabled={disabled || busy || !file}
        onClick={async () => {
          if (!file) return;
          const altText =
            description.trim() ||
            (file.type.startsWith("image/")
              ? "Photo of my beauty work"
              : "Video of my beauty work");
          if (altText.length < 3) {
            setNotice(
              "Use at least 3 characters for the description, or leave it blank.",
            );
            return;
          }
          setBusy(true);
          onUploading(true);
          setNotice("Uploading privately…");
          let completed = false;
          try {
            let asset: ContentMediaAsset;
            if (file.type.startsWith("image/")) {
              const base64 = (await readImageFile(file)).split(",")[1];
              const response = await fetch("/api/v1/professional/portfolio", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ base64, altText }),
              });
              if (!response.ok) {
                const body = await response.json().catch(() => null);
                const code = body?.error?.code;
                throw new Error(
                  code === "UNAUTHENTICATED"
                    ? "Your session has expired. Sign in again to upload."
                    : code === "INVALID_REQUEST"
                      ? "This photo could not be accepted. Check the file or your portfolio limit, then try again."
                      : "Could not upload this photo. Please try again.",
                );
              }
              const saved = await response.json();
              asset = {
                id: saved.id,
                alt_text: altText,
                media_type: "image",
                publication_status: "draft",
              };
            } else {
              let path = pendingPath;
              if (!path) {
                const extension =
                  file.type === "video/webm"
                    ? "webm"
                    : file.type === "video/quicktime"
                      ? "mov"
                      : "mp4";
                const blob = await upload(
                  `portfolio/video-${crypto.randomUUID()}.${extension}`,
                  file,
                  {
                    access: "private",
                    handleUploadUrl: "/api/v1/professional/media-upload",
                    contentType: file.type,
                    multipart: file.size > 10 * 1024 * 1024,
                    clientPayload: JSON.stringify({
                      altText,
                    }),
                    onUploadProgress: ({ percentage }) =>
                      setNotice(`Uploading video… ${Math.round(percentage)}%`),
                  },
                );
                path = blob.pathname;
                setPendingPath(path);
              }
              setNotice("Preparing your video attachment…");
              asset = await registeredVideo(path);
            }
            onUploaded(asset);
            completed = true;
            setFile(null);
            setPreview("");
            if (fileInput.current) fileInput.current.value = "";
            setPendingPath(null);
            setNotice(
              "Media attached privately. Publish your post or Story when you are ready.",
            );
          } catch (error) {
            setNotice(
              error instanceof Error
                ? error.message
                : "Upload failed. Please try again.",
            );
          } finally {
            setBusy(false);
            onUploading(!completed);
          }
        }}
      >
        {busy ? "Uploading…" : "Upload and attach"}
      </button>
      {file && (
        <button
          type="button"
          onClick={() => {
            setFile(null);
            setPreview("");
            setPendingPath(null);
            setNotice("");
            onUploading(false);
            if (fileInput.current) fileInput.current.value = "";
          }}
        >
          Clear selected file
        </button>
      )}
      {notice && (
        <p className="form-notice" role="status">
          {notice}
        </p>
      )}
    </fieldset>
  );
}
