// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  publicRuntimeConfiguration,
  readPublicEnvironment,
  serializePublicRuntimeConfiguration,
} from "@/lib/public-runtime-config";
afterEach(() => {
  document.getElementById("glohaus-public-configuration")?.remove();
  vi.unstubAllEnvs();
});
it("reads the public server configuration before creating the browser auth client", () => {
  const script = document.createElement("script");
  script.id = "glohaus-public-configuration";
  script.type = "application/json";
  script.textContent = JSON.stringify({
    NEXT_PUBLIC_SUPABASE_URL: "https://fixture.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public-fixture-only",
  });
  document.head.append(script);
  expect(readPublicEnvironment("NEXT_PUBLIC_SUPABASE_URL")).toBe(
    "https://fixture.supabase.co",
  );
  expect(readPublicEnvironment("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")).toBe(
    "public-fixture-only",
  );
  expect(
    readPublicEnvironment("NEXT_PUBLIC_CARTO_BASEMAPS_KEY"),
  ).toBeUndefined();
});
it("never serializes private environment fields", () => {
  vi.stubEnv("STRIPE_SECRET_KEY", "private-fixture-marker");
  vi.stubEnv("DATABASE_URL", "private-database-fixture");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://fixture.supabase.co");
  expect(publicRuntimeConfiguration()).toHaveProperty(
    "NEXT_PUBLIC_SUPABASE_URL",
    "https://fixture.supabase.co",
  );
  const text = serializePublicRuntimeConfiguration();
  expect(text).not.toContain("STRIPE");
  expect(text).not.toContain("DATABASE_URL");
  expect(text).not.toContain("private-fixture");
  expect(readPublicEnvironment("STRIPE_SECRET_KEY" as never)).toBeUndefined();
});
it("escapes script-closing and Unicode separators while preserving JSON values", () => {
  const value = "public-fixture</script><script>alert(1)</script>\u2028\u2029";
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", value);
  const text = serializePublicRuntimeConfiguration();
  expect(text).not.toContain("</script>");
  expect(text).not.toContain("\u2028");
  expect(JSON.parse(text).NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).toBe(value);
});
it("treats malformed browser bootstrap data as unavailable public configuration", () => {
  const script = document.createElement("script");
  script.id = "glohaus-public-configuration";
  script.type = "application/json";
  script.textContent = "not-json";
  document.head.append(script);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://fallback.supabase.co");
  expect(readPublicEnvironment("NEXT_PUBLIC_SUPABASE_URL")).toBe(
    "https://fallback.supabase.co",
  );
});
