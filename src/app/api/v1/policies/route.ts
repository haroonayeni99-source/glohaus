import { z } from "zod";
import { withIdentity } from "@/lib/db";
import { AccessError } from "@/modules/accounts/domain";
import { json } from "@/lib/http";
import { servicePolicy } from "@/modules/policies/repository";
import { policyError } from "@/modules/policies/http";
export async function GET(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("serviceId");
    if (!z.uuid().safeParse(id).success)
      throw new AccessError("INVALID_REQUEST", 400);
    return json(
      await withIdentity("", async (db) => ({
        policy: await servicePolicy(db, id!),
        earlyServiceBefore: (
          await db.query<{ cutoff: Date }>(
            "SELECT beauty.policy_cooling_off_end(now()) AS cutoff",
          )
        ).rows[0].cutoff,
        serverNow: new Date().toISOString(),
      })),
    );
  } catch (e) {
    return policyError(e);
  }
}
