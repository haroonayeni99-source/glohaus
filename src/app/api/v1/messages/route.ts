import { z } from "zod";
import { getIdentity } from "@/lib/identity";
import { withIdentity } from "@/lib/db";
import { assertSameOrigin, apiError, json, smallJson } from "@/lib/http";
import { authorize, AccessError } from "@/modules/accounts/domain";
import { findAccount } from "@/modules/accounts/repository";
import { conversationInbox } from "@/modules/messages/repository";

const bodySchema = z.string().trim().min(1).max(2000);
const startSchema = z.union([
  z.object({ professionalId: z.uuid(), body: bodySchema }).strict(),
  z.object({ bookingId: z.uuid(), body: bodySchema }).strict(),
]);

function assertMessagingAccount(roles: string[]) {
  if (!roles.includes("customer") && !roles.includes("professional"))
    throw new AccessError("FORBIDDEN", 403);
}

export async function GET() {
  try {
    const identity = await getIdentity();
    const data = await withIdentity(identity.authId, async (db) => {
      const account = authorize(
        await findAccount(db, identity.authId),
        identity,
      );
      assertMessagingAccount(account.roles);
      return conversationInbox(db, account.id, account.professionalId);
    });
    return json({ conversations: data });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const parsed = startSchema.safeParse(await smallJson(request, 4096));
    if (!parsed.success) throw new AccessError("INVALID_REQUEST", 400);

    const identity = await getIdentity();
    const result = await withIdentity(identity.authId, async (db) => {
      const account = authorize(
        await findAccount(db, identity.authId),
        identity,
      );
      assertMessagingAccount(account.roles);

      if ("professionalId" in parsed.data) {
        return (
          await db.query<{ result: { conversationId: string; messageId: string } }>(
            "SELECT beauty.message_professional($1,$2) AS result",
            [parsed.data.professionalId, parsed.data.body],
          )
        ).rows[0].result;
      }

      return (
        await db.query<{ result: { conversationId: string; messageId: string } }>(
          "SELECT beauty.message_booking($1,$2) AS result",
          [parsed.data.bookingId, parsed.data.body],
        )
      ).rows[0].result;
    });

    return json(result, 201);
  } catch (error) {
    return apiError(error);
  }
}
