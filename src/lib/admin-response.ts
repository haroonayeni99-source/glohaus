export async function requireAdminResponse(response: Response, fallback: string) {
  if (response.ok) return;
  const result = await response.json().catch(() => null);
  const code = result?.error?.code;
  if (code === "MFA_REQUIRED") throw new Error("Your security verification has expired. Open Security, verify your account, then retry this change.");
  if (code === "UNAUTHENTICATED") throw new Error("Your session has expired. Sign in again, then retry this change.");
  if (code === "FORBIDDEN") throw new Error("Your account does not have access to this action.");
  if (code === "INVALID_REQUEST") throw new Error("Check the entered values and the reason for this change, then try again.");
  throw new Error(fallback);
}
