import { safeReturnTo } from "./return-to";

export type AuthAudience = "customer" | "professional";

export function storedAuthAudience(metadata: unknown): AuthAudience | null {
  if (!metadata || typeof metadata !== "object") return null;
  const audience = (metadata as Record<string, unknown>).glohaus_audience;
  return audience === "customer" || audience === "professional"
    ? audience
    : null;
}

export function confirmationPlan(
  next: string | null | undefined,
  metadata: unknown,
): { audience: AuthAudience; redirectTo: string } {
  const target = safeReturnTo(next, "/account");
  const parsed = new URL(target, "https://glohaus.invalid");
  const stored = storedAuthAudience(metadata);
  const explicitProfessional =
    parsed.pathname === "/onboarding" &&
    parsed.searchParams.get("intent") === "professional";

  if (stored === "professional" || explicitProfessional) {
    return {
      audience: "professional",
      redirectTo: "/onboarding?intent=professional",
    };
  }

  if (parsed.pathname === "/onboarding") {
    return {
      audience: "customer",
      redirectTo: safeReturnTo(parsed.searchParams.get("returnTo"), "/account"),
    };
  }

  return { audience: "customer", redirectTo: target };
}
