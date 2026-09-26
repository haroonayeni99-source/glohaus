import type Stripe from "stripe";
import { withAccount } from "@/lib/api-account";
import { apiError, assertSameOrigin, json } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
import { paymentReady, stripe } from "@/modules/payments/stripe";
import { withPaymentWorker } from "@/modules/payments/worker";

type PayoutRequest = {
  id: string;
  kind: "standard" | "instant";
  requestedPence: number;
  withdrawalFeePence: number;
  bankAmountPence: number;
  status: string;
};

type InstantPayout = Stripe.Payout & {
  application_fee?: string | Stripe.ApplicationFee | null;
  application_fee_amount?: number | null;
};

export async function POST(request: Request) {
  let requestRecord: PayoutRequest | undefined;
  let transferId: string | undefined;
  let providerPayoutCreated = false;

  try {
    assertSameOrigin(request);
    if (!paymentReady()) throw new AccessError("UNAVAILABLE", 503);

    const body = (await request.json()) as {
      kind?: "standard" | "instant";
      amountPence?: number;
    };
    if (
      !["standard", "instant"].includes(body.kind || "") ||
      !Number.isInteger(body.amountPence) ||
      (body.amountPence || 0) < 100
    )
      throw new AccessError("INVALID_REQUEST", 400);

    if (
      body.kind === "instant" &&
      process.env.STRIPE_INSTANT_PAYOUT_FEE_CONFIGURED !== "true"
    )
      throw new AccessError("UNAVAILABLE", 503);

    const account = await withAccount("professional", async (db, account) => {
      const paymentAccount = (
        await db.query<{
          stripe_account_id: string;
          charges_enabled: boolean;
        }>(
          "SELECT stripe_account_id,charges_enabled FROM beauty.professional_payment_accounts WHERE professional_id=$1",
          [account.professionalId],
        )
      ).rows[0];

      if (!paymentAccount?.stripe_account_id)
        throw new AccessError("ONBOARDING_REQUIRED", 409);
      if (!paymentAccount.charges_enabled)
        throw new AccessError("UNAVAILABLE", 409);

      requestRecord = (
        await db.query<{ data: PayoutRequest }>(
          "SELECT beauty.request_my_payout($1,$2) AS data",
          [body.kind, body.amountPence],
        )
      ).rows[0].data;

      return {
        stripeAccountId: paymentAccount.stripe_account_id,
        payout: requestRecord,
      };
    });

    const transfer = await stripe().transfers.create(
      {
        amount: account.payout.requestedPence,
        currency: "gbp",
        destination: account.stripeAccountId,
        transfer_group: `withdrawal_${account.payout.id}`,
        metadata: {
          glohaus_payout_id: account.payout.id,
          glohaus_transfer_id: transfer.id,
        },
      },
      { idempotencyKey: `withdrawal-transfer-${account.payout.id}` },
    );
    transferId = transfer.id;

    let destination: string | undefined;
    if (account.payout.kind === "instant") {
      const balance = (await stripe().balance.retrieve(
        { expand: ["instant_available.net_available"] },
        { stripeAccount: account.stripeAccountId },
      )) as Stripe.Balance & {
        instant_available?: Array<{
          currency: string;
          amount: number;
          net_available?: Array<{ amount: number; destination: string }>;
        }>;
      };
      const eligible = balance.instant_available
        ?.find((entry) => entry.currency === "gbp")
        ?.net_available?.find(
          (entry) => entry.amount >= account.payout.bankAmountPence,
        );
      if (!eligible)
        throw new AccessError("INVALID_REQUEST", 409);
      destination = eligible.destination;
    }

    const providerPayout = (await stripe().payouts.create(
      {
        amount: account.payout.bankAmountPence,
        currency: "gbp",
        method: account.payout.kind,
        ...(destination ? { destination } : {}),
        description: "GLOHAUS professional withdrawal",
        metadata: { glohaus_payout_id: account.payout.id },
      },
      {
        stripeAccount: account.stripeAccountId,
        idempotencyKey: `withdrawal-payout-${account.payout.id}`,
      },
    )) as InstantPayout;

    providerPayoutCreated = true;
    const applicationFeeId =
      typeof providerPayout.application_fee === "string"
        ? providerPayout.application_fee
        : providerPayout.application_fee?.id;
    const providerFeePence = providerPayout.application_fee_amount ?? 0;

    if (
      account.payout.kind === "instant" &&
      (providerFeePence !== account.payout.withdrawalFeePence ||
        !applicationFeeId)
    )
      throw new AccessError("UNAVAILABLE", 503);

    try {
      await withPaymentWorker((db) =>
        db.query(
          "SELECT beauty.record_payout_provider($1,$2,$3,$4,$5,$6)",
          [
            account.payout.id,
            transfer.id,
            providerPayout.id,
            applicationFeeId ?? null,
            providerFeePence,
            new Date(providerPayout.arrival_date * 1000),
          ],
        ),
      );
    } catch {
      // The Stripe payout already exists. Keep the wallet reserved rather than
      // reversing live money; the signed payout webhook can recover the record
      // from payout metadata.
      console.error("GLOHAUS payout provider record deferred to webhook");
    }

    return json({
      payout: {
        id: account.payout.id,
        kind: account.payout.kind,
        requestedPence: account.payout.requestedPence,
        withdrawalFeePence: account.payout.withdrawalFeePence,
        bankAmountPence: account.payout.bankAmountPence,
        status: "processing",
        expectedArrivalAt: new Date(
          providerPayout.arrival_date * 1000,
        ).toISOString(),
      },
    });
  } catch (error) {
    if (transferId && requestRecord && !providerPayoutCreated) {
      try {
        await stripe().transfers.createReversal(transferId, undefined, {
          idempotencyKey: `withdrawal-transfer-reversal-${requestRecord.id}`,
        });
      } catch {
        console.error("Stripe withdrawal transfer reversal failed");
      }
    }
    if (requestRecord && !providerPayoutCreated) {
      try {
        await withPaymentWorker((db) =>
          db.query("SELECT beauty.cancel_requested_payout($1)", [
            requestRecord!.id,
          ]),
        );
      } catch {
        console.error("GLOHAUS payout request rollback failed");
      }
    }
    return apiError(error);
  }
}
