import { expect, it } from "vitest";
import sharp from "sharp";

const icons = [
  ["public/icons/glohaus-home-192-v3.png", 192],
  ["public/icons/glohaus-home-512-v3.png", 512],
  ["public/icons/glohaus-home-apple-180-v3.png", 180],
  ["public/icons/glohaus-home-maskable-512-v3.png", 512],
] as const;

it("provides opaque square icons at the required sizes", async () => {
  for (const [path, size] of icons) {
    const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([size, size]);
    let transparentPixels = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] !== 255) transparentPixels++;
    expect(transparentPixels).toBe(0);
  }
});
it("keeps the rose-gold monogram inside the Android maskable safe area", async () => {
  const { data, info } = await sharp(icons[3][0]).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let pixels = 0;
  let furthest = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const index = (y * info.width + x) * 3;
    const [r, g, b] = [data[index], data[index + 1], data[index + 2]];
    if (r < 215 && r > g * 1.1 && r > b * 1.1) {
      pixels++;
      furthest = Math.max(furthest, Math.hypot(x - info.width / 2, y - info.height / 2) / info.width);
    }
  }
  expect(pixels).toBeGreaterThan(1000);
  expect(furthest).toBeLessThan(0.4);
});
