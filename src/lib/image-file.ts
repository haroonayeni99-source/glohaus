import {
  SOURCE_IMAGE_MAX_BYTES,
  UPLOAD_IMAGE_MAX_BYTES,
  imageTypes,
} from "@/modules/media/limits";

// Phone cameras sometimes supply HEIC/HEIF or a JPEG without a MIME type.
// Browser-supported formats are converted to WebP before they reach the server;
// the server continues to verify the converted image bytes independently.
const extraImageTypes = ["image/heic", "image/heif", "image/avif"] as const;
const imageExtensions = /\.(?:jpe?g|png|webp|heic|heif|avif)$/i;
export const imageInputAccept = [...imageTypes, ...extraImageTypes, ".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".avif"].join(",");

export function isSupportedImageFile(file: File): boolean {
  const type = file.type.toLowerCase();
  return (
    (imageTypes as readonly string[]).includes(type) ||
    (extraImageTypes as readonly string[]).includes(type) ||
    ((!type || type === "application/octet-stream") && imageExtensions.test(file.name))
  );
}

function isHeifFile(file: File): boolean {
  return /^(?:image\/heic|image\/heif)$/.test(file.type.toLowerCase()) ||
    /\.(?:heic|heif)$/i.test(file.name);
}

function readDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read this image."));
    reader.readAsDataURL(file);
  });
}

function imageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(
        new Error("Could not read this image. Try a JPEG, PNG or WebP file."),
      );
    image.src = url;
  });
}

export async function readImageFile(
  file: File,
  options: { logo?: boolean; profile?: boolean } = {},
): Promise<string> {
  if (
    !file.size ||
    file.size > SOURCE_IMAGE_MAX_BYTES ||
    !isSupportedImageFile(file)
  )
    throw new Error("Choose a JPEG, PNG, WebP, AVIF or HEIC/HEIF photo up to 20 MB.");
  // Large originals are optimized before reaching the request-body limit.
  // The server still verifies and sanitizes the resulting image independently.
  const url = URL.createObjectURL(file);
  try {
    const image = await imageFromUrl(url).catch(() => {
      if (isHeifFile(file))
        throw new Error("This browser cannot open this HEIC/HEIF photo. Save or share it as JPEG, then try again.");
      throw new Error("Could not open this photo. Try a JPEG, PNG or WebP image.");
    });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error("Image preparation is unavailable in this browser.");
    if (options.logo) {
      canvas.width = canvas.height = 800;
      // Keep every corner inside circular profile frames as well as square ones.
      const scale = 720 / Math.hypot(image.naturalWidth, image.naturalHeight);
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      context.drawImage(
        image,
        (800 - width) / 2,
        (800 - height) / 2,
        width,
        height,
      );
    } else {
      // A display picture does not need a multi-megapixel upload.
      // Resize it before encoding so small mobile uploads finish sooner.
      const maxWidth = options.profile ? 960 : 1600;
      const maxHeight = options.profile ? 960 : 2000;
      const scale = Math.min(
        1,
        maxWidth / image.naturalWidth,
        maxHeight / image.naturalHeight,
      );
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
    }
    for (const quality of [0.84, 0.72, 0.6]) {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/webp", quality),
      );
      if (blob && blob.size <= UPLOAD_IMAGE_MAX_BYTES) return readDataUrl(blob);
    }
    throw new Error(
      "This image could not be optimised. Try a smaller JPEG, PNG or WebP.",
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
