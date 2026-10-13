import {
  SOURCE_IMAGE_MAX_BYTES,
  UPLOAD_IMAGE_MAX_BYTES,
  imageTypes,
} from "@/modules/media/limits";

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
  options: { logo?: boolean } = {},
): Promise<string> {
  if (
    !file.size ||
    file.size > SOURCE_IMAGE_MAX_BYTES ||
    !imageTypes.includes(file.type as (typeof imageTypes)[number])
  )
    throw new Error("Choose a JPEG, PNG or WebP image up to 20 MB.");
  // Large originals are optimized before reaching the request-body limit.
  // The server still verifies and sanitizes the resulting image independently.
  const url = URL.createObjectURL(file);
  try {
    const image = await imageFromUrl(url);
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
      const scale = Math.min(
        1,
        1600 / image.naturalWidth,
        2000 / image.naturalHeight,
      );
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
    }
    for (const quality of [0.9, 0.8, 0.65]) {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/webp", quality),
      );
      if (blob && blob.size <= UPLOAD_IMAGE_MAX_BYTES) return readDataUrl(blob);
    }
    throw new Error(
      "This image could not be optimized. Try a smaller JPEG, PNG or WebP.",
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
