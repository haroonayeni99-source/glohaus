"use client";

import { useEffect, useMemo, useState } from "react";

type Status = "LIVE AND VERIFIED" | "IMPLEMENTED BUT UNDEPLOYED" | "PARTIAL" | "MISSING" | "BLOCKED";
type Check = { id: string; area: string; label: string; status: Status; route: string; device: string; notes: string; verifiedAt?: string };
type Bug = { id: string; title: string; area: string; priority: string; route: string; device: string; steps: string; expected: string; actual: string; evidence: string; result: string; deployment: string; next: string; resolved: boolean };
type Change = { id: string; date: string; title: string; commit: string; deployment: string; verification: string };
type State = { checks: Check[]; bugs: Bug[]; changes: Change[]; regression: Record<string, boolean> };
const KEY = "glohaus-owner-quality-control-v1";
const areas: Record<string,string[]> = {
  "Customer": ["Registration, login and recovery","Home navigation and search","Profile, saved items and follows","Notifications and preferences","Account deletion and privacy","Empty states and error messages"],
  "Professional": ["Registration and onboarding","Profile and portfolio","Services and pricing","Availability, calendars and blocked dates","Earnings, payouts and disputes","Professional settings and notifications"],
  "Owner/Admin": ["Access control and role restrictions","Owner dashboard navigation","Fee controls and copy consistency","Support, disputes and moderation","Audit logging and Owner actions","Site on/off and maintenance"],
  "Booking": ["Search to service selection","Date and time availability","Slot locking and double booking","Booking confirmation","Rescheduling and cancellation","Mobile booking journey"],
  "Checkout": ["Booking price summary","Deposit calculation","Discounts and referral codes","Checkout loading and errors","Confirmation and receipt","Refund and cancellation scenarios"],
  "Payments": ["Stripe readiness and webhooks","Ledger reconciliation","Transfer scheduling","Withdrawal and disputes freeze","Refunds and partial refunds","Idempotency and retry handling"],
  "Shop": ["Category navigation and filters","Product details and variants","Basket and saved items","Purchase checkout","Shipping and order tracking","Returns and dispute journey"],
  "Discover": ["Vertical scroll and gesture handling","Video impressions and playback","Professional profile links","Saved looks and Following","Portfolio associations","Empty, loading and error states"],
  "TikTok/Instagram": ["OAuth permissions and callback","Connect / disconnect states","Post import and duplicate detection","Draft, hidden and published statuses","Embedded media playback","Publishing permissions and sync failures"],
  "Mobile/PWA": ["iPhone Safari navigation","Android Chrome navigation","Install and update prompts","Offline and reconnect behaviour","Touch targets and sticky elements","Safe areas and viewport layout"],
  "Loading screens": ["Initial-entry loader only","Page-to-page transitions","Brand and theme alignment","Slow-network loading fallback"],
  "Light/dark mode": ["Text and button contrast","Calendar dates and times","Forms, modals and dropdowns","Theme persistence and flicker"],
  "Analytics": ["Consent and privacy controls","Collector activation","Page/session engagement","Conversion events and attribution","Discover video metrics","Owner filters and reports"],
  "SEO": ["Titles and descriptions","Canonical URLs and sitemap","Robots and no-index private routes","Structured data and previews"],
  "Security": ["Authentication and role-based access","CSRF and origin protection","Rate limits and abuse prevention","Input validation and output encoding","Secrets and private information","Dependencies and security headers"],
};
const regressions = [
  "Customer can register and sign in","Professional can register and sign in","Owner-only pages reject non-owner accounts",
  "Search and filters work on mobile","Service availability remains responsive","Two customers cannot book same slot",
  "Booking deposit and platform fee are accurate","Stripe payment reaches verified confirmation","Refunds and disputes reconcile correctly",
  "Shop cart and checkout complete","Discover scrolling and links work","TikTok drafts do not publish automatically",
  "Instagram unavailable state is understandable","PWA refresh and update work","Initial loading screen does not repeat",
  "Light and dark theme contrast meets usability checks","Notification links and buttons respond",
  "Analytics respects consent","Private dashboards are not indexed"
];
const statuses: Status[] = ["LIVE AND VERIFIED", "IMPLEMENTED BUT UNDEPLOYED", "PARTIAL", "MISSING", "BLOCKED"];
const defaultChecks: Check[] = Object.entries(areas).flatMap(([area, list]) => list.map((label, i) => ({ id: area+"-"+i, area, label, status: "MISSING" as Status, route: "", device: "All", notes: "Not yet assessed — MISSING here means evidence is missing, not proof this feature is absent." })));
const fresh = (): State => ({ checks: defaultChecks, bugs: [], changes: [], regression: {} });
const surface: React.CSSProperties = { background: "#fff7fb", color: "#382138", border: "1px solid rgba(213,141,181,.28)", borderRadius: 20, padding: 20 };
const field: React.CSSProperties = { width: "100%", minHeight: 42, borderRadius: 10, border: "1px solid #9b7895", padding: "9px 11px", color: "#231726", background: "#fff" };
const button: React.CSSProperties = { padding: "9px 13px", borderRadius: 11, border: "1px solid #ad6b91", background: "#f9e7f1", color: "#592440", fontWeight: 700, cursor: "pointer" };
const format = (v:string) => v || "Not recorded";
export function QualityControlWorkspace() {
  const [data, setData] = useState<State>(fresh);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState("Audit");
  const [area, setArea] = useState("All");
  const [filter, setFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Partial<Bug>>({ priority:"P2",device:"Mobile",deployment:"Not checked" });
  const [change, setChange] = useState<Partial<Change>>({});
  useEffect(() => { const restore = window.setTimeout(() => { try { const raw = localStorage.getItem(KEY); if(raw){ const parsed = JSON.parse(raw) as State; setData({ checks: defaultChecks.map(c=>parsed.checks?.find(x=>x.id===c.id)??c), bugs: parsed.bugs??[], changes:parsed.changes??[], regression:parsed.regression??{} }); } } catch {} setReady(true); }, 0); return () => window.clearTimeout(restore); }, []);
  useEffect(() => { if(ready) localStorage.setItem(KEY,JSON.stringify(data)); }, [data,ready]);
  const counts = useMemo(() => Object.fromEntries(statuses.map(s=>[s,data.checks.filter(c=>c.status===s).length])), [data.checks]);
  const visible = data.checks.filter(c=>(area==="All"||c.area===area)&&(filter==="All"||c.status===filter)&&((c.label+" "+c.notes+" "+c.route).toLowerCase().includes(query.toLowerCase())));
  const blockers = data.bugs.filter(b=>!b.resolved&&(b.priority==="P0"||b.priority==="P1"));
  const passed = regressions.filter(x=>data.regression[x]).length;
  const releaseReady = blockers.length===0 && passed===regressions.length && data.checks.every(c=>c.status==="LIVE AND VERIFIED");
  function modifyCheck(id:string, patch:Partial<Check>) { setData(s=>({...s,checks:s.checks.map(c=>c.id===id?{...c,...patch}:c)})); }
  function exportData(){const blob=new Blob([JSON.stringify({ exportedAt:new Date().toISOString(), ...data },null,2)],{type:"application/json"}); const u=URL.createObjectURL(blob); const a=document.createElement("a");a.href=u;a.download="glohaus-quality-control.json";a.click();URL.revokeObjectURL(u);}
  function submitBug(e:React.FormEvent){ e.preventDefault(); if(!draft.title?.trim())return; const b:Bug={ id:crypto.randomUUID(),title:draft.title.trim(),area:draft.area||"General",priority:draft.priority||"P2",route:draft.route||"",device:draft.device||"",steps:draft.steps||"",expected:draft.expected||"",actual:draft.actual||"",evidence:draft.evidence||"",result:draft.result||"",deployment:draft.deployment||"",next:draft.next||"",resolved:false };setData(s=>({...s,bugs:[b,...s.bugs]}));setDraft({priority:"P2",device:"Mobile",deployment:"Not checked"});setTab("Bugs");}
  function copyWork(b:Bug){ void navigator.clipboard.writeText("GLOHAUS QC issue: "+b.title+"\nPriority: "+b.priority+"\nArea: "+b.area+"\nRoute: "+b.route+"\nDevice: "+b.device+"\nSteps: "+b.steps+"\nExpected: "+b.expected+"\nActual: "+b.actual+"\nScreenshot/evidence: "+b.evidence+"\nTest result: "+b.result+"\nDeployment status: "+b.deployment+"\nNext action: "+b.next+"\nUse haroonayeni99-source/glohaus and Vercel haroon-glohaus/glohaus1. Reproduce, fix, regression-test and deploy only after passing checks; preserve distinct workflows and premium design.");}
  const labelStyle:React.CSSProperties={display:"grid",gap:5,fontSize:13,fontWeight:650};
  const textArea = (key:keyof Bug, label:string) => <label style={labelStyle}>{label}<textarea style={field} rows={2} value={String(draft[key]||"")} onChange={e=>setDraft(s=>({...s,[key]:e.target.value}))}/></label>;
  return <div style={{display:"grid",gap:18}}>
    <header style={{background:"linear-gradient(125deg,#4f173e,#a23f72 68%,#d184aa)",color:"#fff",padding:"clamp(22px,4vw,44px)",borderRadius:25}}>
      <small style={{letterSpacing:2}}>GLOHAUS · OWNER ONLY · QUALITY CONTROL</small>
      <h1 style={{fontSize:"clamp(28px,4vw,46px)",margin:"10px 0"}}>One place to find, fix & verify.</h1>
      <p>Audit every detail, record bugs, prepare safe releases and share exact fixes with developers. Evidence-based statuses only.</p>
      <p style={{fontSize:13,opacity:.92}}>Production baseline: use the live deployment details above and in Vercel. A READY build does not prove complete functional verification.</p>
    </header>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(155px,1fr))",gap:10}}>
    {statuses.map(s=><div key={s} style={surface}><div style={{fontSize:28,fontWeight:800}}>{counts[s]}</div><small>{s}</small></div>)}
    </div>
    <nav aria-label="Quality control tools" style={{display:"flex",flexWrap:"wrap",gap:8}}>{["Audit","Bugs","Report a bug","Release readiness","Regression","Change log","Live vs pending"].map(t=><button key={t} type="button" onClick={()=>setTab(t)} style={{...button,background:tab===t?"#812c60":"#f9e7f1",color:tab===t?"white":"#592440"}}>{t}</button>)}</nav>
    <p style={{fontSize:13,opacity:.83}}>Storage: this browser only. Export JSON regularly; screenshots are stored as links, not uploaded. Automated tests and cross-device syncing are not connected yet.</p>
    {tab==="Audit"&&<section style={surface}><h2>Detailed website audit</h2><div style={{display:"flex",gap:9,flexWrap:"wrap",marginBottom:15}}>
      <select style={{...field,width:"auto"}} aria-label="Area" value={area} onChange={e=>setArea(e.target.value)}><option>All</option>{Object.keys(areas).map(a=><option key={a}>{a}</option>)}</select>
      <select style={{...field,width:"auto"}} aria-label="Status" value={filter} onChange={e=>setFilter(e.target.value)}><option>All</option>{statuses.map(s=><option key={s}>{s}</option>)}</select>
      <input style={{...field,flex:"1 1 220px"}} aria-label="Search audit checks" placeholder="Search any route, label or note" value={query} onChange={e=>setQuery(e.target.value)}/></div>
      <p>{visible.length} checks shown. Set LIVE AND VERIFIED only after confirming the live behaviour and recording the evidence.</p>
      <div style={{display:"grid",gap:10}}>{visible.map(c=><article key={c.id} style={{padding:14,border:"1px solid #98708966",borderRadius:14,display:"grid",gap:9}}>
      <strong>{c.label}</strong><small>{c.area}</small>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(175px,1fr))",gap:8}}>
      <label style={labelStyle}>Status<select style={field} value={c.status} onChange={e=>modifyCheck(c.id,{status:e.target.value as Status,verifiedAt:e.target.value==="LIVE AND VERIFIED"?new Date().toISOString():""})}>{statuses.map(s=><option key={s}>{s}</option>)}</select></label>
      <label style={labelStyle}>Affected route<input style={field} placeholder="/your-route" value={c.route} onChange={e=>modifyCheck(c.id,{route:e.target.value})}/></label>
      <label style={labelStyle}>Device<input style={field} value={c.device} onChange={e=>modifyCheck(c.id,{device:e.target.value})}/></label></div>
      <label style={labelStyle}>Evidence / next action<input style={field} placeholder="How was it tested? What needs fixing?" value={c.notes} onChange={e=>modifyCheck(c.id,{notes:e.target.value})}/></label>
      {c.verifiedAt&&<small>Last marked verified: {new Date(c.verifiedAt).toLocaleString("en-GB")}</small>}
      </article>)}</div></section>}
    {tab==="Report a bug"&&<form onSubmit={submitBug} style={{...surface,display:"grid",gap:12}}><h2>Log a new bug</h2>
      <label style={labelStyle}>Issue title *<input required style={field} value={draft.title||""} onChange={e=>setDraft(s=>({...s,title:e.target.value}))}/></label>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:9}}>
      {(["area","priority","route","device","deployment"] as const).map(k=><label key={k} style={labelStyle}>{k==="deployment"?"Deployment status":k}<input style={field} value={draft[k]||""} onChange={e=>setDraft(s=>({...s,[k]:e.target.value}))}/></label>)}</div>
      {textArea("steps","Reproduction steps")}{textArea("expected","Expected behaviour")}{textArea("actual","Actual behaviour")}{textArea("evidence","Screenshot URL / evidence")}{textArea("result","Test result")}{textArea("next","Next action")}
      <button type="submit" style={button}>Save issue</button></form>}
    {tab==="Bugs"&&<section style={surface}><h2>Bug register</h2><button style={button} onClick={()=>setTab("Report a bug")}>+ Report bug</button>{!data.bugs.length&&<p>No bugs logged yet. This does not mean the platform is bug-free.</p>}
      <div style={{display:"grid",gap:12,marginTop:12}}>{data.bugs.map(b=><article key={b.id} style={{border:"1px solid #98708966",padding:14,borderRadius:14}}>
      <h3>{b.title}</h3><p>{b.priority} · {b.area} · {format(b.route)} · {b.device} · {b.resolved?"Resolved":"Open"}</p><p><strong>Steps:</strong> {format(b.steps)}</p><p><strong>Expected:</strong> {format(b.expected)} · <strong>Actual:</strong> {format(b.actual)}</p><p><strong>Evidence:</strong> {format(b.evidence)}</p><p><strong>Result:</strong> {format(b.result)} · <strong>Deployment:</strong> {format(b.deployment)}</p><p><strong>Next:</strong> {format(b.next)}</p>
      <div style={{display:"flex",gap:10,flexWrap:"wrap"}}><button style={button} onClick={()=>copyWork(b)}>Copy issue details</button><button style={button} onClick={()=>setData(s=>({...s,bugs:s.bugs.map(x=>x.id===b.id?{...x,resolved:!x.resolved}:x)}))}>{b.resolved?"Reopen":"Mark resolved"}</button></div>
      </article>)}</div></section>}
    {tab==="Release readiness"&&<section style={surface}><h2>Release readiness</h2><h3>{releaseReady?"All recorded gates passed":"NOT READY / NOT VERIFIED"}</h3><p>{blockers.length} open critical issues · {passed}/{regressions.length} regression checks passed · {counts["LIVE AND VERIFIED"]}/{data.checks.length} audit checks marked verified.</p>
    <p>These gates are conservative and manual: passing here is not a guarantee of secure code or working production payments. Verify build, lint, typecheck, automated tests, authorization, payments, monitoring, rollback and a fresh live smoke test before releasing.</p><button style={button} onClick={()=>setTab("Regression")}>Review regression checks</button></section>}
    {tab==="Regression"&&<section style={surface}><h2>Regression test checklist</h2><p>{passed} of {regressions.length} checked. Tick only after testing the current intended release; previous checks must be reviewed after every relevant change.</p>
      <div style={{display:"grid",gap:12}}>{regressions.map(r=><label key={r} style={{display:"flex",gap:10,alignItems:"center"}}><input type="checkbox" checked={!!data.regression[r]} onChange={e=>setData(s=>({...s,regression:{...s.regression,[r]:e.target.checked}}))}/>{r}</label>)}</div><button style={{...button,marginTop:16}} onClick={()=>setData(s=>({...s,regression:{}}))}>Reset for new release</button></section>}
    {tab==="Change log"&&<section style={{...surface,display:"grid",gap:12}}><h2>Change log</h2>
      {(["title","date","commit","deployment","verification"] as const).map(k=><label key={k} style={labelStyle}>{k}<input style={field} value={change[k]||""} onChange={e=>setChange(s=>({...s,[k]:e.target.value}))} placeholder={k==="date"?"YYYY-MM-DD":k}/></label>)}
      <button style={button} onClick={()=>{if(!change.title?.trim())return;setData(s=>({...s,changes:[{id:crypto.randomUUID(),date:change.date||new Date().toISOString().slice(0,10),title:change.title||"",commit:change.commit||"",deployment:change.deployment||"",verification:change.verification||""},...s.changes]}));setChange({});}}>Add change</button>
      {data.changes.map(c=><article key={c.id} style={{padding:12,border:"1px solid #98708966",borderRadius:12}}><strong>{c.title}</strong><p>{c.date} · Commit {format(c.commit)} · {format(c.deployment)}</p><p>Verification: {format(c.verification)}</p></article>)}</section>}
    {tab==="Live vs pending"&&<section style={surface}><h2>Production vs unfinished work</h2><p><strong>Production:</strong> haroon-glohaus/glohaus1 · main · 569742675ede0f44c42843eb0b28a89b9620020b · READY (snapshot, 8 Nov 2026).</p><p><strong>Preview:</strong> fix/foundation-regressions-chat-20261108 · 1a9764f (READY preview; not proof of promotion).</p><p>Use Vercel deployment metadata and GitHub commit comparison to update this snapshot. This page does not currently query Vercel or GitHub automatically.</p>
    <p><a href="https://vercel.com/haroon-glohaus/glohaus1" target="_blank" rel="noopener noreferrer">Open production deployments</a> · <a href="https://github.com/haroonayeni99-source/glohaus/compare/main...fix/foundation-regressions-chat-20261108" target="_blank" rel="noopener noreferrer">Compare source branches</a></p>
    <h3>Outstanding checks</h3>{data.checks.filter(c=>c.status!=="LIVE AND VERIFIED").slice(0,80).map(c=><p key={c.id}>{c.area} · {c.label} — {c.status}</p>)}</section>}
    <footer style={{display:"flex",gap:10,flexWrap:"wrap"}}><button style={button} onClick={exportData}>Export audit backup (JSON)</button><label style={{...button,cursor:"pointer"}}>Import audit backup<input type="file" accept="application/json" style={{display:"none"}} onChange={async e=>{const f=e.target.files?.[0];if(!f)return;try{const d=JSON.parse(await f.text()) as State;if(!Array.isArray(d.checks)||!Array.isArray(d.bugs)||!Array.isArray(d.changes))throw new Error("Invalid backup");setData({checks:defaultChecks.map(c=>d.checks.find(x=>x.id===c.id)??c),bugs:d.bugs,changes:d.changes,regression:d.regression||{}});}catch{alert("Unable to import this audit backup.");}e.target.value="";}}/></label></footer>
  </div>;
}
