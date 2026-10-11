import { withAccount } from "@/lib/api-account";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
import { publicLocationSchema } from "@/modules/professionals/location";
import {
  ownPublicLocation,
  savePublicLocation,
} from "@/modules/professionals/location-repository";
export async function GET() {
  try {
    return json({
      location: await withAccount("professional", (db, account) =>
        ownPublicLocation(db, account.professionalId!),
      ),
    });
  } catch (error) {
    return apiError(error);
  }
}
export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const parsed = publicLocationSchema.safeParse(
      await smallJson(request, 2048),
    );
    if (!parsed.success) throw new AccessError("INVALID_REQUEST", 400);
    await withAccount("professional", (db, account) =>
      savePublicLocation(db, account.professionalId!, parsed.data),
    );
    return json({ saved: true });
  } catch (error) {
    return apiError(error);
  }
}
