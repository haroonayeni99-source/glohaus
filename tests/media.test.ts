import sharp from "sharp";
import { it, expect } from "vitest";
import { sanitizeImage } from "@/modules/media/image";
it("re-encodes images to bounded WebP without metadata", async () => {
  const input = await sharp({
    create: { width: 2000, height: 1000, channels: 3, background: "red" },
  })
    .jpeg()
    .withMetadata()
    .toBuffer();
  const output = await sanitizeImage(input);
  const metadata = await sharp(output).metadata();
  expect(metadata.format).toBe("webp");
  expect(metadata.width).toBe(1600);
  expect(metadata.exif).toBeUndefined();
});
it("rejects oversized and non-image uploads", async () => {
  await expect(
    sanitizeImage(Buffer.alloc(3 * 1024 * 1024 + 1)),
  ).rejects.toThrow("IMAGE_TOO_LARGE");
  await expect(
    sanitizeImage(Buffer.from("<script>bad</script>")),
  ).rejects.toThrow();
});
it("rejects SVG even if an image decoder recognises it", async () => {
  await expect(
    sanitizeImage(
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>',
      ),
    ),
  ).rejects.toThrow("UNSUPPORTED_IMAGE");
});
