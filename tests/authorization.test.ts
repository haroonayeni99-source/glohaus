import { describe, expect, it } from "vitest";
import {
  authorize,
  authorizeProfessional,
  enrolmentSchema,
  type Account,
  type Identity,
} from "@/modules/accounts/domain";

const identity: Identity = {
  authId: "user_alex",
  email: "alex@example.test",
  displayName: "Alex",
  secondFactorAge: null,
};
const account: Account = {
  id: "a",
  authId: identity.authId,
  email: identity.email,
  displayName: "Alex",
  status: "active",
  roles: ["customer"],
  professionalId: null,
};
describe("authorization", () => {
  it("allows customers into their own account", () =>
    expect(authorize(account, identity, "customer")).toEqual(account));
  it("rejects another identity", () =>
    expect(() =>
      authorize(account, { ...identity, authId: "user_other" }),
    ).toThrow("FORBIDDEN"));
  it("requires enrollment", () =>
    expect(() => authorize(null, identity)).toThrow("ONBOARDING_REQUIRED"));
  it.each(["suspended", "removed"] as const)(
    "denies %s users even with admin role",
    (status) => {
      expect(() =>
        authorize(
          { ...account, status, roles: ["admin"] },
          { ...identity, secondFactorAge: 0 },
          "admin",
        ),
      ).toThrow("ACCOUNT_INACTIVE");
    },
  );
  it("does not treat customer as professional", () =>
    expect(() => authorize(account, identity, "professional")).toThrow(
      "FORBIDDEN",
    ));
  it("does not infer professional access from admin role", () =>
    expect(() =>
      authorize({ ...account, roles: ["admin"] }, identity, "professional"),
    ).toThrow("FORBIDDEN"));
  it.each([null, -1, 16, Infinity, NaN])(
    "rejects admin access without recent MFA (%s)",
    (secondFactorAge) => {
      expect(() =>
        authorize(
          { ...account, roles: ["admin"] },
          { ...identity, secondFactorAge },
          "admin",
        ),
      ).toThrow("MFA_REQUIRED");
    },
  );
  it("accepts admin with recent second factor", () =>
    expect(
      authorize(
        { ...account, roles: ["admin"] },
        { ...identity, secondFactorAge: 15 },
        "admin",
      ).id,
    ).toBe("a"));
  it("allows the single owner through the protected admin route with recent MFA", () =>
    expect(
      authorize(
        { ...account, roles: ["owner"] },
        { ...identity, secondFactorAge: 0 },
        "admin",
      ).id,
    ).toBe("a"));
  it("prevents cross-professional access", () =>
    expect(() =>
      authorizeProfessional(
        { ...account, roles: ["professional"], professionalId: "one" },
        identity,
        "two",
      ),
    ).toThrow("FORBIDDEN"));
  it("accepts the owning professional", () =>
    expect(
      authorizeProfessional(
        { ...account, roles: ["professional"], professionalId: "one" },
        identity,
        "one",
      ).id,
    ).toBe("a"));
  it.each([
    { role: "admin" },
    { role: "customer", authId: "another" },
    { role: "professional", status: "active" },
    { role: "customer", roles: ["admin"] },
  ])("rejects forged enrollment: %j", (input) =>
    expect(enrolmentSchema.safeParse(input).success).toBe(false),
  );
});
