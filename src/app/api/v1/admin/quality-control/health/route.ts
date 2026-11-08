import { withOwner } from "@/modules/admin/repository";
import { apiError } from "@/lib/http";

export const dynamic = "force-dynamic";
const PUBLIC_ORIGIN = "https://www.glohaus.shop";
const paths = ["/", "/shop", "/discover"] as const;

async function check(path: string) {
  const started = Date.now();
  try {
    const response = await fetch(PUBLIC_ORIGIN + path, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(7000),
      headers: { Accept: "text/html" },
    });
    await response.body?.cancel();
    return { path, ok: response.ok, status: response.status, durationMs: Date.now() - started };
  } catch {
    return { path, ok: false, status: null, durationMs: Date.now() - started };
  }
}

export async function GET() {
  try {
    // Authenticate and verify Owner permissions before probing or returning deployment metadata.
    await withOwner(async () => true);
    const checks = await Promise.all(paths.map(check));
    return Response.json({
      checkedAt: new Date().toISOString(),
      source: "Public, unauthenticated HTTP checks only",
      checks,
      runningDeployment: {
        environment: process.env.VERCEL_ENV ?? "unknown",
        commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
        branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
      },
      caveat: "HTTP success does not verify booking, payments, logged-in tools or complete release readiness.",
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
