import { expect, it } from "vitest";
import { emailAuthCallbackUrl } from "@/lib/email-auth-callback";

it.each(["glohaus.shop", "www.glohaus.shop"])("preserves the current production origin %s", host => {
  expect(emailAuthCallbackUrl(`https://${host}/sign-up`, "/account")).toBe(`https://${host}/auth/callback?next=%2Faccount`);
});
it("keeps an explicitly isolated HTTPS preview on its own origin", () => {
  expect(emailAuthCallbackUrl("https://validation.vercel.app/sign-up", "/reset-password", true)).toBe("https://validation.vercel.app/auth/callback?next=%2Freset-password");
});
it.each([
 ["https://validation.vercel.app/sign-up", false],
 ["http://validation.vercel.app/sign-up", true],
 ["https://evil.invalid/sign-up", true],
 ["https://validation.vercel.app.evil.invalid/sign-up", true],
])("keeps untrusted or ordinary preview callbacks canonical", (origin, enabled) => {
  expect(emailAuthCallbackUrl(origin, "/account", enabled)).toBe("https://www.glohaus.shop/auth/callback?next=%2Faccount");
});
