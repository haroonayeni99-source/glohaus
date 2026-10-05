import { z } from "zod";
import { withAccount } from "@/lib/api-account";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
import {
  createLiveKitJoinToken,
  liveKitReady,
  liveKitServerUrl,
} from "@/modules/live/livekit";

const schema = z.object({
  title: z.string().trim().min(1).max(120),
}).strict();

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    if (!liveKitReady()) throw new AccessError("UNAVAILABLE", 503);

    const parsed = schema.safeParse(await smallJson(request, 2048));
    if (!parsed.success) throw new AccessError("INVALID_REQUEST", 400);

    const result = await withAccount("professional", async (db, account) => {
      const row = (
        await db.query<{
          session: {
            id: string;
            roomName: string;
            title: string;
            status: string;
            startedAt: string;
          };
        }>(
          "SELECT beauty.start_my_live_session($1) AS session",
          [parsed.data.title],
        )
      ).rows[0];

      if (!row?.session) throw new AccessError("UNAVAILABLE", 503);

      return {
        session: row.session,
        identity: `pro_${account.professionalId}`,
      };
    });

    return json({
      session: result.session,
      serverUrl: liveKitServerUrl(),
      participantToken: createLiveKitJoinToken({
        identity: result.identity,
        room: result.session.roomName,
        canPublish: true,
      }),
    }, 201);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "message" in error &&
      typeof error.message === "string" &&
      error.message.includes("LIVE_NOT_ELIGIBLE")
    )
      return json({ error: { code: "LIVE_NOT_ELIGIBLE" } }, 403);
    return apiError(error);
  }
}
