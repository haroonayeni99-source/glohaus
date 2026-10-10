// Local development harness; fictional data and mocked mutations only.
import { createRequire } from "node:module";
import { readFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "node:http";
const require = createRequire(import.meta.url);
const vr = createRequire(require.resolve("vitest/package.json"));
const vite = createRequire(vr.resolve("vite"));
const { build } = await import(vite.resolve("esbuild"));
await mkdir("reports", { recursive: true });
await build({ entryPoints: [process.env.GLOHAUS_UI_AUDIT_ENTRY || "tests/fixtures/ui-audit/entry.tsx"], outfile: "reports/ui-audit.js", bundle: true, platform: "browser", jsx: "automatic", define: { "process.env": "{}" }, alias: {
  "@/modules/admin/repository": resolve("tests/fixtures/ui-audit/data.ts"),
  "@/modules/platform/repository": resolve("tests/fixtures/ui-audit/data.ts"),
  "@/lib/page-access": resolve("tests/fixtures/ui-audit/data.ts"),
  "@/lib/supabase/client": resolve("tests/fixtures/ui-audit/data.ts"),
  "next/navigation": resolve("tests/fixtures/next-navigation.ts"),
  "next/link": resolve("tests/fixtures/next-link.tsx"),
  "next/image": resolve("tests/fixtures/next-image.tsx"),
}, tsconfig: "tsconfig.json" });
const css = (await Promise.all(["globals", "ui-upgrades", "theme-compat", "customer-polish", "site-improvements"].map(name => readFile(`src/app/${name}.css`, "utf8")))).join("\n");
export const server = createServer(async (req, res) => {
  if (req.method !== "GET") { res.writeHead(405).end(); return; }
  if (req.url === "/audit.js") { res.setHeader("Content-Type", "text/javascript"); res.end(await readFile("reports/ui-audit.js")); return; }
  res.setHeader("Content-Type", "text/html");
  res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script src="/audit.js"></script></body></html>`);
});
server.listen(3004, "127.0.0.1", () => console.log("Local UI audit fixture on port 3004; mocked mutations only"));
