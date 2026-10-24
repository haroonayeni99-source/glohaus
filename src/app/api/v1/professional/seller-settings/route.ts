import { withAccount } from "@/lib/api-account";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
import { sellerSettingsSchema } from "@/modules/shop/seller";
import {
  saveSellerSettings,
  sellerSettings,
} from "@/modules/shop/seller-repository";

export async function GET() {
  try {
    return json({
      settings: await withAccount("professional", (db, account) =>
        sellerSettings(db, account.professionalId!),
      ),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const parsed = sellerSettingsSchema.safeParse(
      await smallJson(request, 2048),
    );
    if (!parsed.success) throw new AccessError("INVALID_REQUEST", 400);
    return json({
      settings: await withAccount("professional", (db, account) =>
        saveSellerSettings(db, account.professionalId!, parsed.data),
      ),
    });
  } catch (error) {
    return apiError(error);
  }
}
