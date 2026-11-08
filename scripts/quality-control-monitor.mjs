import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

// Scheduled public HTTP-only monitoring. No authentication, personal data or transactions.
export const paths = ["/", "/shop", "/discover"];
export const incidentTitle = "[Quality Control] Public website availability incident";
const origin = "https://www.glohaus.shop";
const sleep = ms => new Promise(done => setTimeout(done, ms));

export async function probe(path, fetcher = fetch) {
  const started = Date.now();
  try {
    const response = await fetcher(origin + path, {
      method: "GET", redirect: "follow", cache: "no-store",
      headers: { Accept: "text/html" }, signal: AbortSignal.timeout(10000)
    });
    await response.body?.cancel();
    return { path, ok: response.ok, status: response.status, durationMs: Date.now() - started };
  } catch {
    return { path, ok: false, status: null, durationMs: Date.now() - started };
  }
}

export async function inspect(fetcher = fetch, pause = sleep) {
  const checks = await Promise.all(paths.map(async path => {
    const first = await probe(path, fetcher);
    if (first.ok) return { ...first, attempts: 1 };
    await pause(2000);
    return { ...await probe(path, fetcher), attempts: 2 };
  }));
  return { checkedAt: new Date().toISOString(), origin, healthy: checks.every(c => c.ok), checks,
    limitation: "Public HTTP status only. Booking, payments and authenticated journeys remain unverified." };
}

export function incidentBody(result) {
  return [
    "## Automated GLOHAUS public-page availability check",
    "Checked: " + result.checkedAt,
    "Production: " + origin,
    "",
    ...result.checks.map(c => "- " + c.path + ": " + (c.ok ? "OK" : "FAILED") +
      ", HTTP " + (c.status ?? "no response") + ", " + c.durationMs + "ms, attempts " + c.attempts),
    "",
    "Check the deployed production release and error logs before changing anything.",
    result.limitation,
    "This issue is managed automatically. No customer data is collected."
  ].join("\n");
}

async function api(suffix, method = "GET", data) {
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  if (!token || !repository || !/^[\w.-]+\/[\w.-]+$/.test(repository)) throw Error("Issue integration is not configured.");
  const response = await fetch("https://api.github.com/repos/" + repository + suffix, {
    method,
    headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" },
    ...(data ? { body: JSON.stringify(data) } : {}),
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw Error("GitHub incident update failed (" + response.status + ")");
  return response.json();
}

async function syncIssue(result) {
  const issues = await api("/issues?state=open&per_page=100");
  const current = issues.find(i => i.title === incidentTitle && !i.pull_request);
  if (!result.healthy) {
    if (current) {
      await api("/issues/" + current.number, "PATCH", { body: incidentBody(result) });
    } else {
      const created = await api("/issues", "POST", { title: incidentTitle, body: incidentBody(result) });
      const owner = process.env.GITHUB_REPOSITORY.split("/")[0];
      try { await api("/issues/" + created.number + "/assignees", "POST", { assignees: [owner] }); }
      catch { console.log("Issue created; owner assignment unavailable."); }
    }
  } else if (current) {
    await api("/issues/" + current.number, "PATCH", {
      state: "closed", state_reason: "completed",
      body: incidentBody(result) + "\n\nRecovered at " + result.checkedAt
    });
  }
}

async function main() {
  const result = await inspect();
  await writeFile("quality-control-monitor.json", JSON.stringify(result, null, 2) + "\n");
  console.log(result.checkedAt, result.checks.map(c => c.path + " " + (c.ok ? "OK" : "FAIL")).join("; "));
  await syncIssue(result);
  if (!result.healthy) { console.error("One or more public routes failed twice."); process.exitCode = 1; }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
