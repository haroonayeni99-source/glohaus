import { z } from "zod";
import { withAccount } from "@/lib/api-account";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
import { isRequiredDepositWithinLimit } from "@/modules/bookings/deposit-policy";
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
  serviceName: string;
  professionalName: string;
  status: string;
  holdExpiresAt: string;
};
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const parsed = schema.safeParse(await smallJson(request));
    if (!parsed.success) throw new AccessError("INVALID_REQUEST", 400);
    const booking = await withAccount("customer", async (db) => {
      const reservation = (
        await db.query<{ booking: Reservation }>(
          "SELECT beauty.reserve_booking($1,$2) AS booking",
          [parsed.data.serviceId, parsed.data.startsAt],
        )
      ).rows[0].booking;
      // Throw before the transaction commits: unavailable paid checkout must not leave a slot held.
      if (
        reservation.status !== "confirmed" &&
        reservation.depositPence > 0 &&
        !paymentReady()
      )
        throw new AccessError("UNAVAILABLE", 503);
      return reservation;
    });
    // Re-read the immutable snapshot inside the authenticated customer scope
    // before a checkout session is created. This is deliberately separate from
    // form validation and the database trigger, so a forged client request
    // cannot pay an excessive professional-required deposit.
    const depositWithinLimit = await withAccount("customer", async (db) => {
      const row = (
        await db.query<{ price_pence: number; deposit_pence: number }>(
          "SELECT price_pence,deposit_pence FROM beauty.bookings WHERE id=$1",
          [booking.id],
        )
      ).rows[0];
      return Boolean(
        row &&
          isRequiredDepositWithinLimit(row.price_pence, row.deposit_pence),
      );
    });
    if (!depositWithinLimit) throw new AccessError("UNAVAILABLE", 503);
    if (booking.status === "confirmed")
      return json({ url: `/account/bookings/${booking.id}` });

    const quote = await withAccount("customer", async (db) => {
      const result = await db.query<{
        quote: {
          customerTotalPence: number;
          professionalProceedsPence: number;
          professionalPlatformFeePence: number;
        };
      }>("SELECT beauty.prepare_booking_financial_quote($1) AS quote", [
        booking.id,
      ]);
      return result.rows[0].quote;
    });

    const origin = new URL(process.env.NEXT_PUBLIC_APP_URL!).origin;
    const checkout = await stripe().checkout.sessions.create(
      {
        mode: "payment",
        line_items: [
          {
            price_data: {
              currency: "gbp",
              unit_amount: quote.customerTotalPence,
              product_data: {
                name: `Deposit: ${booking.serviceName} · ${booking.professionalName}`,
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
    await withAccount("customer", (db) =>
      db.query("SELECT beauty.attach_checkout($1,$2)", [
        booking.id,
        checkout.id,
      ]),
    );
    return json({ url: checkout.url, bookingId: booking.id }, 201);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "23P01"
    )
      return json({ error: { code: "SLOT_TAKEN" } }, 409);
    return apiError(error);
  }
}
