import "server-only";
import { withOwner } from "@/modules/admin/repository";
import { engagementReport, reportingRange, type Observation } from "./domain";
import { engagementEnabled } from "./config";
export async function ownerEngagement(params: {
  period?: string;
  from?: string;
  to?: string;
  device?: string;
}) {
  const range = reportingRange(params);
  const device = ["mobile", "tablet", "desktop"].includes(params.device ?? "")
    ? params.device!
    : "all";
  if (!engagementEnabled())
    return {
      state: "disabled" as const,
      range,
      device,
      report: null,
      comparisons: [],
    };
  const data = await withOwner(
    async (db) =>
      (
        await db.query<{ data: Observation[] }>(
          "SELECT beauty.owner_engagement_rows($1,$2,$3) AS data",
          [range.from, range.to, "all"],
        )
      ).rows[0]?.data ?? [],
  );
  // Never present a truncated sample as complete analytics.
  if (data.length > 10000)
    return {
      state: "limit" as const,
      range,
      device,
      report: null,
      comparisons: [],
    };
  return {
    state: "ready" as const,
    range,
    device,
    report: engagementReport(
      device === "all" ? data : data.filter((r) => r.device === device),
    ),
    comparisons: (["mobile", "tablet", "desktop"] as const).map((device) => ({
      device,
      ...engagementReport(data.filter((r) => r.device === device)),
    })),
  };
}
