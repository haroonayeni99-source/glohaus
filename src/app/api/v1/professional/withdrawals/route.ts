import type Stripe from "stripe";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { withAccount } from "@/lib/api-account";
import { apiError, assertSameOrigin, json, smallJson } from "@/lib/http";
import { AccessError } from "@/modules/accounts/domain";
import { paymentReady, stripe } from "@/modules/payments/stripe";
import { withPaymentWorker } from "@/modules/payments/worker";
import { connectWebhookReady } from "@/modules/payments/webhook-secrets";
import {
  assertWithdrawalAllowed,
  professionalAccessState,
} from "@/modules/professionals/verification";

type PayoutRequest = {
  id: string;
  kind: "standard" | "instant";
  requestedPence: number;
  withdrawalFeePence: number;
  bankAmountPence: number;
  status: string;
  claimed: boolean;
  createdAt: string;
  stripeAccountId: string;
  providerTransferId: string | null;
  providerPayoutId: string | null;
  expectedArrivalAt: string | null;
};

const inputSchema = z
  .object({
    kind: z.enum(["standard", "instant"]),
    amountPence: z.number().int().min(100).max(2147483647),
    requestKey: z.uuid().optional(),
  })
  .strict();

function confirmedRejection(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const value = error as { type?: string; statusCode?: number; code?: string };
  return (
    value.type === "StripeInvalidRequestError" &&
    value.statusCode === 400 &&
    value.code !== "idempotency_key_in_use"
  );
}

function publicPayout(payout: PayoutRequest) {
  return {
    id: payout.id,
    kind: payout.kind,
    requestedPence: payout.requestedPence,
    withdrawalFeePence: payout.withdrawalFeePence,
    bankAmountPence: payout.bankAmountPence,
    status: payout.status,
    expectedArrivalAt: payout.expectedArrivalAt,
  };
}

type InstantPayout = Stripe.Payout & {
  application_fee?: string | Stripe.ApplicationFee | null;
  application_fee_amount?: number | null;
};

