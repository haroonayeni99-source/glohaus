import sharp from "sharp";
export async function sanitizeImage(bytes: Buffer) {
  if (bytes.length === 0 || bytes.length > 3 * 1024 * 1024)
    throw new Error("IMAGE_TOO_LARGE");
  // Reject SVG and other decoders before asking native libraries for metadata.
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const webp = bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
  if (!jpeg && !png && !webp) throw new Error("UNSUPPORTED_IMAGE");
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
