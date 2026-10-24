// Exercise the compiled standalone server through the same HTTPS/public-host
// headers used by the container ingress. No real credentials or provider writes.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cp, mkdir, writeFile } from "node:fs/promises";
await mkdir(".next/standalone/.next", { recursive: true });
await cp("public", ".next/standalone/public", { recursive: true });
await cp(".next/static", ".next/standalone/.next/static", { recursive: true });
const port = 3857;
const origin = "https://www.glohaus.shop";
const server = spawn(process.execPath, [".next/standalone/server.js"], {
  env: {
    PATH: process.env.PATH,
    HOSTNAME: "0.0.0.0",
    PORT: String(port),
    NODE_ENV: "production",
    VERCEL: "1",
    VERCEL_ENV: "production",
    NEXT_PUBLIC_APP_URL: origin,
    NEXT_PUBLIC_SUPABASE_URL: "https://fixture.supabase.test",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public-fixture-not-a-secret",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
    DATABASE_URL: "",
    PAYMENT_DATABASE_URL: "",
    STRIPE_SECRET_KEY: "",
    BLOB_READ_WRITE_TOKEN: "",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
// Consume diagnostics without printing request data, secrets or provider output.
let output = "";
server.stdout.on("data", (b) => {
  output += b.toString();
});
server.stderr.on("data", () => {});
const results = [];
try {
  for (let n = 0; n < 80; n++) {
    try {
      await fetch(`http://127.0.0.1:${port}/images/glohaus-splash-light.svg`, {
        signal: AbortSignal.timeout(500),
      });
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  async function check(
    path,
    { expectedStatus, expectedCode, originHeader = origin, body } = {},
  ) {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        host: "www.glohaus.shop",
        "x-forwarded-host": "www.glohaus.shop",
        "x-forwarded-proto": "https",
        origin: originHeader,
        "content-type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      redirect: "manual",
      signal: AbortSignal.timeout(10000),
    });
    assert.equal(response.status, expectedStatus, path);
    if (expectedCode)
      assert.equal((await response.json()).error.code, expectedCode, path);
    results.push({ path, status: response.status, code: expectedCode });
    return response;
  }
  await check("/api/v1/admin/homepage-media/upload", {
    body: {},
    expectedStatus: 401,
    expectedCode: "UNAUTHENTICATED",
  });
  await check("/api/v1/admin/homepage-media/upload", {
    body: {},
    originHeader: "https://untrusted.invalid",
    expectedStatus: 403,
    expectedCode: "FORBIDDEN",
  });
  await check("/api/v1/admin/homepage-media/categories", {
    body: {
      images: { desktop: {}, mobile: {} },
      names: { desktop: {}, mobile: {} },
      metadata: { desktop: {}, mobile: {} },
      reason: "Isolated proxy check",
    },
    expectedStatus: 401,
    expectedCode: "UNAUTHENTICATED",
  });
  const callback = await check("/auth/callback", { expectedStatus: 307 });
  assert.equal(
    callback.headers.get("location"),
    `${origin}/sign-in?authError=missing_code`,
  );
  await check(
    "/api/homepage-media?image=homepage%2F11111111-1111-4111-8111-111111111111-fixture.webp",
    { expectedStatus: 404 },
  );
  assert.ok(output.includes(process.version));
  await mkdir("reports", { recursive: true });
  await writeFile(
    "reports/proxied-origin-results.json",
    JSON.stringify(
      { node: process.version, providerWrites: 0, results },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({ node: process.version, providerWrites: 0, results }),
  );
} finally {
  if (server.exitCode === null && server.signalCode === null) {
    const stopped = new Promise((r) => server.once("exit", r));
    server.kill("SIGTERM");
    const timer = setTimeout(() => server.kill("SIGKILL"), 3000);
    await stopped;
    clearTimeout(timer);
  }
}
