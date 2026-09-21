// Isolated, read-only visual fixture. Never imported by the application or deployed routes.
import { createRequire } from "node:module";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { createServer } from "node:http";
const require = createRequire(import.meta.url);
const vitestRequire = createRequire(require.resolve("vitest/package.json"));
const viteRequire = createRequire(vitestRequire.resolve("vite"));
const { build } = await import(
  pathToFileURL(viteRequire.resolve("esbuild")).href
);
await mkdir("reports", { recursive: true });
await build({
  entryPoints: ["tests/fixtures/profile-preview.tsx"],
  outfile: "reports/profile-fixture.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  packages: "external",
  jsx: "automatic",
  alias: {
    "next/navigation": resolve("tests/fixtures/next-navigation.ts"),
    "next/image": resolve("tests/fixtures/next-image.tsx"),
    "next/link": resolve("tests/fixtures/next-link.tsx"),
  },
  tsconfig: "tsconfig.json",
});
const { preview } = require(resolve("reports/profile-fixture.cjs"));
const css = await readFile("src/app/globals.css", "utf8");
const html = (editor) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>glohaus profile visual test</title><style>${css}\n.profile-test-banner{padding:12px;text-align:center;background:#663c49;color:white;font:10px system-ui;letter-spacing:1px}</style></head><body>${preview(editor)}</body></html>`;
await writeFile("reports/profile-preview.html", html(false));
const server = createServer((request, response) => {
  if (request.method !== "GET") {
    response.writeHead(405);
    response.end();
    return;
  }
  if (request.url?.startsWith("/api/media/")) {
    const colors = request.url.endsWith("design-two")
      ? ["#91506a", "#f6e4eb"]
      : request.url.endsWith("design-three")
        ? ["#e0d0b9", "#f8f1e7"]
        : ["#cc9294", "#f7e9e6"];
    response.writeHead(200, { "Content-Type": "image/svg+xml" });
    response.end(
      `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="750"><rect width="600" height="750" fill="${colors[1]}"/><ellipse cx="300" cy="350" rx="175" ry="240" fill="${colors[0]}"/><text x="300" y="390" fill="white" text-anchor="middle" font-family="Georgia" font-size="90">g.</text></svg>`,
    );
    return;
  }
  response.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(html(request.url === "/editor"));
});
server.listen(3002, "127.0.0.1", () =>
  console.log(
    "Read-only profile visual fixture: http://127.0.0.1:3002 (not the application)",
  ),
);
