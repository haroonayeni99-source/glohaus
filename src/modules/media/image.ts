import sharp from "sharp";
export async function sanitizeImage(bytes: Buffer) {
  if (bytes.length === 0 || bytes.length > 3 * 1024 * 1024)
    throw new Error("IMAGE_TOO_LARGE");
  const image = sharp(bytes, {
    limitInputPixels: 25000000,
    animated: false,
    failOn: "warning",
  });
  const metadata = await image.metadata();
  if (!["jpeg", "png", "webp"].includes(metadata.format || ""))
    throw new Error("UNSUPPORTED_IMAGE");
  return image
    .rotate()
    .resize({
      width: 1600,
      height: 2000,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 85 })
    .toBuffer();
}
