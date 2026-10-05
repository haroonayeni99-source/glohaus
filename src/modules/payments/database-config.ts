import type { PoolConfig } from "pg";

export function paymentDatabaseConfig(connectionString: string, ca?: string): PoolConfig {
  const url = new URL(connectionString);
  if (!["postgres:", "postgresql:"].includes(url.protocol))
    throw new Error("Invalid payment database protocol");
  // pg connection-string SSL options override the explicit ssl object. Remove
  // them so neither sslmode nor a file path can disable verified TLS or replace
  // the operator-configured trusted CA.
  for (const key of ["ssl", "sslmode", "sslrootcert", "sslcert", "sslkey", "uselibpqcompat"])
    url.searchParams.delete(key);
  return {
    connectionString: url.toString(),
    ssl: { rejectUnauthorized: true, ...(ca ? { ca } : {}) },
    max: 2,
    connectionTimeoutMillis: 5000,
  };
}
