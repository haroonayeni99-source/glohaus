import { z } from "zod";
import { withIdentity } from "@/lib/db";
import { getIdentity } from "@/lib/identity";
import { findAccount } from "@/modules/accounts/repository";
import { AccessError, authorize } from "@/modules/accounts/domain";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";

const schema = z.object({
  targetType: z.enum(["user","professional","post","media","review","booking"]),
  targetId: z.uuid(),
  category: z.string().trim().min(2).max(80),
  description: z.string().trim().min(5).max(1000),
}).strict();

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = schema.safeParse(await smallJson(request, 4096));
    if (!input.success) throw new AccessError("INVALID_REQUEST", 400);
    const identity = await getIdentity();
    const id = await withIdentity(identity.authId, async (db) => {
      authorize(await findAccount(db, identity.authId), identity);
      return (
        await db.query<{ id: string }>(
          "SELECT beauty.submit_safety_report($1,$2,$3,$4) AS id",
          [input.data.targetType,input.data.targetId,input.data.category,input.data.description],
        )
      ).rows[0]?.id;
    });
    return json({ id }, 201);
  } catch (error) {
    return apiError(error);
  }
}
