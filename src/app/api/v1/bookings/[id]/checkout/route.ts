import { z } from "zod";
import { withAccount } from "@/lib/api-account";
import { apiError, assertSameOrigin, json } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
import { checkoutReference } from "@/modules/bookings/repository";
import { stripe, paymentReady } from "@/modules/payments/stripe";
import { resumedCheckoutUrl } from "@/modules/payments/checkout-resume";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success)
      throw new AccessError("INVALID_REQUEST", 400);
    if (!paymentReady()) throw new AccessError("UNAVAILABLE", 503);
    const reference = await withAccount("customer", (db) =>
      checkoutReference(db, id),
    );
    if (!reference) throw new AccessError("INVALID_REQUEST", 409);
    const session = await stripe().checkout.sessions.retrieve(
      reference.sessionId,
    );
    return json({ url: resumedCheckoutUrl(reference, session, Date.now()) });
  } catch (error) {
    return apiError(error);
  }
}
