import { z } from "zod";
import { withAccount } from "@/lib/api-account";
import { apiError, json } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
import {
  createLiveKitJoinToken,
  liveKitReady,
  liveKitServerUrl,
} from "@/modules/live/livekit";

const paramsSchema = z.object({ sessionId: z.uuid() }).strict();

export async function GET(
  _request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  try {
    if (!liveKitReady()) throw new AccessError("UNAVAILABLE", 503);

    const parsed = paramsSchema.safeParse(await context.params);
    if (!parsed.success) throw new AccessError("INVALID_REQUEST", 400);

    const result = await withAccount(undefined, async (db, account) => {
      const row = (
        await db.query<{
          session: {
            id: string;
            roomName: string;
            title: string;
            startedAt: string;
            professionalId: string;
            businessName: string;
            slug: string;
          };
        }>(
          "SELECT beauty.live_session_join_info($1) AS session",
          [parsed.data.sessionId],
        )
      ).rows[0];

      if (!row?.session) throw new AccessError("INVALID_REQUEST", 404);

      const isBroadcaster =
        account.professionalId === row.session.professionalId &&
        account.roles.includes("professional");

      return {
        session: row.session,
        identity: isBroadcaster
          ? `pro_${account.professionalId}`
          : `viewer_${account.id}`,
        canPublish: isBroadcaster,
      };
    });

    return json({
      session: result.session,
      serverUrl: liveKitServerUrl(),
      participantToken: createLiveKitJoinToken({
        identity: result.identity,
        room: result.session.roomName,
        canPublish: result.canPublish,
      }),
      canPublish: result.canPublish,
    });
  } catch (error) {
    return apiError(error);
  }
}
