/**
 * Extracts a recent multi-factor challenge from claims that were already
 * signature-verified by Supabase Auth. Roles are deliberately absent here:
 * application roles are read from PostgreSQL inside the request transaction.
 */
export function verifiedSecondFactorAge(
  claims: Record<string, unknown>,
  now = Date.now(),
): number | null {
  if (claims.aal !== "aal2" || !Array.isArray(claims.amr)) return null;

  const challenges = claims.amr.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const value = entry as Record<string, unknown>;
    if (value.method !== "totp" || typeof value.timestamp !== "number")
      return [];
    return [value.timestamp];
  });
  const latest = Math.max(...challenges);
  if (!Number.isFinite(latest)) return null;

  const age = (now - latest * 1000) / 60_000;
  return Number.isFinite(age) && age >= 0 ? age : null;
}
