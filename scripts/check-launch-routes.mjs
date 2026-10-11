// Read-only, signed-out inventory of all page routes against a locally built server.
import { spawn } from "node:child_process";
import { readdir, mkdir, writeFile, open } from "node:fs/promises";
const base = "http://127.0.0.1:3007";
async function pages(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) =>
        entry.isDirectory()
          ? pages(`${dir}/${entry.name}`)
          : entry.name === "page.tsx"
            ? [`${dir}/${entry.name}`]
            : [],
      ),
    )
  ).flat();
}
const paths = (await pages("src/app")).map((file) => ({
  source: file,
  path:
    "/" +
    file
      .replace(/^src\/app\/?/, "")
      .replace(/\/?page\.tsx$/, "")
      .replace(/\[\[\.\.\.[^\]]+\]\]/g, "")
      .replace(/\[slug\]/g, "missing-qa-profile")
      .replace(/\[[^\]]+\]/g, "00000000-0000-4000-8000-000000000000")
      .replace(/\/$/, ""),
}));
await mkdir("reports", { recursive: true });
const log = await open("reports/launch-routes-next.log", "w");
const child = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3007",
  ],
  {
    stdio: ["ignore", log.fd, log.fd],
    env: {
      ...process.env,
      DATABASE_URL: "",
      NEXT_PUBLIC_APP_URL: base,
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
    },
  },
);
const publicRoutes = new Set([
  "/",
  "/explore",
  "/discover",
  "/shop",
  "/about",
  "/faq",
  "/how-it-works",
]);
const results = [];
try {
  for (let n = 0; n < 120; n++) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {}
    if (n === 119) throw new Error("Route server failed to start");
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  for (const { path, source } of paths) {
    const response = await fetch(`${base}${path}`, {
      headers: { "user-agent": "Googlebot" },
    });
    const html = await response.text();
    const indexable = /name="robots" content="index, follow"/.test(html);
    const noindex = /name="robots" content="noindex/.test(html);
    const result = {
      source,
      path,
      status: response.status,
      destination: new URL(response.url).pathname,
      indexable,
      noindex,
    };
    results.push(result);
    if (
      response.status >= 500 ||
      (!publicRoutes.has(path) && !noindex) ||
      (publicRoutes.has(path) && !indexable)
    )
      throw new Error(`Unexpected route result: ${JSON.stringify(result)}`);
  }
  await writeFile(
    "reports/launch-route-results.json",
    JSON.stringify(results, null, 2),
  );
  console.log(
    `${results.length} page routes checked; no server errors; only approved public pages indexable`,
  );
} finally {
  child.kill("SIGTERM");
  await log.close();
}
