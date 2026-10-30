import "server-only";
import { withIdentity } from "@/lib/db";

export type PublicBookingFees = {
  standardFeePence: number;
  promotionalFeePence: number;
  promotionEnabled: boolean;
};

export async function publicBookingFees(): Promise<PublicBookingFees | null> {
  try {
    return await withIdentity("", async db =>
      (await db.query<{ data: PublicBookingFees }>(
        "SELECT beauty.public_booking_fee_configuration() AS data",
      )).rows[0]?.data ?? null,
    );
  } catch {
    // Describe the checkout disclosure without inventing a current price.
    return null;
  }
}
