import { expect, it } from "vitest";
import { paymentDatabaseConfig } from "@/modules/payments/database-config";

it("enforces verified TLS and keeps the configured CA despite connection-string overrides", () => {
  const config = paymentDatabaseConfig("postgresql://worker:password@example.test:6543/postgres?sslmode=no-verify&sslrootcert=/tmp/untrusted&ssl=false", "trusted-ca");
  expect(config.ssl).toEqual({ rejectUnauthorized: true, ca: "trusted-ca" });
  expect(config.connectionString).toBe("postgresql://worker:password@example.test:6543/postgres");
  expect(config.max).toBe(2);
});

it("uses the system trust store when no custom CA is configured", () => {
  expect(paymentDatabaseConfig("postgresql://localhost/postgres").ssl).toEqual({ rejectUnauthorized: true });
});
