import { withAccount } from "@/lib/api-account";
import { assertSameOrigin, json, smallJson } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
import { z } from "zod";
import { myActivity } from "@/modules/professional-activity/repository";
import { activityError } from "@/modules/professional-activity/http";

export async function GET() {
  try {
    return json(await withAccount("professional", myActivity));
  } catch (error) {
    return activityError(error);
  }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = z
      .object({ action: z.literal("accept_boost"), confirmed: z.literal(true) })
      .strict()
      .safeParse(await smallJson(request));
    if (!input.success) throw new AccessError("INVALID_REQUEST", 400);
    await withAccount("professional", (db) =>
      db.query("SELECT beauty.accept_my_visibility_boost()"),
    );
    return json({ saved: true });
  } catch (error) {
    return activityError(error);
  }
}
