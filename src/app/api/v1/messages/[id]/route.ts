import { z } from "zod";
import { getIdentity } from "@/lib/identity";
import { withIdentity } from "@/lib/db";
import { assertSameOrigin, apiError, json, smallJson } from "@/lib/http";
import { authorize, AccessError } from "@/modules/accounts/domain";
import { findAccount } from "@/modules/accounts/repository";
import {
  conversationDetails,
  conversationMessages,
} from "@/modules/messages/repository";

const replySchema = z
  .object({
    body: z.string().trim().min(1).max(2000),
    bookingId: z.uuid().nullable().optional(),
  })
  .strict();

function assertMessagingAccount(roles: string[]) {
  if (!roles.includes("customer") && !roles.includes("professional"))
    throw new AccessError("FORBIDDEN", 403);
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success)
      throw new AccessError("INVALID_REQUEST", 400);

    const identity = await getIdentity();
    const data = await withIdentity(identity.authId, async (db) => {
      const account = authorize(
        await findAccount(db, identity.authId),
        identity,
      );
      assertMessagingAccount(account.roles);

      const conversation = await conversationDetails(
        db,
        id,
        account.id,
        account.professionalId,
      );
      if (!conversation) throw new AccessError("FORBIDDEN", 403);

      return {
        conversation,
        messages: await conversationMessages(db, id),
      };
    });

    return json(data);
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success)
      throw new AccessError("INVALID_REQUEST", 400);

    const parsed = replySchema.safeParse(await smallJson(request, 4096));
    if (!parsed.success) throw new AccessError("INVALID_REQUEST", 400);

    const identity = await getIdentity();
    const result = await withIdentity(identity.authId, async (db) => {
      const account = authorize(
        await findAccount(db, identity.authId),
        identity,
      );
      assertMessagingAccount(account.roles);

      return (
        await db.query<{ result: { conversationId: string; messageId: string } }>(
          "SELECT beauty.send_message($1,$2,$3) AS result",
          [id, parsed.data.body, parsed.data.bookingId ?? null],
        )
      ).rows[0].result;
    });

    return json(result, 201);
  } catch (error) {
    return apiError(error);
  }
}
