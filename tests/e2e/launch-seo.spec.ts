import { expect, test } from "@playwright/test";
test("public launch pages expose canonical metadata, robots and a public-only sitemap", async ({
  request,
}) => {
  for (const path of [
    "/",
    "/explore",
    "/discover",
    "/shop",
    "/about",
    "/faq",
    "/how-it-works",
  ]) {
    const response = await request.get(path, {
      headers: { "user-agent": "Googlebot" },
    });
    expect(response.status()).toBe(200);
    const html = await response.text();
    const canonical = /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1];
    expect(canonical, `Canonical for ${path}`).toBeDefined();
    expect(new URL(canonical!).origin).toBe("https://www.glohaus.shop");
    expect(new URL(canonical!).pathname).toBe(path);
    expect(html).toContain('name="robots" content="index, follow"');
  }
  for (const path of [
    "/cream-preview",
    "/customer-preview",
    "/professional-preview",
    "/admin",
    "/professional",
    "/messages",
  ]) {
    const response = await request.get(path, {
      headers: { "user-agent": "Googlebot" },
    });
    expect(await response.text()).toContain(
      'name="robots" content="noindex, nofollow"',
    );
  }
  expect(await (await request.get("/robots.txt")).text()).toContain(
    "Sitemap: https://www.glohaus.shop/sitemap.xml",
  );
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("https://www.glohaus.shop/explore");
  expect(sitemap).not.toContain("preview");
  expect(sitemap).not.toContain("/admin");
  expect(sitemap).not.toContain("/professional");
});
