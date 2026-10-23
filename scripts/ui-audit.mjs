// Local development harness; fictional data and mocked mutations only.
import { createRequire } from "node:module";
import { readFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { createServer } from "node:http";
const require = createRequire(import.meta.url);
const { prepareMapWorker } = await import("./prepare-map-worker.mjs");
await prepareMapWorker();
const vr = createRequire(require.resolve("vitest/package.json"));
const vite = createRequire(vr.resolve("vite"));
const { build } = await import(vite.resolve("esbuild"));
await mkdir("reports", { recursive: true });
const bundlePath = `reports/ui-audit-${createHash("sha256")
  .update(process.env.GLOHAUS_UI_AUDIT_ENTRY || "default")
  .digest("hex")
  .slice(0, 8)}.js`;
await build({
  entryPoints: [
    process.env.GLOHAUS_UI_AUDIT_ENTRY || "tests/fixtures/ui-audit/entry.tsx",
  ],
  outfile: bundlePath,
  bundle: true,
  platform: "browser",
  jsx: "automatic",
  define: { "process.env": "{}" },
  alias: {
    ...(process.env.GLOHAUS_UI_AUDIT_MOCK_BLOB === "1" ? {
      "@vercel/blob/client": resolve("tests/fixtures/content-blob-client.ts"),
    } : {}),
    "@/modules/admin/repository": resolve("tests/fixtures/ui-audit/data.ts"),
    "@/modules/commission/repository": resolve("tests/fixtures/ui-audit/data.ts"),
    "@/modules/professional-activity/repository": resolve("tests/fixtures/ui-audit/data.ts"),
    "@/modules/policies/repository": resolve("tests/fixtures/ui-audit/data.ts"),
    "@/modules/platform/repository": resolve("tests/fixtures/ui-audit/data.ts"),
    "@/modules/professionals/example-visibility-repository": resolve("tests/fixtures/ui-audit/data.ts"),
    "@/modules/shop/repository": resolve("tests/fixtures/ui-audit/data.ts"),
    "@/lib/db": resolve("tests/fixtures/customer-profile-data.ts"),
    "@/modules/accounts/customer-profile": resolve("tests/fixtures/customer-profile-data.ts"),
    "@/lib/page-access": resolve("tests/fixtures/ui-audit/data.ts"),
    "@/lib/supabase/client": resolve(process.env.GLOHAUS_UI_AUDIT_AUTH || "tests/fixtures/ui-audit/data.ts"),
    "next/navigation": resolve("tests/fixtures/next-navigation.ts"),
    "next/link": resolve("tests/fixtures/next-link.tsx"),
    "next/image": resolve("tests/fixtures/next-image.tsx"),
  },
  loader: { ".css": "empty" },
  tsconfig: "tsconfig.json",
});
const css = (await readFile("node_modules/maplibre-gl/dist/maplibre-gl.css", "utf8")) + "\n" + (
  await Promise.all(
    [
      "globals",
      "../components/taxonomy",
      "homepage-category-media",
      "ui-upgrades",
      "theme-compat",
      "customer-polish",
      "site-improvements",
      "design-system",
      "location",
      "explore/discovery-map",
      "../components/professional-profile",
      "../components/viewport-video",
      "../components/commission-control-centre",
      "../components/professional-policies",
      "../components/professional-activity",
      "../components/profile-examples",
      "../components/marketing-preferences",
      "../components/professional-notifications",
      "../components/appointment-arrival",
    ].map((name) => readFile(`src/app/${name}.css`, "utf8")),
  )
).join("\n");
export const server = createServer(async (req, res) => {
  if (req.method !== "GET") {
    res.writeHead(405).end();
    return;
  }
  if (req.url?.startsWith("/vendor/maplibre/")) {
    const name = req.url.slice("/vendor/maplibre/".length);
    if (!/^[A-Za-z0-9_.-]+\.mjs$/.test(name)) { res.writeHead(404).end(); return; }
    res.setHeader("Content-Type", "text/javascript");
    res.end(await readFile(`public/vendor/maplibre/${name}`));
    return;
  }
  if (req.url === "/audit.js") {
    res.setHeader("Content-Type", "text/javascript");
    res.end(await readFile(bundlePath));
    return;
  }
  res.setHeader("Content-Type", "text/html");
  res.end(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script src="/audit.js"></script></body></html>`,
  );
});
server.listen(3004, "127.0.0.1", () =>
  console.log("Local UI audit fixture on port 3004; mocked mutations only"),
);
