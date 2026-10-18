import { optionsFromSearch } from "@/modules/taxonomy/domain";
import { z } from "zod";
import { withIdentity } from "@/lib/db";
import { AccessError } from "@/modules/accounts/domain";
import { json } from "@/lib/http";
import { servicePolicy, servicePaymentPolicy } from "@/modules/policies/repository";
import { policyError } from "@/modules/policies/http";
export async function GET(request: Request) {
  try {
    const params=new URL(request.url).searchParams;const options=optionsFromSearch(params);
    const id = params.get("serviceId");
    const choice = z.enum(["auto", "deposit", "full"]).safeParse(params.get("paymentChoice") ?? "auto");
    if (!choice.success) throw new AccessError("INVALID_REQUEST", 400);
    if (!z.uuid().safeParse(id).success)
      throw new AccessError("INVALID_REQUEST", 400);
    return json(
      await withIdentity("", async (db) => ({
        policy: params.has("paymentChoice") ? await servicePaymentPolicy(db,id!,choice.data,options) : await servicePolicy(db, id!,options.variationId||options.extraIds?.length?options:undefined),
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
