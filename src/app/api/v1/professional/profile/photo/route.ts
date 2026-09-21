import { randomUUID } from "node:crypto";
import { put, del } from "@vercel/blob";
import { withAccount } from "@/lib/api-account";
import { apiError, assertSameOrigin, json } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
import { readImageUpload } from "@/modules/media/upload";
import {
  replaceProfilePhoto,
  removeProfilePhoto,
} from "@/modules/professionals/photo";
async function cleanup(path: string | undefined) {
  if (path)
    await del(path).catch(() =>
      console.error("Profile photo cleanup requires retry"),
    );
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const owner = await withAccount(
      "professional",
      async (_db, account) => account.professionalId!,
    );
    if (!process.env.BLOB_READ_WRITE_TOKEN)
      throw new AccessError("UNAVAILABLE", 503);
    const { image, altText } = await readImageUpload(request);
    const id = randomUUID();
    const blob = await put(`profiles/${owner}/${id}.webp`, image, {
      access: "private",
      contentType: "image/webp",
      addRandomSuffix: true,
    });
    let old: string | undefined;
    try {
      old = await withAccount("professional", (db, account) => {
        if (account.professionalId !== owner)
          throw new AccessError("FORBIDDEN", 403);
        return replaceProfilePhoto(db, owner, {
          id,
          path: blob.pathname,
          alt: altText,
        });
      });
    } catch (error) {
      await cleanup(blob.pathname);
      throw error;
    }
    await cleanup(old);
    return json({ id }, 201);
  } catch (error) {
    return apiError(error);
  }
}
export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const path = await withAccount("professional", (db, account) =>
      removeProfilePhoto(db, account.professionalId!),
    );
    await cleanup(path);
    return json({ removed: true });
  } catch (error) {
    return apiError(error);
  }
}
