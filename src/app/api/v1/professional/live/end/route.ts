import { z } from "zod";
import { withAccount } from "@/lib/api-account";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
import { closeLiveKitRoom } from "@/modules/live/livekit";

const schema = z.object({ sessionId: z.uuid() }).strict();

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const parsed = schema.safeParse(await smallJson(request, 1024));
    if (!parsed.success) throw new AccessError("INVALID_REQUEST", 400);

    const roomName = await withAccount("professional", async (db, account) => {
      const result = await db.query<{ room_name: string }>(
        "SELECT room_name FROM beauty.live_sessions WHERE id=$1 AND professional_id=$2",
        [parsed.data.sessionId, account.professionalId],
      );
      if (!result.rows[0]) throw new AccessError("FORBIDDEN", 403);
      return result.rows[0].room_name;
    });
    await closeLiveKitRoom(roomName);
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
