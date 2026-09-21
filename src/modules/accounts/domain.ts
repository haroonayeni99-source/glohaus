import { z } from "zod";

export type Role = "customer" | "professional" | "admin";
export type AccountStatus = "active" | "suspended" | "removed";
export type Account = {
  id: string;
  authId: string;
  email: string;
  displayName: string;
  status: AccountStatus;
  roles: Role[];
  professionalId: string | null;
};
export type Identity = {
  authId: string;
  email: string;
  displayName: string;
  secondFactorAge: number | null;
};
export class AccessError extends Error {
  constructor(
    public code:
      | "UNAUTHENTICATED"
      | "FORBIDDEN"
      | "ACCOUNT_INACTIVE"
      | "MFA_REQUIRED"
      | "ONBOARDING_REQUIRED"
      | "UNAVAILABLE"
      | "INVALID_REQUEST"
      | "BOOKING_CONFLICT",
    public status: number,
  ) {
    super(code);
  }
}

export const enrolmentSchema = z
  .object({ role: z.enum(["customer", "professional"]) })
  .strict();

export function authorize(
  account: Account | null,
  identity: Identity,
  role?: Role,
): Account {
  if (!account) throw new AccessError("ONBOARDING_REQUIRED", 409);
  if (account.authId !== identity.authId)
    throw new AccessError("FORBIDDEN", 403);
  if (account.status !== "active")
    throw new AccessError("ACCOUNT_INACTIVE", 403);
  if (role && !account.roles.includes(role))
    throw new AccessError("FORBIDDEN", 403);
  if (
    role === "admin" &&
    (identity.secondFactorAge === null ||
      !Number.isFinite(identity.secondFactorAge) ||
      identity.secondFactorAge < 0 ||
      identity.secondFactorAge > 15)
  ) {
    throw new AccessError("MFA_REQUIRED", 403);
  }
  return account;
}

export function authorizeProfessional(
  account: Account | null,
  identity: Identity,
  professionalId: string,
): Account {
  const result = authorize(account, identity, "professional");
  if (!result.professionalId || result.professionalId !== professionalId)
    throw new AccessError("FORBIDDEN", 403);
  return result;
}

export function workspacePath(account: Account): string {
  if (account.roles.includes("professional")) return "/professional";
  if (account.roles.includes("customer")) return "/account";
  if (account.roles.includes("admin")) return "/admin";
  return "/onboarding";
}
