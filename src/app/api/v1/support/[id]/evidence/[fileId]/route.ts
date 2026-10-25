import { z } from "zod";
import { get } from "@vercel/blob";
import { withIdentity } from "@/lib/db";
import { withAdmin } from "@/modules/admin/repository";
import { supportTokenHash } from "@/modules/support/cases";
import { AccessError } from "@/modules/accounts/domain";
import { apiError } from "@/lib/http";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; fileId: string }> },
) {
  try {
    const { id, fileId } = await params;
    if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(fileId).success)
      throw new AccessError("INVALID_REQUEST", 400);
    const read = async (
      db: import("@/modules/accounts/repository").SqlClient,
      hash: string | null,
      staff: boolean,
    ) =>
      (
        await db.query<{ path: string | null }>(
          "SELECT beauty.support_evidence_path($1,$2,$3,$4) AS path",
          [id, fileId, hash, staff],
        )
      ).rows[0]?.path;
    const path = request.headers.has("x-support-token")
      ? await withIdentity("", (db) =>
          read(db, supportTokenHash(request), false),
        )
      : await withAdmin((db) => read(db, null, true));
    if (!path) return new Response("Not found", { status: 404 });
    const blob = await get(path, {
      access: "private",
      abortSignal: AbortSignal.any([
        request.signal,
        AbortSignal.timeout(10000),
      ]),
    });
    if (blob?.statusCode !== 200)
      return new Response("Not found", { status: 404 });
    return new Response(blob.stream, {
      headers: {
        "Content-Type": "image/webp",
        "Content-Disposition": 'inline; filename="support-evidence.webp"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
