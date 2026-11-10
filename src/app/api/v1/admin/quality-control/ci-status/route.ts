import { withOwner } from "@/modules/admin/repository";
import { apiError } from "@/lib/http";

export const dynamic = "force-dynamic";

const REPO = "haroonayeni99-source/glohaus";
const API = "https://api.github.com/repos/" + REPO;
const ROOT = "https://github.com/" + REPO;
const SCHEDULE_MAX_AGE_MS = 90 * 60 * 1000;

type GithubRun = {
  id: number;
  name: string;
  event: string;
  head_branch: string | null;
  head_sha: string;
  status: string;
  conclusion: string | null;
  created_at: string;
  html_url: string;
};
type Job = { name: string; conclusion: string | null };

async function githubGet<T>(suffix: string): Promise<T> {
  const response = await fetch(API + suffix, {
    method: "GET",
    headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    // Reuse upstream data briefly, while keeping the Owner-facing response private.
    next: { revalidate: 60 },
    signal: AbortSignal.timeout(7000),
  });
  if (!response.ok) throw new Error("Quality Control source unavailable");
  return response.json() as Promise<T>;
}

export function summarizeRuns(runs: GithubRun[], currentCommit: string | null, now = Date.now()) {
  const main = runs.filter((run) => run.head_branch === "main" || run.event === "schedule");
  const latest = (name: string, event?: string) =>
    main.find((run) => run.name === name && (!event || run.event === event)) ?? null;
  const monitor = latest("GLOHAUS automated Quality Control");
  const verify = latest("Verify GLOHAUS", "push");
  const foundation = latest("Verify foundation", "push");
  const monitorAgeMs = monitor ? now - Date.parse(monitor.created_at) : null;
  const monitorStale = monitorAgeMs === null || !Number.isFinite(monitorAgeMs) || monitorAgeMs > SCHEDULE_MAX_AGE_MS;
  const matches = (run: GithubRun | null) => !!run && !!currentCommit && run.head_sha === currentCommit;
  const latestChecksMatch = matches(verify) && matches(foundation);
  const healthy = monitor?.conclusion === "success";
  let readiness: "BLOCKED" | "NEEDS REVIEW" | "CHECKS PASS" = "NEEDS REVIEW";
  if (latestChecksMatch && (verify?.conclusion === "failure" || foundation?.conclusion === "failure")) readiness = "BLOCKED";
  else if (latestChecksMatch && verify?.conclusion === "success" && foundation?.conclusion === "success" && healthy && !monitorStale)
    readiness = "CHECKS PASS";
  return {
    checkedAt: new Date(now).toISOString(),
    monitoring: { run: monitor, stale: monitorStale, healthy, expectedCadenceMinutes: 30 },
    verification: { run: verify, matchesRunningCommit: matches(verify) },
    foundation: { run: foundation, matchesRunningCommit: matches(foundation) },
    runningDeployment: { environment: process.env.VERCEL_ENV ?? "unknown", commit: currentCommit },
    readiness,
    releaseApproval: "NOT APPROVED",
    caveat: "These are CI and public-route checks only. No production payments or authenticated journeys were exercised by this dashboard.",
  };
}

export async function GET() {
  try {
    await withOwner(async () => true);
    const isProduction = process.env.VERCEL_ENV === "production";
    const commit = isProduction ? (process.env.VERCEL_GIT_COMMIT_SHA ?? null) : null;
    const result = await githubGet<{ workflow_runs: GithubRun[] }>("/actions/runs?per_page=50");
    const summary = summarizeRuns(result.workflow_runs ?? [], commit);
    const failure = summary.foundation.run?.conclusion === "failure" && summary.foundation.matchesRunningCommit;
    let failedJobs: string[] = [];
    if (failure) {
      try {
        const jobResult = await githubGet<{ jobs: Job[] }>("/actions/runs/" + summary.foundation.run!.id + "/jobs?per_page=100");
        failedJobs = (jobResult.jobs ?? []).filter((job) => job.conclusion === "failure").map((job) => job.name).slice(0, 15);
      } catch {
        // Preserve known failure state even if optional job detail cannot be retrieved.
      }
    }
    return Response.json({
      ...summary,
      failedJobs,
      links: {
        monitor: ROOT + "/actions/workflows/quality-control-monitor.yml",
        verification: ROOT + "/actions/workflows/verify.yml",
        issues: ROOT + "/issues?q=is%3Aissue+%22%5BQuality+Control%5D%22",
      },
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
