import { z } from "zod";

export type Role = "customer" | "professional" | "staff" | "admin" | "owner";
export type AccountStatus = "active" | "suspended" | "removed";
export type Account = {
  id: string;
  authId: string;
  email: string;
  displayName: string;
  status: AccountStatus;
  roles: Role[];
  professionalId: string | null;
  restrictedUntil?: string | null;
  deletedAt?: string | null;
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
      | "BOOKING_CONFLICT"
      | "VERIFICATION_REQUIRED"
      | "PROFESSIONAL_RESTRICTED",
    public status: number,
  ) {
    super(code);
  }
}

export const enrolmentSchema = z
  .object({
    role: z.enum(["customer", "professional"]),
    adultConfirmed: z.boolean().optional(),
    professionalTermsAccepted: z.boolean().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.role !== "professional") return;
    if (value.adultConfirmed !== true)
      ctx.addIssue({
        code: "custom",
        path: ["adultConfirmed"],
        message: "Professional accounts are available only to people aged 18 or over.",
      });
    if (value.professionalTermsAccepted !== true)
      ctx.addIssue({
        code: "custom",
        path: ["professionalTermsAccepted"],
        message: "Accept the Professional Terms to create a professional account.",
      });
  });

export function authorize(
  account: Account | null,
  identity: Identity,
  role?: Role,
): Account {
  if (!account) throw new AccessError("ONBOARDING_REQUIRED", 409);
  if (account.authId !== identity.authId)
    throw new AccessError("FORBIDDEN", 403);
  const timedRestrictionActive =
    Boolean(account.restrictedUntil) &&
    Number.isFinite(Date.parse(account.restrictedUntil!)) &&
    Date.parse(account.restrictedUntil!) > Date.now();
  if (account.status !== "active" || Boolean(account.deletedAt) || timedRestrictionActive)
    throw new AccessError("ACCOUNT_INACTIVE", 403);
  const hasRequiredRole =
    !role ||
    account.roles.includes(role) ||
    (role === "admin" && account.roles.includes("owner"));
  if (!hasRequiredRole)
    throw new AccessError("FORBIDDEN", 403);
  if (
    role === "admin" &&
    (identity.secondFactorAge === null ||
      !Number.isFinite(identity.secondFactorAge) ||
      identity.secondFactorAge < 0 ||
      identity.secondFactorAge > 720)
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
  if (account.roles.includes("owner") || account.roles.includes("admin"))
    return "/admin";
  if (account.roles.includes("professional")) return "/professional";
  if (account.roles.includes("customer")) return "/account";
  return "/onboarding";
}
