import { beforeEach, expect, it, vi } from "vitest";
import { GET, summarizeRuns } from "@/app/api/v1/admin/quality-control/ci-status/route";

const mock = vi.hoisted(() => ({ owner: true, fetch: vi.fn() }));
vi.mock("@/modules/admin/repository", () => ({
  withOwner: async (fn: () => Promise<unknown>) => {
    if (!mock.owner) throw Error("FORBIDDEN");
    return fn();
  },
}));
vi.mock("@/lib/http", () => ({
  apiError: () => Response.json({ error: "Forbidden" }, { status: 403 }),
}));
const SHA = "1".repeat(40);
const now = Date.parse("2026-11-10T06:50:00.000Z");
function run(name: string, conclusion: string, id: number, event = "push", createdAt = now - 10 * 60_000, sha = SHA) {
  return {
    name, conclusion, id, event, created_at: new Date(createdAt).toISOString(),
    head_branch: "main", head_sha: sha, status: "completed",
    html_url: "https://github.com/haroonayeni99-source/glohaus/actions/runs/" + id,
  };
}

beforeEach(() => {
  mock.owner = true;
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("VERCEL_GIT_COMMIT_SHA", SHA);
  mock.fetch.mockReset();
  vi.stubGlobal("fetch", mock.fetch);
});

it("rejects non-owner before calling GitHub", async () => {
  mock.owner = false;
  const response = await GET();
  expect(response.status).toBe(403);
  expect(mock.fetch).not.toHaveBeenCalled();
});

it("marks failed foundation checks as BLOCKED despite a green site monitor", async () => {
  const runs = [
    run("GLOHAUS automated Quality Control", "success", 4, "schedule"),
    run("Verify GLOHAUS", "success", 3),
    run("Verify foundation", "failure", 2),
  ];
  mock.fetch
    .mockResolvedValueOnce(Response.json({ workflow_runs: runs }))
    .mockResolvedValueOnce(Response.json({ jobs: [{ name: "admin-workspace", conclusion: "success" }, { name: "auth-session", conclusion: "failure" }] }));
  const response = await GET();
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toContain("no-store");
  const result = await response.json();
  expect(result.readiness).toBe("BLOCKED");
  expect(result.releaseApproval).toBe("NOT APPROVED");
  expect(result.failedJobs).toEqual(["auth-session"]);
  expect(mock.fetch).toHaveBeenCalledTimes(2);
  const request = mock.fetch.mock.calls[0];
  expect(request[0]).toMatch(/^https:\/\/api\.github\.com\/repos\/haroonayeni99-source\/glohaus\/actions\/runs/);
  expect(request[1].headers).not.toHaveProperty("Authorization");
  expect(request[1].headers).not.toHaveProperty("Cookie");
});

it("marks old scheduled monitoring as stale and prevents all-clear", () => {
  const summary = summarizeRuns([
    run("GLOHAUS automated Quality Control", "success", 1, "schedule", now - 3 * 60 * 60_000),
    run("Verify GLOHAUS", "success", 2),
    run("Verify foundation", "success", 3),
  ], SHA, now);
  expect(summary.monitoring.stale).toBe(true);
  expect(summary.readiness).toBe("NEEDS REVIEW");
});

it("never treats checks for an older commit as verification of the current build", () => {
  const result = summarizeRuns([
    run("GLOHAUS automated Quality Control", "success", 1, "schedule"),
    run("Verify GLOHAUS", "success", 2, "push", now - 1000, "0".repeat(40)),
    run("Verify foundation", "success", 3, "push", now - 1000, "0".repeat(40)),
  ], SHA, now);
  expect(result.readiness).toBe("NEEDS REVIEW");
  expect(result.verification.matchesRunningCommit).toBe(false);
});

it("reports checks passing but retains Owner release approval requirement", () => {
  const result = summarizeRuns([
    run("GLOHAUS automated Quality Control", "success", 1, "schedule"),
    run("Verify GLOHAUS", "success", 2),
    run("Verify foundation", "success", 3),
  ], SHA, now);
  expect(result.readiness).toBe("CHECKS PASS");
  expect(result.releaseApproval).toBe("NOT APPROVED");
});

it("prevents failure-state masking if optional job details cannot be fetched", async () => {
  mock.fetch
    .mockResolvedValueOnce(Response.json({ workflow_runs: [
      run("Verify GLOHAUS", "success", 2), run("Verify foundation", "failure", 3),
    ] }))
    .mockRejectedValueOnce(new Error("GitHub temporarily unavailable"));
  const response = await GET();
  const result = await response.json();
  expect(result.readiness).toBe("BLOCKED");
  expect(result.failedJobs).toEqual([]);
});
