import { z } from "zod";
import { withAccount } from "@/lib/api-account";
import { AccessError } from "@/modules/accounts/domain";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const { id } = await params;
    const parsed = z
      .object({ body: z.string().trim().min(10).max(1000) })
      .strict()
      .safeParse(await smallJson(request, 6000));
    if (!z.uuid().safeParse(id).success || !parsed.success)
      throw new AccessError("INVALID_REQUEST", 400);
    await withAccount("professional", (db) =>
      db.query("SELECT beauty.respond_to_review($1,$2)", [
        id,
        parsed.data.body,
      ]),
    );
    return json({ saved: true });
  } catch (error) {
    return apiError(error);
  }
}
