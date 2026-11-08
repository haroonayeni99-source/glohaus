"use client";

import { useEffect, useState } from "react";

type Check = { path: string; ok: boolean; status: number | null; durationMs: number };
type Snapshot = {
  checkedAt: string;
  source: string;
  checks: Check[];
  runningDeployment: { environment: string; commit: string | null; branch: string | null };
  caveat: string;
};

export function OwnerQualityDiagnostics() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function refresh(signal?: AbortSignal) {
    setBusy(true);
    try {
      const response = await fetch("/api/v1/admin/quality-control/health", { cache: "no-store", signal });
      if (!response.ok) throw new Error(response.status === 403 ? "Owner access required." : "Diagnostics are temporarily unavailable.");
      const next = await response.json() as Snapshot;
      if (!signal?.aborted) { setSnapshot(next); setError(""); }
    } catch (cause) {
      if (!signal?.aborted) setError(cause instanceof Error ? cause.message : "Diagnostics unavailable.");
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
  return <section aria-label="Automatic public route monitoring" style={{background:"#fff7fb",color:"#382138",padding:20,borderRadius:20,border:"1px solid rgba(213,141,181,.28)"}}>
    <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",flexWrap:"wrap"}}>
      <div><h2 style={{margin:"0 0 4px"}}>Automatic live-site checks</h2><p style={{margin:0}}>Read-only public route checks refresh while this page is open, every five minutes.</p></div>
      <button type="button" disabled={busy} onClick={() => void refresh()} style={{borderRadius:10,border:"1px solid #ad6b91",padding:"10px 15px",background:"#f9e7f1",color:"#592440",fontWeight:700}}>{busy?"Checking…":"Check again"}</button>
    </div>
    {error && <p role="alert">{error}</p>}
    {snapshot && <>
      <p style={{fontSize:13}}>Last checked: {new Date(snapshot.checkedAt).toLocaleString("en-GB")} · Running deployment: {snapshot.runningDeployment.environment} · {snapshot.runningDeployment.commit?.slice(0,8) ?? "commit unavailable"}</p>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:10}}>
        {snapshot.checks.map(check=><div key={check.path} style={{borderRadius:12,border:"1px solid #d5a6bc",padding:12}}>
          <strong>{check.path}</strong><p style={{margin:"5px 0"}}>{check.ok?"HTTP OK":"Needs investigation"} · {check.status ?? "No response"}</p><small>{check.durationMs} ms · unauthenticated GET</small>
        </div>)}
      </div>
      <p style={{fontSize:12,marginBottom:0}}>{snapshot.caveat} The running commit identifies this application build, not necessarily the production commit when viewed from a preview.</p>
    </>}
  </section>;
}
