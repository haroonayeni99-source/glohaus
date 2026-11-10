"use client";

import { useEffect, useState } from "react";

type Run = {
  id: number;
  name: string;
  conclusion: string | null;
  status: string;
  created_at: string;
  html_url: string;
  head_sha: string;
};
type Status = {
  checkedAt: string;
  monitoring: { run: Run | null; stale: boolean; healthy: boolean; expectedCadenceMinutes: number };
  verification: { run: Run | null; matchesRunningCommit: boolean };
  foundation: { run: Run | null; matchesRunningCommit: boolean };
  runningDeployment: { environment: string; commit: string | null };
  failedJobs: string[];
  readiness: "BLOCKED" | "NEEDS REVIEW" | "CHECKS PASS";
  releaseApproval: string;
  caveat: string;
  links: { monitor: string; verification: string; issues: string };
};

const panel: React.CSSProperties = {
  background: "#fff7fb",
  color: "#382138",
  padding: 20,
  borderRadius: 20,
  border: "1px solid rgba(213,141,181,.28)",
};
const link: React.CSSProperties = { color: "#842957", textDecoration: "underline", fontWeight: 650 };
const label = (run: Run | null) => run ? run.conclusion ?? run.status : "No recorded run";
const age = (run: Run | null) => run
  ? new Date(run.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })
  : "No recorded run";

export function OwnerQualityReleaseStatus() {
  const [data, setData] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh(signal?: AbortSignal) {
    setBusy(true);
    try {
      const response = await fetch("/api/v1/admin/quality-control/ci-status", { cache: "no-store", signal });
      if (!response.ok) throw new Error(response.status === 403 ? "Owner access required" : "Release checks could not be retrieved");
      const next = await response.json() as Status;
      if (!signal?.aborted) { setData(next); setError(""); }
    } catch (cause) {
      if (!signal?.aborted) { setData(null); setError(cause instanceof Error ? cause.message : "Status unavailable"); }
    } finally {
      if (!signal?.aborted) setBusy(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    const initial = window.setTimeout(() => void refresh(controller.signal), 0);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh(controller.signal);
    }, 300000);
    return () => { controller.abort(); window.clearTimeout(initial); window.clearInterval(interval); };
  }, []);

  return <section aria-label="Automated release readiness and regression results" style={panel}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12, flexWrap: "wrap" }}>
      <div>
        <h2 style={{ margin: "0 0 5px" }}>Automated release checks</h2>
        <p style={{ margin: 0 }}>Live GitHub Actions status for your production code and scheduled monitoring.</p>
      </div>
      <button type="button" onClick={() => void refresh()} disabled={busy}
        style={{ border: "1px solid #ad6b91", padding: "10px 14px", borderRadius: 10, background: "#f9e7f1", color: "#592440", fontWeight: 700 }}>
        {busy ? "Refreshing…" : "Refresh checks"}
      </button>
    </div>
    {error && <p role="alert" style={{ color: "#922b49" }}>Status unavailable: {error}. Release remains unverified.</p>}
    {data && <>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", margin: "14px 0" }}>
        <strong style={{ borderRadius: 10, padding: "8px 12px", background: data.readiness === "BLOCKED" ? "#f5d3dc" : data.readiness === "CHECKS PASS" ? "#d6ebdd" : "#f4e3c5" }}>
          {data.readiness}
        </strong>
        <span style={{ fontSize: 13 }}>Owner release approval: <strong>{data.releaseApproval}</strong></span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10 }}>
        {([
          ["Scheduled monitor", data.monitoring.run, data.monitoring.stale ? "STALE / delayed" : "Recent run"],
          ["Main build & tests", data.verification.run, data.verification.matchesRunningCommit ? "Matches deployed build" : "Commit not confirmed"],
          ["Foundation regressions", data.foundation.run, data.foundation.matchesRunningCommit ? "Matches deployed build" : "Commit not confirmed"],
        ] as const).map(([title, run, note]) => <div key={title} style={{ border: "1px solid #d5a6bc", borderRadius: 12, padding: 12 }}>
          <strong>{title}</strong>
          <p style={{ margin: "6px 0", fontWeight: 700 }}>{label(run)}</p>
          <p style={{ margin: "4px 0", fontSize: 12 }}>{note} · {age(run)}</p>
          {run && <a style={link} href={run.html_url} target="_blank" rel="noopener noreferrer">View test report</a>}
        </div>)}
      </div>
      {data.failedJobs.length > 0 && <div style={{ marginTop: 12 }}>
        <strong>Foundation checks needing attention:</strong>
        <p style={{ margin: "5px 0" }}>{data.failedJobs.join(" · ")}</p>
      </div>}
      <p style={{ margin: "12px 0 0", fontSize: 12 }}>
        Current running build: {data.runningDeployment.commit?.slice(0, 8) ?? "not confirmed"} ({data.runningDeployment.environment}).
        Checked {new Date(data.checkedAt).toLocaleString("en-GB")}.
      </p>
      <p style={{ fontSize: 12, marginBottom: 0 }}>{data.caveat} Passing checks is not permission to deploy automatically.</p>
    </>}
  </section>;
}
