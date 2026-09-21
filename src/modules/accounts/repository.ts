import type { Account, Identity, Role } from "./domain";
import { AccessError } from "./domain";

export interface SqlClient {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>;
}

export async function findAccount(
  db: SqlClient,
  authId: string,
): Promise<Account | null> {
  const { rows } = await db.query<{
    id: string;
    auth_id: string;
    email: string;
    display_name: string;
    status: Account["status"];
    roles: Role[];
    professional_id: string | null;
  }>(
    `SELECT u.id, u.auth_id, u.email, u.display_name, u.status,
    ARRAY(SELECT r.role FROM beauty.user_roles r WHERE r.user_id = u.id ORDER BY r.role) AS roles,
    (SELECT p.id FROM beauty.professional_profiles p WHERE p.user_id = u.id) AS professional_id
    FROM beauty.users u WHERE u.auth_id = $1`,
    [authId],
  );
  const row = rows[0];
  return row
    ? {
        id: row.id,
        authId: row.auth_id,
        email: row.email,
        displayName: row.display_name,
        status: row.status,
        roles: row.roles,
        professionalId: row.professional_id,
      }
    : null;
}

// Caller owns the transaction; its identity context comes from verified Clerk auth.
export async function enrolAccount(
  db: SqlClient,
  identity: Identity,
  role: "customer" | "professional",
): Promise<Account> {
  if (role !== "customer" && role !== "professional")
    throw new AccessError("INVALID_REQUEST", 400);
  await db.query(
    `INSERT INTO beauty.users (auth_id, email, display_name) VALUES ($1, $2, $3) ON CONFLICT (auth_id) DO NOTHING`,
    [identity.authId, identity.email, identity.displayName],
  );
  // Lock serializes repeated/concurrent enrollment for this account, including suspension races.
  const { rows } = await db.query<{ id: string; status: string }>(
    `SELECT id, status FROM beauty.users WHERE auth_id = $1 FOR UPDATE`,
    [identity.authId],
  );
  const user = rows[0];
  if (!user || user.status !== "active")
    throw new AccessError("ACCOUNT_INACTIVE", 403);
  await db.query(
    `INSERT INTO beauty.user_roles (user_id, role) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [user.id, role],
  );
  if (role === "professional") {
    await db.query(
      `INSERT INTO beauty.professional_profiles (user_id) VALUES ($1) ON CONFLICT DO NOTHING`,
      [user.id],
    );
  } else {
    await db.query(
      `INSERT INTO beauty.customer_profiles (user_id) VALUES ($1) ON CONFLICT DO NOTHING`,
      [user.id],
    );
  }
  const account = await findAccount(db, identity.authId);
  if (!account) throw new AccessError("UNAVAILABLE", 503);
  return account;
}
