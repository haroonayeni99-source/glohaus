import { getIdentity } from "@/lib/identity";
import { withIdentity } from "@/lib/db";
import { authorize } from "@/modules/accounts/domain";
import { findAccount } from "@/modules/accounts/repository";
import { preferenceSchema } from "@/modules/notifications/preferences";
import {
  professionalNotificationSettings,
  saveNotificationPreference,
} from "@/modules/notifications/professional-repository";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
export async function GET() {
  try {
    const identity = await getIdentity();
    const settings = await withIdentity(identity.authId, async (db) => {
      authorize(
        await findAccount(db, identity.authId),
        identity,
        "professional",
      );
      return professionalNotificationSettings(db);
    });
    return json({
      ...settings,
      pushConfigured: Boolean(
        process.env.VAPID_PUBLIC_KEY &&
        process.env.VAPID_PRIVATE_KEY &&
        process.env.VAPID_SUBJECT,
      ),
      publicKey: process.env.VAPID_PUBLIC_KEY || null,
    });
  } catch (error) {
    return apiError(error);
  }
}
export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const parsed = preferenceSchema.safeParse(await smallJson(request));
    if (!parsed.success)
      return json({ error: { code: "INVALID_REQUEST" } }, 400);
    const identity = await getIdentity();
    await withIdentity(identity.authId, async (db) => {
      authorize(
        await findAccount(db, identity.authId),
        identity,
        "professional",
      );
      await saveNotificationPreference(db, parsed.data);
    });
    return json({ saved: true });
  } catch (error) {
    return apiError(error);
  }
}