export async function POST(request: Request) {
  let requestRecord: PayoutRequest | undefined;
  let transferId: string | undefined;
  let providerPayoutCreated = false;
  let outcomeUnknown = false;
  let mutationInFlight = false;
  let ownsClaim = false;
  const leaseKey = randomUUID();

  try {
    assertSameOrigin(request);
    if (!paymentReady() || !(await connectWebhookReady()))
      throw new AccessError("UNAVAILABLE", 503);

    const parsed = inputSchema.safeParse(await smallJson(request, 2048));
    if (!parsed.success) throw new AccessError("INVALID_REQUEST", 400);
    const body = parsed.data;

    if (
      body.kind === "instant" &&
      process.env.STRIPE_INSTANT_PAYOUT_FEE_CONFIGURED !== "true"
    )
      throw new AccessError("UNAVAILABLE", 503);

    const account = await withAccount("professional", async (db, account) => {
      const access = await professionalAccessState(db, account.professionalId!);
      assertWithdrawalAllowed(access);
      await db.query("SELECT beauty.assert_my_professional_verified()");

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

      const provider = await stripe().accounts.retrieve(
        paymentAccount.stripe_account_id,
      );
      if (
        provider.deleted ||
        !provider.payouts_enabled ||
        provider.capabilities?.transfers !== "active"
      )
        throw new AccessError("ONBOARDING_REQUIRED", 409);

      await db.query("SELECT beauty.recover_my_outstanding_obligation()");

      requestRecord = (
        await db.query<{ data: PayoutRequest }>(
          "SELECT beauty.request_my_payout_once($1,$2,$3,$4) AS data",
          [
            body.kind,
            body.amountPence,
            body.requestKey ?? randomUUID(),
            leaseKey,
          ],
        )
      ).rows[0].data;

      return {
        stripeAccountId: requestRecord.stripeAccountId,
        payout: requestRecord,
      };
    });

    if (!account.payout.claimed || account.payout.status !== "requested")
      return json(
        { payout: publicPayout(account.payout) },
        account.payout.status === "requested" ? 202 : 200,
      );
    ownsClaim = true;

    transferId = account.payout.providerTransferId ?? undefined;
    // A resumed transfer may already have an unconfirmed bank payout. A read
    // failure must not compensate it before replaying the original payout key.
    outcomeUnknown = Boolean(transferId);
    if (!transferId) {
      // Unknown responses must retain the wallet reservation. Retrying the same
      // durable request uses these same Stripe keys, within the 23-hour guard.
      outcomeUnknown = true;
      mutationInFlight = true;

      const transfer = await stripe().transfers.create(
        {
          amount: account.payout.requestedPence,
          currency: "gbp",
          destination: account.stripeAccountId,
          transfer_group: `withdrawal_${account.payout.id}`,
          metadata: {
            glohaus_payout_id: account.payout.id,
          },
        },
        { idempotencyKey: `withdrawal-transfer-${account.payout.id}` },
      );
      transferId = transfer.id;
      mutationInFlight = false;
      outcomeUnknown = false;
      await withPaymentWorker(async (db) => {
        const saved = await db.query(
          `UPDATE beauty.financial_payouts SET provider_transfer_id=$2,updated_at=now()
         WHERE id=$1 AND status='requested' AND provider_payout_id IS NULL
         AND (provider_transfer_id IS NULL OR provider_transfer_id=$2) RETURNING id`,
          [account.payout.id, transfer.id],
        );
        if (!saved.rows.length) throw new AccessError("UNAVAILABLE", 503);
      });
    }

    const checkedTransfer = await stripe().transfers.retrieve(transferId!);
    const checkedDestination =
      typeof checkedTransfer.destination === "string"
        ? checkedTransfer.destination
        : checkedTransfer.destination?.id;
    if (
      checkedDestination !== account.stripeAccountId ||
      checkedTransfer.amount !== account.payout.requestedPence ||
      checkedTransfer.currency !== "gbp" ||
      checkedTransfer.amount_reversed !== 0 ||
      checkedTransfer.metadata?.glohaus_payout_id !== account.payout.id
    ) {
      outcomeUnknown = true;
      throw new AccessError("UNAVAILABLE", 503);
    }

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
      if (!eligible) throw new AccessError("INVALID_REQUEST", 409);
      destination = eligible.destination;
    }

    outcomeUnknown = true;
    mutationInFlight = true;
    const providerPayout = (await stripe().payouts.create(
      {
        amount: account.payout.bankAmountPence,
        currency: "gbp",
        method: account.payout.kind,
        ...(destination ? { destination } : {}),
        description: "GLOHAUS professional withdrawal",
        metadata: {
          glohaus_payout_id: account.payout.id,
          glohaus_transfer_id: transferId!,
        },
      },
      {
        stripeAccount: account.stripeAccountId,
        idempotencyKey: `withdrawal-payout-${account.payout.id}`,
      },
    )) as InstantPayout;

    providerPayoutCreated = true;
    mutationInFlight = false;
    outcomeUnknown = false;
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
      await withPaymentWorker(async (db) => {
        await db.query(
          "SELECT beauty.record_payout_provider($1,$2,$3,$4,$5,$6)",
          [
            account.payout.id,
            transferId!,
            providerPayout.id,
            applicationFeeId ?? null,
            providerFeePence,
            new Date(providerPayout.arrival_date * 1000),
          ],
        );
        await db.query(
          "UPDATE beauty.financial_payout_requests SET issue_code=NULL WHERE payout_id=$1 AND lease_id=$2",
          [account.payout.id, leaseKey],
        );
      });
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
    // A failed reservation commit or replay must never release another active
    // request's funds. Only the holder of this processing lease can compensate.
    if (requestRecord && !ownsClaim)
      return json(
        {
          error: { code: "PAYOUT_REVIEW_REQUIRED" },
          payout: { id: requestRecord.id },
        },
        503,
      );
    if (mutationInFlight && confirmedRejection(error)) outcomeUnknown = false;
    let canRestore = !outcomeUnknown && !providerPayoutCreated;
    if (transferId && requestRecord && canRestore) {
      try {
        await stripe().transfers.createReversal(transferId, undefined, {
          idempotencyKey: `withdrawal-transfer-reversal-${requestRecord.id}`,
        });
      } catch {
        console.error("Stripe withdrawal transfer reversal failed");
        canRestore = false;
      }
    }
    if (requestRecord && canRestore) {
      try {
        await withPaymentWorker((db) =>
          db.query("SELECT beauty.cancel_requested_payout($1)", [
            requestRecord!.id,
          ]),
        );
      } catch {
        console.error("GLOHAUS payout request rollback failed");
        canRestore = false;
      }
    }
    if (requestRecord && (!canRestore || providerPayoutCreated)) {
      await withPaymentWorker((db) =>
        db.query(
          `UPDATE beauty.financial_payout_requests SET issue_code=$3
         WHERE payout_id=$1 AND lease_id=$2`,
          [
            requestRecord!.id,
            leaseKey,
            providerPayoutCreated
              ? "PROVIDER_CONFIRMATION_PENDING"
              : outcomeUnknown
                ? "PROVIDER_OUTCOME_UNKNOWN"
                : "REVERSAL_PENDING",
          ],
        ),
      ).catch(() => console.error("Payout review marker deferred"));
      return json(
        {
          error: { code: "PAYOUT_REVIEW_REQUIRED" },
          payout: { id: requestRecord.id },
        },
        503,
      );
    }
    if (
      error &&
      typeof error === "object" &&
      "message" in error &&
      typeof error.message === "string"
    ) {
      if (error.message.includes("PAYOUT_RESTRICTED"))
        return json({ error: { code: "PAYOUT_RESTRICTED" } }, 409);
      if (error.message.includes("PAYOUT_DISPUTE_BUFFER"))
        return json({ error: { code: "PAYOUT_DISPUTE_BUFFER" } }, 409);
      if (error.message.includes("OUTSTANDING_OBLIGATION"))
        return json({ error: { code: "OUTSTANDING_OBLIGATION" } }, 409);
      if (error.message.includes("INSUFFICIENT_AVAILABLE_BALANCE"))
        return json({ error: { code: "INSUFFICIENT_AVAILABLE_BALANCE" } }, 409);
      if (error.message.includes("PAYOUT_TOO_SMALL"))
        return json({ error: { code: "PAYOUT_TOO_SMALL" } }, 409);
    }
    return apiError(error);
  }
}
