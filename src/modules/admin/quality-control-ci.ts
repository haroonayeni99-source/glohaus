const SCHEDULE_MAX_AGE_MS = 90 * 60 * 1000;

export type GithubRun = {
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

export function summarizeRuns(runs: GithubRun[], currentCommit: string | null, now = Date.now()) {
  const main = runs.filter((run) => run.head_branch === "main" || run.event === "schedule");
  const latest = (name: string, event?: string) =>
    main.find((run) => run.name === name && (!event || run.event === event)) ?? null;
  const monitor = latest("GLOHAUS automated Quality Control");
  const verify = latest("Verify GLOHAUS", "push");
  const foundation = latest("Verify foundation", "push");
  const critical = latest("Critical customer journeys QA");
  const criticalAgeMs = critical ? now - Date.parse(critical.created_at) : null;
  const criticalStale = criticalAgeMs === null || !Number.isFinite(criticalAgeMs) || criticalAgeMs > 36 * 60 * 60 * 1000;
  const monitorAgeMs = monitor ? now - Date.parse(monitor.created_at) : null;
  const monitorStale = monitorAgeMs === null || !Number.isFinite(monitorAgeMs) || monitorAgeMs > SCHEDULE_MAX_AGE_MS;
  const matches = (run: GithubRun | null) => !!run && !!currentCommit && run.head_sha === currentCommit;
  const latestChecksMatch = matches(verify) && matches(foundation);
  const healthy = monitor?.conclusion === "success";
  let readiness: "BLOCKED" | "NEEDS REVIEW" | "CHECKS PASS" = "NEEDS REVIEW";
  if ((latestChecksMatch && (verify?.conclusion === "failure" || foundation?.conclusion === "failure")) || critical?.conclusion === "failure") readiness = "BLOCKED";
  else if (latestChecksMatch && verify?.conclusion === "success" && foundation?.conclusion === "success" && critical?.conclusion === "success" && !criticalStale && healthy && !monitorStale)
    readiness = "CHECKS PASS";
  return {
    checkedAt: new Date(now).toISOString(),
    monitoring: { run: monitor, stale: monitorStale, healthy, expectedCadenceMinutes: 30 },
    verification: { run: verify, matchesRunningCommit: matches(verify) },
    foundation: { run: foundation, matchesRunningCommit: matches(foundation) },
    criticalJourneys: { run: critical, stale: criticalStale, scheduledDaily: true },
    runningDeployment: { environment: process.env.VERCEL_ENV ?? "unknown", commit: currentCommit },
    readiness,
    releaseApproval: "NOT APPROVED",
    caveat: "Critical-journey checks use isolated fixtures, not live charges or real customer accounts. Automated tests are not full production approval.",
  };
}

