// @vitest-environment jsdom
import { expect, it } from "vitest";
import { imageInputAccept, isSupportedImageFile, readImageFile } from "@/lib/image-file";

it("accepts standard camera files even without a MIME type", () => {
  expect(isSupportedImageFile(new File(["x"], "portrait.jpg", { type: "" }))).toBe(true);
  expect(isSupportedImageFile(new File(["x"], "portrait.png", { type: "application/octet-stream" }))).toBe(true);
  expect(isSupportedImageFile(new File(["x"], "portfolio.webp", { type: "image/webp" }))).toBe(true);
});
it("offers supported phone-image formats but rejects unsupported inputs", () => {
  expect(isSupportedImageFile(new File(["x"], "portrait.HEIC", { type: "image/heic" }))).toBe(true);
  expect(isSupportedImageFile(new File(["x"], "portrait.heif", { type: "image/heif" }))).toBe(true);
  expect(isSupportedImageFile(new File(["x"], "portrait.avif", { type: "image/avif" }))).toBe(true);
  expect(imageInputAccept).toContain(".heic");
  expect(isSupportedImageFile(new File(["<svg/>"], "unsafe.svg", { type: "image/svg+xml" }))).toBe(false);
  expect(isSupportedImageFile(new File(["GIF"], "animated.gif", { type: "image/gif" }))).toBe(false);
});
it("rejects unsupported images before creating a browser preview", async () => {
  await expect(readImageFile(new File(["<svg/>"], "unsafe.svg", { type: "image/svg+xml" })))
    .rejects.toThrow("Choose a JPEG");
});
