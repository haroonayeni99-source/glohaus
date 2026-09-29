import "server-only";

import { withPaymentWorker } from "@/modules/payments/worker";

export async function paymentWebhookSecrets() {
  const configured = [
    process.env.STRIPE_WEBHOOK_SECRET,
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET,
  ].filter((value): value is string => Boolean(value));

  if (configured.length) return configured;

  return withPaymentWorker(async (db) => {
    const rows = (
      await db.query<{ secret_value: string }>(
        `SELECT secret_value
         FROM beauty.payment_runtime_secrets
         WHERE secret_key IN (
           'stripe_webhook_secret',
           'stripe_connect_webhook_secret'
         )
         ORDER BY secret_key`,
      )
    ).rows;
    return rows.map((row) => row.secret_value).filter(Boolean);
  });
}

export async function connectWebhookReady() {
  if (process.env.STRIPE_CONNECT_WEBHOOK_SECRET) return true;
  return withPaymentWorker(async (db) => {
    const result = await db.query<{ ready: boolean }>(
      `SELECT EXISTS(
         SELECT 1
         FROM beauty.payment_runtime_secrets
         WHERE secret_key='stripe_connect_webhook_secret'
       ) AS ready`,
    );
    return result.rows[0]?.ready ?? false;
  });
}
