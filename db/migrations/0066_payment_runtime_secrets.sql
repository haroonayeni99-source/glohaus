-- Private runtime fallback for payment webhook signing secrets.
-- Secrets are inserted directly into production and are never committed to source.

CREATE TABLE beauty.payment_runtime_secrets (
  secret_key text PRIMARY KEY CHECK(secret_key IN (
    'stripe_webhook_secret',
    'stripe_connect_webhook_secret'
  )),
  secret_value text NOT NULL CHECK(length(secret_value) BETWEEN 20 AND 500),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE beauty.payment_runtime_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty.payment_runtime_secrets FORCE ROW LEVEL SECURITY;

CREATE POLICY payment_runtime_secrets_worker_read
ON beauty.payment_runtime_secrets
FOR SELECT TO beauty_payment_worker
USING (true);

GRANT SELECT ON beauty.payment_runtime_secrets TO beauty_payment_worker;
REVOKE ALL ON beauty.payment_runtime_secrets FROM PUBLIC, beauty_app, beauty_admin_ops;
