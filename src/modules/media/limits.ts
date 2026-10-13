export const SOURCE_IMAGE_MAX_BYTES = 20 * 1024 * 1024;
export const UPLOAD_IMAGE_MAX_BYTES = 3 * 1024 * 1024;
export const VIDEO_MAX_BYTES = 250 * 1024 * 1024;
export const imageTypes = ["image/jpeg", "image/png", "image/webp"] as const;
export const videoTypes = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
] as const;
