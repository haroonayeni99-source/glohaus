import type { PoolConfig } from "pg";

// pg connection-string options otherwise replace the explicit TLS object.
export function verifiedDatabaseTls(
  connectionString: string,
  ca?: string,
): Pick<PoolConfig, "connectionString" | "ssl"> {
  const url = new URL(connectionString);
  if (!["postgres:", "postgresql:"].includes(url.protocol))
    throw new Error("Invalid database protocol");
  const overrides = new Set([
    "ssl",
    "sslmode",
    "sslrootcert",
    "sslcert",
    "sslkey",
    "uselibpqcompat",
  ]);
  for (const key of [...url.searchParams.keys()])
    if (overrides.has(key.toLowerCase())) url.searchParams.delete(key);
  return {
    connectionString: url.toString(),
    ssl: { rejectUnauthorized: true, ...(ca ? { ca } : {}) },
  };
}
