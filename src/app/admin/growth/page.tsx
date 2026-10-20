import Link from "next/link";
import { pageAccount } from "@/lib/page-access";
import { AuthFrame } from "@/components/auth-frame";
import { AccessMessage } from "@/components/access-message";
import { withOwner, ownerProfessionalReferralOverview } from "@/modules/admin/repository";
import { growthPeriod, ownerGrowthOverview } from "@/modules/admin/growth-performance";

export const dynamic = "force-dynamic";
export const metadata = { title: "Growth & Performance | GLOHAUS" };

export default async function GrowthPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const account = await pageAccount("admin");
  if (!account.account) return <AuthFrame><AccessMessage code={account.error ?? undefined} /></AuthFrame>;
  if (!account.account.roles.includes("owner")) return <main className="admin-workspace"><p role="alert">Owner access required.</p></main>;
  const period = growthPeriod((await searchParams).period);
  const [result, referralRows] = await Promise.all([
    withOwner(db => ownerGrowthOverview(db, period)).catch(() => null),
    ownerProfessionalReferralOverview().catch(() => null),
  ]);
  const rows = result?.rows ?? [];
  const totalBookings = rows.reduce((sum, row) => sum + row.completedBookings, 0);
  const totalValue = rows.reduce((sum, row) => sum + Number(row.completedValuePence), 0);
  const money = (pence: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
  return <main id="main" className="admin-workspace" style={{ padding: "clamp(18px,4vw,48px)" }}>
    <Link href="/admin">← Owner Control Centre</Link>
    <header style={{ margin: "24px 0" }}><p className="eyebrow">OWNER ONLY · LIVE BOOKING DATA</p><h1>Growth & Performance Centre</h1>
    <p>Completed, paid appointments only. Refunded, pending and cancelled appointments are excluded. Rewards remain off.</p></header>
    <nav aria-label="Reporting period" style={{ display: "flex", gap: 14, marginBottom: 24, flexWrap: "wrap" }}>
      {(["week","month","year"] as const).map(p => <Link key={p} href={`/admin/growth?period=${p}`} aria-current={p===period?"page":undefined} className="button small" style={{ opacity:p===period?1:0.65 }}>{p==="week"?"Last 7 days":p==="month"?"Last month":"Last year"}</Link>)}
    </nav>
    {!result ? <p role="alert">Performance statistics are currently unavailable. No figures have been estimated.</p> : <>
      <div className="admin-detail-card" style={{ padding: 24, marginBottom: 20 }}>
        <p><strong>{totalBookings.toLocaleString("en-GB")}</strong> completed bookings · <strong>{money(totalValue)}</strong> net captured value attributable to completed bookings</p>
        <small>Unique clients are calculated per professional, so the same customer may appear for more than one professional.</small>
      </div>
      <section className="admin-detail-card" style={{ padding: 24 }}><h2>Professional leaderboard</h2>
        <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Professional</th><th>Completed bookings</th><th>Unique clients</th><th>Repeat clients</th><th>Net captured</th></tr></thead>
          <tbody>{rows.map(row=><tr key={row.professionalId}><td>{row.businessName}</td><td>{row.completedBookings}</td><td>{row.uniqueClients}</td><td>{row.returningClients}</td><td>{money(Number(row.completedValuePence))}</td></tr>)}
          {!rows.length && <tr><td colSpan={5}>No qualifying completed bookings in this period.</td></tr>}</tbody></table></div>
      </section></>}
    <section className="admin-detail-card" style={{ padding: 24, marginTop: 20 }}><h2>Referral performance</h2>
      <p>Existing referral codes and attributed accounts. Rewards are not enabled.</p>
      {referralRows ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Professional</th><th>Code</th><th>Qualified</th><th>Total sign-ups</th></tr></thead><tbody>
      {referralRows.map(r=><tr key={r.professionalId}><td>{r.businessName}</td><td>{r.code}</td><td>{r.qualifiedReferrals}</td><td>{r.totalReferrals}</td></tr>)}
      {!referralRows.length&&<tr><td colSpan={4}>No referrals recorded yet.</td></tr>}</tbody></table></div> : <p role="alert">Referral reporting unavailable.</p>}
    </section>
    <p style={{marginTop:24}}>Website visits and profile-view conversions need an independently validated event source; they are not estimated here.</p>
  </main>;
}
