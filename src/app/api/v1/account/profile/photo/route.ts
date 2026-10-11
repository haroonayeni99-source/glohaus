import sharp from "sharp";
import { withAccount } from "@/lib/api-account";
import { apiError, assertSameOrigin, json } from "@/lib/http";
import { readImageUpload } from "@/modules/media/upload";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    // Authenticate before processing the uploaded image.
    const owner = await withAccount(
      "customer",
      async (_db, account) => account.id,
    );
    const { image } = await readImageUpload(request);
    const portrait = await sharp(image)
      .resize({
        width: 480,
        height: 480,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 85 })
      .toBuffer();
    await withAccount("customer", async (db, account) => {
      if (account.id !== owner) throw new Error("ACCOUNT_CHANGED");
      await db.query(
        "UPDATE beauty.customer_profiles SET photo=$2 WHERE user_id=$1",
        [account.id, portrait],
      );
    });
    return json({ saved: true }, 201);
  } catch (error) {
    return apiError(error);
  }
}
export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    await withAccount("customer", (db, account) =>
      db.query(
        "UPDATE beauty.customer_profiles SET photo=NULL WHERE user_id=$1",
        [account.id],
      ),
    );
    return json({ removed: true });
  } catch (error) {
    return apiError(error);
  }
}
