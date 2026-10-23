import type { PoolConfig } from "pg";
import { verifiedDatabaseTls } from "@/lib/database-tls";

export function paymentDatabaseConfig(connectionString: string, ca?: string): PoolConfig {
  return {
    ...verifiedDatabaseTls(connectionString, ca),
    max: 2,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 5000,
    allowExitOnIdle: true,
  };
}
