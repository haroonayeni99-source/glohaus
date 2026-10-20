import Link from "next/link";
import {pageAccount} from "@/lib/page-access";
import {withOwner} from "@/modules/admin/repository";
import {refreshGrowthAudit,nominateProfessional,detectReferralRisks,decideReferralReview} from "./actions";
export const dynamic="force-dynamic";
export const metadata={title:"Growth Review | GLOHAUS"};
export default async function Page({searchParams}:{searchParams:Promise<{refresh?:string;nomination?:string;period?:string;risks?:string;case?:string}>}){
 const access=await pageAccount("admin");
 if(!access.account?.roles.includes("owner"))return <main><p role="alert">Owner access required.</p></main>;
 const params=await searchParams; const days=params.period==="week"?7:params.period==="year"?366:31;
 const [analytics,audit,gifts,pros,cases]=await Promise.all([
  withOwner(async db=>(await db.query<{data:{consentedViews:number;completedPaidAttributedBookings:number;rate:number|null}}>("SELECT beauty.owner_growth_conversion_summary($1) AS data",[days])).rows[0]?.data).catch(()=>null),
  withOwner(async db=>(await db.query<{data:{status:string;count:number}[]}>("SELECT beauty.owner_growth_referral_audit_summary() AS data")).rows[0]?.data).catch(()=>null),
  withOwner(async db=>(await db.query<{id:string;business_name:string;reason:string;gift_description:string|null;proposed_value_pence:number;state:string;created_at:string}>("SELECT * FROM beauty.owner_list_appreciation()")).rows).catch(()=>null),
  withOwner(async db=>(await db.query<{id:string;business_name:string}>("SELECT id,business_name FROM beauty.professional_profiles ORDER BY business_name LIMIT 500")).rows).catch(()=>null),
  withOwner(async db=>(await db.query<{id:string;reason_code:string;status:string;explanation:string;created_at:string}>("SELECT * FROM beauty.owner_list_referral_review_cases()")).rows).catch(()=>null)
 ]);
 return <main className="admin-workspace" style={{padding:"clamp(18px,4vw,48px)"}}>
  <Link href="/admin/growth">← Growth & Performance</Link><h1>Growth review & recognition</h1>
  <p>Owner-only insights. Rewards and automatic payments are disabled.</p>
  <nav style={{display:"flex",gap:14}}><Link href="?period=week">7 days</Link><Link href="?period=month">31 days</Link><Link href="?period=year">366 days</Link></nav>
  <section className="admin-detail-card" style={{padding:24,marginTop:20}}><h2>Consented profile-to-booking attribution</h2>
  {analytics ? <p>{analytics.consentedViews} recorded consented views · {analytics.completedPaidAttributedBookings} attributed completed paid bookings · {analytics.rate===null?"Not enough data":analytics.rate+"% attribution ratio"}</p>:<p role="alert">Attribution unavailable.</p>}
  <p>Only consented signed-in visits count. No historic profile opens were retroactively attributed. This is a visit-based ratio, not unique-customer conversion.</p></section>
  <section className="admin-detail-card" style={{padding:24,marginTop:20}}><h2>Referral qualification audit</h2>
  <form action={refreshGrowthAudit}><button type="submit" className="button small">Refresh qualifying bookings and referrals</button></form>
  {params.refresh==="success"&&<p role="status">Audit refresh completed.</p>}{params.refresh==="unavailable"&&<p role="alert">Audit refresh failed. No approval or rewards issued.</p>}
  {audit?<ul>{audit.map(x=><li key={x.status}>{x.status}: {x.count}</li>)}</ul>:<p role="alert">Audit unavailable.</p>}
  <p>Self-referrals are rejected; only genuinely completed paid bookings qualify. Suspicious or disputed referrals require manual review. Qualification does not issue a reward.</p></section>
  <section className="admin-detail-card" style={{padding:24,marginTop:20}}><h2>Fraud warning and manual case review</h2>
  <p>Warnings are not proof of fraud. Shared devices, households or addresses do not automatically disqualify anyone. No payments are made or withheld by this review tool.</p>
  <form action={detectReferralRisks}><button type="submit" className="button small">Scan existing referrals for risk indicators</button></form>
  {params.risks==="checked"&&<p role="status">Risk scan completed.</p>}
  {params.risks==="unavailable"&&<p role="alert">Risk scan unavailable.</p>}
  {params.case==="saved"&&<p role="status">Case decision recorded.</p>}
  {params.case==="invalid"&&<p role="alert">Provide a valid case decision and at least 10 characters of explanation.</p>}
  {params.case==="unavailable"&&<p role="alert">Case decision could not be recorded.</p>}
  {cases ? <div>{cases.map(c=><article key={c.id} className="admin-detail-card" style={{padding:16,marginTop:12}}>
  <p><strong>{c.reason_code.replaceAll("_"," ")}</strong> · {c.status} · {new Date(c.created_at).toLocaleDateString("en-GB")}</p>
  {c.explanation&&<p>Prior review: {c.explanation}</p>}
  {["open","under_review"].includes(c.status)&&<form action={decideReferralReview} style={{display:"grid",gap:8,maxWidth:540}}>
  <input type="hidden" name="caseId" value={c.id}/>
  <label>Decision<select name="decision" required><option value="under_review">Keep under review</option><option value="cleared">Clear warning</option><option value="rejected">Reject referral</option></select></label>
  <label>Reason<textarea name="notes" minLength={10} maxLength={1500} required/></label>
  <button className="button small" type="submit">Record review decision</button>
  </form>}</article>)}{cases.length===0&&<p>No flagged cases recorded.</p>}</div>:<p role="alert">Cases currently unavailable.</p>}
  </section>
  <section className="admin-detail-card" style={{padding:24,marginTop:20}}><h2>Professional appreciation nominations</h2>
  <p>Only you decide. A nomination is a private proposal and never sends a gift or money.</p>
  {pros?<form action={nominateProfessional} style={{display:"grid",gap:10,maxWidth:520}}>
   <label>Professional<select name="professionalId" required>{pros.map(p=><option key={p.id} value={p.id}>{p.business_name}</option>)}</select></label>
   <label>Reason<textarea name="reason" minLength={10} maxLength={1000} required/></label>
   <label>Possible gift or congratulations<input name="gift" maxLength={500}/></label>
   <label>Proposed value in pence (optional)<input type="number" name="amountPence" defaultValue={0} min={0} max={10000000}/></label>
   <button type="submit" className="button small">Save private proposal</button>
  </form>:<p role="alert">Professional list unavailable.</p>}
  {params.nomination==="saved"&&<p role="status">Proposal saved; nothing has been sent or paid.</p>}
  {params.nomination==="invalid"&&<p role="alert">Please review the nomination.</p>}
  {params.nomination==="unavailable"&&<p role="alert">Proposal could not be saved.</p>}
  {gifts?<div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Professional</th><th>Reason</th><th>Gift</th><th>Proposed value</th><th>Status</th></tr></thead><tbody>
   {gifts.map(g=><tr key={g.id}><td>{g.business_name}</td><td>{g.reason}</td><td>{g.gift_description??"—"}</td><td>£{(g.proposed_value_pence/100).toFixed(2)}</td><td>{g.state}</td></tr>)}
  </tbody></table></div>:<p role="alert">Proposals unavailable.</p>}</section>
 </main>;
}
