import "server-only";
import { randomUUID } from "node:crypto";
import { put, del } from "@vercel/blob";
import { sanitizeImage } from "@/modules/media/image";
export class ReviewPhotoInputError extends Error {}
export async function prepareReviewPhoto(photo: {
  base64: string;
  altText: string;
  consent: true;
}) {
  let image: Buffer;
  try {
    image = await sanitizeImage(Buffer.from(photo.base64, "base64"));
  } catch {
    throw new ReviewPhotoInputError("INVALID_REVIEW_PHOTO");
  }
  const id = randomUUID();
  const blob = await put(`reviews/${id}.webp`, image, {
    access: "private",
    contentType: "image/webp",
    addRandomSuffix: true,
  });
  return { id, path: blob.pathname, url: blob.url, altText: photo.altText };
}
export async function discardReviewPhoto(photo: { url: string }) {
  await del(photo.url).catch(() =>
    console.warn("Review upload cleanup pending"),
  );
}
