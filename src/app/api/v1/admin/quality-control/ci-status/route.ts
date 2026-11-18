import { summarizeRuns, type GithubRun } from "@/modules/admin/quality-control-ci";
import { withOwner } from "@/modules/admin/repository";
import { apiError } from "@/lib/http";

export const dynamic = "force-dynamic";

const REPO = "haroonayeni99-source/glohaus";
const API = "https://api.github.com/repos/" + REPO;
const ROOT = "https://github.com/" + REPO;

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

export async function GET() {
  try {
    await withOwner(async () => true);
    const isProduction = process.env.VERCEL_ENV === "production";
    const commit = isProduction ? (process.env.VERCEL_GIT_COMMIT_SHA ?? null) : null;
    const result = await githubGet<{ workflow_runs: GithubRun[] }>("/actions/runs?per_page=50");
    const summary = summarizeRuns(result.workflow_runs ?? [], commit);
    const failure = summary.foundation.run?.conclusion === "failure" && summary.foundation.matchesRunningCommit;
    const criticalFailure = summary.criticalJourneys.run?.conclusion === "failure";
    let failedJobs: string[] = [];
    if (failure) {
      try {
        const jobResult = await githubGet<{ jobs: Job[] }>("/actions/runs/" + summary.foundation.run!.id + "/jobs?per_page=100");
        failedJobs = (jobResult.jobs ?? []).filter((job) => job.conclusion === "failure").map((job) => job.name).slice(0, 15);
      } catch {
        // Preserve known failure state even if optional job detail cannot be retrieved.
      }
    }
    let criticalFailedJobs: string[] = [];
    if (criticalFailure) {
      try {
        const jobs = await githubGet<{ jobs: Job[] }>("/actions/runs/" + summary.criticalJourneys.run!.id + "/jobs?per_page=100");
        criticalFailedJobs = (jobs.jobs ?? []).filter((job) => job.conclusion === "failure").map((job) => job.name).slice(0, 10);
      } catch {
        // Keep failed readiness even without optional job detail.
      }
    }
    return Response.json({
      ...summary,
      failedJobs,
      criticalFailedJobs,
      links: {
        monitor: ROOT + "/actions/workflows/quality-control-monitor.yml",
        critical: ROOT + "/actions/workflows/critical-journeys.yml",
        verification: ROOT + "/actions/workflows/verify.yml",
        issues: ROOT + "/issues?q=is%3Aissue+%22%5BQuality+Control%5D%22",
      },
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
