import { expect, it } from "vitest";
import { verifiedDatabaseTls } from "@/lib/database-tls";

it("removes driver SSL overrides while keeping ordinary connection options", () => {
  const config = verifiedDatabaseTls(
    "postgresql://app:fixture@example.test/db?sslmode=no-verify&ssl=false&sslrootcert=untrusted&sslcert=other&sslkey=other&uselibpqcompat=true&application_name=glohaus",
    "trusted-ca",
  );
  expect(config.ssl).toEqual({ rejectUnauthorized: true, ca: "trusted-ca" });
  expect(config.connectionString).toBe(
    "postgresql://app:fixture@example.test/db?application_name=glohaus",
  );
});
it("requires certificate and hostname validation with the system trust store by default", () => {
  expect(verifiedDatabaseTls("postgres://app@example.test/db").ssl).toEqual({
    rejectUnauthorized: true,
  });
});
it("does not accept non-PostgreSQL protocols or leak the URL in errors", () => {
  expect(() =>
    verifiedDatabaseTls("https://user:fixture@example.test/db"),
  ).toThrow("Invalid database protocol");
});
