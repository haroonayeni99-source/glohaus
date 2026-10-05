import { z } from "zod";
import { withAccount } from "@/lib/api-account";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";

const schema = z.object({ sessionId: z.uuid() }).strict();

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const parsed = schema.safeParse(await smallJson(request, 1024));
    if (!parsed.success) throw new AccessError("INVALID_REQUEST", 400);

    await withAccount("professional", (db) =>
      db.query("SELECT beauty.end_my_live_session($1)", [
        parsed.data.sessionId,
      ]),
    );

    return json({ ended: true });
  } catch (error) {
    return apiError(error);
  }
}
