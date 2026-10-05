import { z } from "zod";
import { withAccount } from "@/lib/api-account";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";

const schema = z.object({
  disputeId: z.uuid(),
  statement: z.string().trim().min(20).max(4000),
}).strict();

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const parsed = schema.safeParse(await smallJson(request, 8192));
    if (!parsed.success) throw new AccessError("INVALID_REQUEST", 400);

    const response = await withAccount("professional", async (db) => {
      const row = (
        await db.query<{ data: {
          disputeId: string;
          statement: string;
          submittedAt: string;
          updatedAt: string;
        } }>(
          "SELECT beauty.submit_my_booking_dispute_response($1,$2) AS data",
          [parsed.data.disputeId, parsed.data.statement],
        )
      ).rows[0];
      return row?.data;
    });

    return json({ saved: true, response });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "message" in error &&
      typeof error.message === "string"
    ) {
      if (error.message.includes("EVIDENCE_DEADLINE_PASSED"))
        return json({ error: { code: "EVIDENCE_DEADLINE_PASSED" } }, 409);
      if (error.message.includes("DISPUTE_CLOSED"))
        return json({ error: { code: "DISPUTE_CLOSED" } }, 409);
    }
    return apiError(error);
  }
}
