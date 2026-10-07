import { z } from "zod";
import { withAccount } from "@/lib/api-account";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
import { isRequiredDepositWithinLimit } from "@/modules/bookings/deposit-policy";
import { assertBookingAllowed, professionalAccessState } from "@/modules/professionals/verification";
import { stripe, paymentReady } from "@/modules/payments/stripe";
const schema = z
  .object({
    serviceId: z.uuid(),
    startsAt: z.iso.datetime({ offset: true }),
    acceptPolicy: z.literal(true),
  })
  .strict();
type Reservation = {
  id: string;
  depositPence: number;
  pricePence: number;
  serviceName: string;
  professionalName: string;
  status: string;
  holdExpiresAt: string;
};
export async function POST(request: Request) {
  let stage = "validate";
  try {
    assertSameOrigin(request);
    const parsed = schema.safeParse(await smallJson(request));
    if (!parsed.success) throw new AccessError("INVALID_REQUEST", 400);
    stage = "reserve";
    const booking = await withAccount("customer", async (db) => {
      const service = (
        await db.query<{
          professional_id: string;
          price_pence: number;
          deposit_pence: number;
        }>(
          "SELECT professional_id,price_pence,deposit_pence FROM beauty.public_services WHERE id=$1",
          [parsed.data.serviceId],
        )
      ).rows[0];
      if (!service) throw new AccessError("INVALID_REQUEST", 400);
      const access = await professionalAccessState(db, service.professional_id);
      assertBookingAllowed(access, {
        pricePence: service.price_pence,
        depositPence: service.deposit_pence,
      });

      const reservation = (
        await db.query<{ booking: Reservation }>(
          "SELECT beauty.reserve_booking($1,$2) AS booking",
          [parsed.data.serviceId, parsed.data.startsAt],
        )
      ).rows[0].booking;
      // Throw before the transaction commits: unavailable paid checkout must not leave a slot held.
      if (reservation.status !== "confirmed" && !paymentReady())
        throw new Error("PAYMENTS_NOT_READY");
      return reservation;
    });
    // Re-read the immutable snapshot inside the authenticated customer scope
    // before a checkout session is created. This is deliberately separate from
    // form validation and the database trigger, so a forged client request
    // cannot pay an excessive professional-required deposit.
    stage = "policy";
    const paymentWithinPolicy = await withAccount("customer", async (db) => {
      const row = (
        await db.query<{
          price_pence: number;
          deposit_pence: number;
          professional_id: string;
        }>(
          "SELECT price_pence,deposit_pence,professional_id FROM beauty.bookings WHERE id=$1",
          [booking.id],
        )
      ).rows[0];
      if (!row) return false;

      const access = await professionalAccessState(db, row.professional_id);
      if (!access.verified) {
        return row.deposit_pence === row.price_pence;
      }

      return isRequiredDepositWithinLimit(
        row.price_pence,
        row.deposit_pence,
      );
    });
    if (!paymentWithinPolicy) throw new AccessError("UNAVAILABLE", 503);
    if (booking.status === "confirmed")
      return json({ url: `/account/bookings/${booking.id}` });

    stage = "quote";
    const quote = await withAccount("customer", async (db) => {
      const result = await db.query<{
        quote: {
          customerTotalPence: number;
          professionalProceedsPence: number;
          professionalPlatformFeePence: number;
          customerPlatformFeePence: number;
        };
      }>("SELECT beauty.prepare_booking_financial_quote($1) AS quote", [
        booking.id,
      ]);
      return result.rows[0].quote;
    });

    const origin = new URL(process.env.NEXT_PUBLIC_APP_URL!).origin;
    let checkoutId: string | null = null;
    try {
      stage = "stripe_checkout";
      const checkout = await stripe().checkout.sessions.create(
        {
          mode: "payment",
          line_items: [
            ...(booking.depositPence > 0
              ? [
                  {
                    price_data: {
                      currency: "gbp",
                      unit_amount: booking.depositPence,
                      product_data: {
                        name:
                          booking.depositPence === booking.pricePence
                            ? `Service payment: ${booking.serviceName} · ${booking.professionalName}`
                            : `Service deposit: ${booking.serviceName} · ${booking.professionalName}`,
                      },
                    },
                    quantity: 1,
                  },
                ]
              : []),
            {
              price_data: {
                currency: "gbp",
                unit_amount: quote.customerPlatformFeePence,
                product_data: {
                  name: "GLOHAUS booking fee",
                },
              },
              quantity: 1,
            },
          ],
          payment_intent_data: {
            transfer_group: `booking_${booking.id}`,
            metadata: { booking_id: booking.id },
          },
          metadata: { booking_id: booking.id },
          integration_identifier: `glohaus_booking_${booking.id
            .replace(/-/g, "")
            .slice(0, 8)
            .replace(/[0-9]/g, (digit) => String.fromCharCode(97 + Number(digit)))}`,
          success_url: `${origin}/account/bookings/${booking.id}`,
          cancel_url: `${origin}/account/bookings/${booking.id}`,
          expires_at: Math.floor(Date.parse(booking.holdExpiresAt) / 1000) - 120,
        },
        { idempotencyKey: `booking-checkout-${booking.id}` },
      );
      checkoutId = checkout.id;
      stage = "attach_checkout";
      await withAccount("customer", (db) =>
        db.query("SELECT beauty.attach_checkout($1,$2)", [
          booking.id,
          checkout.id,
        ]),
      );
      return json({ url: checkout.url, bookingId: booking.id }, 201);
    } catch (checkoutError) {
      if (checkoutId) {
        try {
          await stripe().checkout.sessions.expire(checkoutId);
        } catch {
          // Local hold recovery still proceeds if provider cleanup is unavailable.
        }
      }
      try {
        await withAccount("customer", (db) =>
          db.query("SELECT beauty.release_failed_booking_checkout($1)", [
            booking.id,
          ]),
        );
      } catch {
        // Preserve the original error; the ordinary hold expiry remains a fallback.
      }
      throw checkoutError;
    }
  } catch (error) {
    if (error instanceof AccessError && error.code === "UNAVAILABLE") {
      console.error("Booking unavailable", { stage, code: error.code });
    }
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "23P01"
    )
      return json({ error: { code: "SLOT_TAKEN" } }, 409);
    if (
      error &&
      typeof error === "object" &&
      "message" in error &&
      typeof error.message === "string" &&
      error.message.includes("VERIFICATION_REQUIRED")
    )
      return json({ error: { code: "VERIFICATION_REQUIRED" } }, 409);
    if (
      error &&
      typeof error === "object" &&
      "message" in error &&
      typeof error.message === "string"
    ) {
      if (error.message.includes("PROFESSIONAL_RESTRICTED"))
        return json({ error: { code: "PROFESSIONAL_RESTRICTED" } }, 403);
      if (error.message.includes("TOO_MANY_ATTEMPTS"))
        return json({ error: { code: "TOO_MANY_ATTEMPTS" } }, 429);
      if (error.message.includes("PAYMENTS_NOT_READY"))
        return json({ error: { code: "PAYMENTS_NOT_READY" } }, 409);
      if (error.message.includes("DEPOSIT_LIMIT"))
        return json({ error: { code: "DEPOSIT_LIMIT" } }, 409);
      if (error.message.includes("CHECKOUT_CONFLICT"))
        return json({ error: { code: "CHECKOUT_CONFLICT" } }, 409);
      if (
        error.message.includes("INVALID_TIME") ||
        error.message.includes("OUTSIDE_HOURS") ||
        error.message.includes("UNAVAILABLE_SERVICE")
      )
        return json({ error: { code: "INVALID_APPOINTMENT" } }, 409);
    }
    return apiError(error);
  }
}
