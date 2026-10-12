# Desktop homepage polish — 12 October 2026

The desktop sidebar wordmark now fits inside the sidebar with clear space before its divider. The desktop home sign-out button has a rounded border, hover treatment and keyboard focus. Sign-out authentication and navigation code are unchanged.

All new CSS is scoped to the desktop homepage at widths of 1100px and above. Mobile component code, photos, logo and sign-out styling are unchanged. The desktop's main hero and Owner image controls are also preserved; only the five desktop category thumbnails are replaced.

## Category assets

Created with the built-in image-generation tool, then packaged as 360px WebP thumbnails. These are illustrative AI-generated category photographs, not actual professionals, customer portraits or treatment-result claims.

| Category | Saved project asset | Subject prompt |
| --- | --- | --- |
| Hair | `public/images/categories/hair-v1.webp` | Adult Black woman with beautifully styled natural curly hair, warm confident expression, cream studio backdrop. |
| Nails | `public/images/categories/nails-v1.webp` | Adult East Asian woman with a neat dark bob and an elegantly manicured hand beside her chin; muted rose nails. |
| Barber | `public/images/categories/barber-v1.webp` | Adult Middle Eastern man with a modern short fade and neatly groomed beard, dark crewneck. |
| Waxing | `public/images/categories/waxing-v1.webp` | Adult South Asian woman in a tasteful sleeveless ivory top, natural brows and bare forearm, clean waxing salon. |
| Injectables | `public/images/categories/injectables-v1.webp` | Adult white European woman around 40 with a blonde bob and natural skin texture in a calm aesthetic consultation studio. |

Shared prompt: one square photorealistic editorial beauty photograph for the named GLOHAUS category; soft cream background, warm natural daylight, realistic anatomy and understated styling. Keep the face and service detail central for a small circular crop. No text, logo, border, collage or watermark. Injectables imagery excludes needles, before/after comparisons and treatment claims.

The asset filenames are versioned, and the original mobile image URLs remain in the mobile component.

## Verification

`scripts/check-desktop-home.mjs` uses real homepage components with a fictional account. It checks the brand's gap from the divider, sign-out bounds/rounding/focus, and all five images loading at 1100, 1280, 1440 and 1920px in both themes and signed-in/out states. It also compares mobile pixels with and without the desktop CSS at 320, 390, 760 and 1099px in both themes. CI saves desktop screenshots and the results for visual review before release.
