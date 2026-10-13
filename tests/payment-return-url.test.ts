import { describe, expect, it, vi } from "vitest";
import {
  bookingCancelPath,
  legacyCheckoutReturn,
  paymentReturnOrigin,
} from "@/modules/payments/return-url";

const bookingId = "11111111-1111-4111-8111-111111111111";
describe("Checkout return navigation", () => {
  it("uses the customer's actual site instead of an outdated application URL", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://glohaus1.vercel.app");
    expect(
      paymentReturnOrigin(
        new Request("https://www.glohaus.shop/api/v1/bookings"),
      ),
    ).toBe("https://www.glohaus.shop");
    vi.unstubAllEnvs();
  });
  it.each([
    "glohaus.shop",
    "glohaus1.vercel.app",
    "glohaus1-haroon-glohaus.vercel.app",
    "glohaus1-git-main-haroon-glohaus.vercel.app",
  ])("keeps %s payment returns on the public hostname", (host) => {
    expect(
      paymentReturnOrigin(new Request(`https://${host}/api/v1/bookings`)),
    ).toBe("https://www.glohaus.shop");
  });
  it.each(["http://127.0.0.1:3000", "https://isolated-glohaus.vercel.app"])(
    "keeps isolated tests and previews on %s",
    (origin) => {
      expect(
        paymentReturnOrigin(new Request(`${origin}/api/v1/bookings`)),
      ).toBe(origin);
    },
  );
  it("takes service checkout Back to the same professional's booking section", () => {
    const request = new Request("https://www.glohaus.shop/api/v1/bookings", {
      headers: { referer: "https://www.glohaus.shop/p/my-studio?service=hair" },
    });
    expect(bookingCancelPath(request, bookingId)).toBe(
      "/p/my-studio?service=hair#booking",
    );
  });
  it.each([
    "https://evil.test/p/my-studio",
    "https://www.glohaus.shop/absent-page",
    "javascript:alert(1)",
    "https://www.glohaus.shop/p/escaped%2fpath",
    "",
  ])("does not use an untrusted or invalid referrer: %s", (referer) => {
    const request = new Request("https://www.glohaus.shop/api/v1/bookings", {
      headers: { referer },
    });
    expect(bookingCancelPath(request, bookingId)).toBe(
      `/account/bookings/${bookingId}?checkout=cancelled`,
    );
  });
  it.each([
    `/account/bookings/${bookingId}`,
    "/cart?checkout=cancelled",
    "/account/orders?checkout=success",
    "/professional/plans?subscription=cancelled",
  ])("repairs an already-issued legacy return link: %s", (path) => {
    expect(
      legacyCheckoutReturn(new Request(`https://glohaus1.vercel.app${path}`))
        ?.href,
    ).toBe(`https://www.glohaus.shop${path}`);
  });
  it("keeps POST requests, canonical URLs and unrelated/preview pages unchanged", () => {
    expect(
      legacyCheckoutReturn(
        new Request("https://glohaus1.vercel.app/cart", { method: "POST" }),
      ),
    ).toBeNull();
    expect(
      legacyCheckoutReturn(new Request("https://www.glohaus.shop/cart")),
    ).toBeNull();
    expect(
      legacyCheckoutReturn(
        new Request("https://glohaus1.vercel.app/absent-page"),
      ),
    ).toBeNull();
    expect(
      legacyCheckoutReturn(
        new Request("https://isolated-glohaus.vercel.app/cart"),
      ),
    ).toBeNull();
  });
});
