import { randomUUID } from "node:crypto";
import { put } from "@vercel/blob";
import { withOwner } from "@/modules/admin/repository";
import { readImageUpload } from "@/modules/media/upload";
import { AccessError } from "@/modules/accounts/domain";
import { apiError, assertSameOrigin, json } from "@/lib/http";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await withOwner(async () => undefined);
    if (!process.env.BLOB_READ_WRITE_TOKEN) throw new AccessError("UNAVAILABLE", 503);
    const { image } = await readImageUpload(request);
    const blob = await put(`homepage/${randomUUID()}.webp`, image, {
      access: "private", contentType: "image/webp", addRandomSuffix: true,
    });
    const url = new URL("/api/homepage-media", request.url);
    url.searchParams.set("image", blob.pathname);
    return json({ url: url.toString() }, 201);
  } catch (error) { return apiError(error); }
}
