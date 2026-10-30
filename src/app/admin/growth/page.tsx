import { AcquisitionReport } from "@/components/acquisition-report";
import type { AcquisitionOverview } from "@/modules/admin/acquisition";
import Link from "next/link";
import { saveRewardDraft } from "./reward-action";
import { pageAccount } from "@/lib/page-access";
import { AuthFrame } from "@/components/auth-frame";
import { AccessMessage } from "@/components/access-message";
import { withOwner } from "@/modules/admin/repository";
import { growthPeriod, ownerGrowthOverview, ownerReferralPeriod, ownerMeaningfulActivity } from "@/modules/admin/growth-performance";

export const dynamic = "force-dynamic";
export const metadata = { title: "Growth & Performance | GLOHAUS" };

export default async function GrowthPage({ searchParams }: { searchParams: Promise<{ period?: string; rank?: string; rewardDraft?: string }> }) {
  const account = await pageAccount("admin");
  if (!account.account) return <AuthFrame><AccessMessage code={account.error ?? undefined} /></AuthFrame>;
  if (!account.account.roles.includes("owner")) return <main className="admin-workspace"><p role="alert">Owner access required.</p></main>;
  const params = await searchParams;
  const period = growthPeriod(params.period);
  const rank = ["completedBookings","uniqueClients","returningClients","completedValuePence"].includes(params.rank??"") ? params.rank! : "completedBookings";
  const [result, referralRows, activeRows, profileOpenRows, customerReferrals, customerReferralsInPeriod, topCustomerReferrers, rewardDraft] = await Promise.all([
    withOwner(db => ownerGrowthOverview(db, period)).catch(() => null),
    withOwner(db => ownerReferralPeriod(db, period)).catch(() => null),
    withOwner(db => ownerMeaningfulActivity(db, period)).catch(() => null),
    withOwner(async db => (await db.query<{professionalId:string;opens:number}>(
      'SELECT professional_id AS "professionalId", opens::float8 AS opens FROM beauty.owner_profile_open_counts($1)',
      [period==="week"?7:period==="year"?366:31]
    )).rows).catch(() => null),
    withOwner(async db => (await db.query<{data:{total:number;last30Days:number}}>(
      "SELECT beauty.owner_customer_referrals_summary() AS data"
    )).rows[0]?.data).catch(() => null),
    withOwner(async db => (await db.query<{registrations:number;referrers:number}>(
      `SELECT COUNT(*)::integer AS registrations,
        COUNT(DISTINCT referrer_user_id)::integer AS referrers
       FROM beauty.customer_referrals
       WHERE created_at >= NOW()-$1::interval AND created_at <= NOW()`,
      [period==="week"?"7 days":period==="year"?"1 year":"1 month"]
    )).rows[0]).catch(() => null),
    withOwner(async db => (await db.query<{code:string;attributed:number}>(
      `SELECT c.code, COUNT(r.id)::integer AS attributed
       FROM beauty.customer_referral_codes c
       JOIN beauty.customer_referrals r ON r.referrer_user_id=c.user_id
       WHERE r.created_at >= NOW()-$1::interval AND r.created_at <= NOW()
       GROUP BY c.code ORDER BY attributed DESC,c.code ASC LIMIT 25`,
      [period==="week"?"7 days":period==="year"?"1 year":"1 month"]
    )).rows).catch(() => null),
    withOwner(async db => (await db.query<{value:{enabled:boolean;customerCreditPence:number;professionalWaiverDays:number;minimumCompletedBookings:number}|null}>(
      "SELECT value FROM beauty.platform_settings WHERE key='referral_rewards_draft'"
    )).rows[0]?.value).catch(() => null),
  ]);
  const acquisition = await withOwner(async db => (await db.query<{data:AcquisitionOverview}>("SELECT beauty.acquisition_overview($1,true) AS data",[period==="week"?7:period==="year"?366:31])).rows[0]?.data ?? null).catch(()=>null);
  const rows = [...(result?.rows ?? [])].sort((a,b)=>Number(b[rank as keyof typeof b])-Number(a[rank as keyof typeof a]));
  const totalBookings = rows.reduce((sum, row) => sum + row.completedBookings, 0);
  const totalValue = rows.reduce((sum, row) => sum + Number(row.completedValuePence), 0);
  const money = (pence: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
  return <main id="main" className="admin-workspace" style={{ padding: "clamp(18px,4vw,48px)" }}>
    <Link href="/admin">← Owner Control Centre</Link><p><Link href="/admin/growth/review">Review customer sources, referrals & recognition →</Link></p>
    <p><Link href="/admin/referrals">Referral Foundation — unified channels, rules, review and ledger →</Link></p>
    <header style={{ margin: "24px 0" }}><p className="eyebrow">OWNER ONLY · LIVE BOOKING DATA</p><h1>Growth & Performance Centre</h1>
    <p>Use this page to compare customer acquisition, completed bookings, returning clients and professional performance. Choose a reporting period below.</p>
    <p>Completed, paid appointments only. Refunded, pending and cancelled appointments are excluded. Rewards remain off.</p></header>
    <nav aria-label="Reporting period" style={{ display: "flex", gap: 14, marginBottom: 24, flexWrap: "wrap" }}>
      {(["week","month","year"] as const).map(p => <Link key={p} href={`/admin/growth?period=${p}`} aria-current={p===period?"page":undefined} className="button small" style={{ opacity:p===period?1:0.65 }}>{p==="week"?"Last 7 days":p==="month"?"Last month":"Last year"}</Link>)}
    </nav>
    <AcquisitionReport data={acquisition} />
    {!result ? <p role="alert">Performance statistics are currently unavailable. No figures have been estimated.</p> : <>
      <div className="admin-detail-card" style={{ padding: 24, marginBottom: 20 }}>
        <p><strong>{totalBookings.toLocaleString("en-GB")}</strong> completed bookings · <strong>{money(totalValue)}</strong> net captured value attributable to completed bookings</p>
        <small>Unique clients are calculated per professional, so the same customer may appear for more than one professional.</small>
      </div>
      <section className="admin-detail-card" style={{ padding: 24 }}><h2>Professional leaderboard</h2>
        <nav aria-label="Leaderboard ranking" style={{display:"flex",gap:10,flexWrap:"wrap",margin:"14px 0"}}>
          {([["completedBookings","Bookings"],["uniqueClients","Clients"],["returningClients","Repeat clients"],["completedValuePence","Net value"]] as const).map(([key,label])=>
            <Link href={`/admin/growth?period=${period}&rank=${key}`} key={key} aria-current={rank===key?"page":undefined}>{label}{rank===key?" ✓":""}</Link>)}
        </nav><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Professional</th><th>Completed bookings</th><th>Unique clients</th><th>Repeat clients</th><th>Net captured</th></tr></thead>
          <tbody>{rows.map(row=><tr key={row.professionalId}><td>{row.businessName}</td><td>{row.completedBookings}</td><td>{row.uniqueClients}</td><td>{row.returningClients}</td><td>{money(Number(row.completedValuePence))}</td></tr>)}
          {!rows.length && <tr><td colSpan={5}>No qualifying completed bookings in this period.</td></tr>}</tbody></table></div>
      </section></>}
    <section className="admin-detail-card" style={{ padding: 24, marginTop: 20 }}><h2>Referral performance</h2>
      <p>Attributed accounts created within the selected reporting period. Rewards are not enabled.</p>
      {referralRows ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Professional</th><th>Qualified</th><th>Attributed accounts</th></tr></thead><tbody>
      {referralRows.map(r=><tr key={r.professionalId}><td>{r.businessName}</td><td>{r.qualifiedReferrals}</td><td>{r.referredAccounts}</td></tr>)}
      {!referralRows.length&&<tr><td colSpan={3}>No referrals recorded in this period.</td></tr>}</tbody></table></div> : <p role="alert">Referral reporting unavailable.</p>}
    </section>
    <section className="admin-detail-card" style={{padding:24,marginTop:20}}>
      <h2>Meaningful professional activity</h2>
      <p>Genuine replies sent to customers, not repeated page visits. Message contents are never shown.</p>
      {activeRows ? <div className="admin-table-wrap"><table className="admin-table">
        <thead><tr><th>Professional</th><th>Replies</th><th>Conversations</th></tr></thead><tbody>
        {activeRows.map(row=><tr key={row.professionalId}><td>{row.businessName}</td><td>{row.replies}</td><td>{row.conversations}</td></tr>)}
        {!activeRows.length&&<tr><td colSpan={3}>No qualifying activity in this period.</td></tr>}
        </tbody></table></div> : <p role="alert">Activity statistics temporarily unavailable.</p>}
    </section>
    <section className="admin-detail-card" style={{padding:24,marginTop:20}}>
      <h2>Professional profile opens</h2>
      <p>Recorded opens from signed-in visitors; not a unique visitor count.</p>
      {profileOpenRows ? <ul>{profileOpenRows.map(row=><li key={row.professionalId}>{result?.rows.find(p=>p.professionalId===row.professionalId)?.businessName??"Professional"}: {Number(row.opens)} opens</li>)}</ul> : <p role="alert">Profile opening statistics unavailable.</p>}
    </section>
    <section className="admin-detail-card" style={{padding:24,marginTop:20}}>
      <h2>Customer referrals</h2>
      {customerReferrals ? <p>{customerReferrals.total} attributed registrations overall · {customerReferrals.last30Days} in the last 30 days.</p> : <p role="alert">Customer referral statistics unavailable.</p>}
      {customerReferralsInPeriod ? <p><strong>{customerReferralsInPeriod.registrations}</strong> attributed registrations from <strong>{customerReferralsInPeriod.referrers}</strong> distinct referrers during the selected {period==="week"?"7 days":period==="month"?"month":"year"}.</p> : <p role="alert">Period referral statistics unavailable.</p>}
      <h3>Most successful customer referrers</h3>
      <p>Referral codes are shown without identifying the people who joined through them.</p>
      {topCustomerReferrers ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Referral code</th><th>Attributed registrations</th></tr></thead><tbody>
        {topCustomerReferrers.map(row=><tr key={row.code}><td><code>{row.code}</code></td><td>{row.attributed}</td></tr>)}
        {!topCustomerReferrers.length && <tr><td colSpan={2}>No customer referrals in this period.</td></tr>}
      </tbody></table></div> : <p role="alert">Customer referrer ranking unavailable.</p>}
      <p>Rewards remain disabled.</p>
    </section>
    <section className="admin-detail-card" style={{padding:24,marginTop:20}}>
      <p className="eyebrow">OWNER CONTROL · DRAFT ONLY</p>
      <h2>Referral rewards planning</h2>
      <p>Rewards are permanently OFF in this release. These values are planning settings only. They cannot issue booking credits, waive commission or trigger payments.</p>
      <form action={saveRewardDraft} style={{display:"grid",gap:12,maxWidth:440}}>
        <label>Proposed customer booking credit (pence, maximum £10)
          <input type="number" name="customerCreditPence" min="0" max="1000" step="1" required defaultValue={rewardDraft?.customerCreditPence??0}/>
        </label>
        <label>Proposed professional commission waiver (days, maximum 30)
          <input type="number" name="professionalWaiverDays" min="0" max="30" step="1" required defaultValue={rewardDraft?.professionalWaiverDays??0}/>
        </label>
        <label>Minimum qualifying completed paid bookings (1 to 5)
          <input type="number" name="minimumBookings" min="1" max="5" step="1" required defaultValue={rewardDraft?.minimumCompletedBookings??1}/>
        </label>
        <button className="button" type="submit">Save draft settings (rewards stay off)</button>
      </form>
      {params.rewardDraft==="saved"&&<p role="status">Draft saved. Rewards remain disabled.</p>}
      {params.rewardDraft==="invalid"&&<p role="alert">Invalid reward settings. No changes saved.</p>}
      {params.rewardDraft==="unavailable"&&<p role="alert">Settings unavailable; no changes saved.</p>}
    </section>
    <p>Website-wide unique visits and precise view-to-booking conversions are not estimated.</p>
  </main>;
}
