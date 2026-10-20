import Link from "next/link";
import { ReferralShareActions } from "@/components/referral-share-actions";
import { pageAccount } from "@/lib/page-access";
import { withAccount } from "@/lib/api-account";
import { AuthFrame } from "@/components/auth-frame";
import { AccessMessage } from "@/components/access-message";
import { growthPeriod } from "@/modules/admin/growth-performance";
export const dynamic = "force-dynamic";
export const metadata = { title: "My Performance | GLOHAUS" };

export default async function Page({searchParams}:{searchParams:Promise<{period?:string}>}) {
  const access = await pageAccount("professional");
  if(!access.account) return <AuthFrame><AccessMessage code={access.error??undefined}/></AuthFrame>;
  const period = growthPeriod((await searchParams).period);
  const interval = period==="week"?"7 days":period==="year"?"1 year":"1 month";
  const metrics = await withAccount("professional",async (db,account)=>{
    const id=account.professionalId;
    if(!id) return null;
    const row=(await db.query<{bookings:number;clients:number;repeatClients:number;netPence:number}>(
    `WITH qualified AS (
       SELECT b.customer_id,b.id,GREATEST(0,p.captured_pence-p.refunded_pence) AS net_pence
       FROM beauty.bookings b JOIN beauty.payments p ON p.booking_id=b.id
       WHERE b.professional_id=$1 AND b.status='completed'
         AND b.completed_at >= NOW()-$2::interval AND b.completed_at<=NOW()
         AND p.captured_pence>p.refunded_pence
     )
     SELECT COUNT(DISTINCT id)::integer AS bookings,
       COUNT(DISTINCT customer_id)::integer AS clients,
       COALESCE((SELECT COUNT(*) FROM (SELECT customer_id FROM qualified GROUP BY customer_id HAVING COUNT(*)>1) c),0)::integer AS "repeatClients",
       COALESCE(SUM(net_pence),0)::float8 AS "netPence" FROM qualified`,[id,interval])).rows[0];
    const referral=(await db.query<{data:{code:string;totalReferrals:number;qualifiedReferrals:number}|null}>(
      "SELECT beauty.my_professional_referral_overview() AS data"
    )).rows[0]?.data ?? null;
    const referrals={ total:referral?.totalReferrals??0, qualified:referral?.qualifiedReferrals??0 };
    const code=referral?.code??null;
    const popularServices = (await db.query<{serviceName:string;bookings:number}>(
      `SELECT b.service_name AS "serviceName", COUNT(*)::integer AS bookings
       FROM beauty.bookings b JOIN beauty.payments pay ON pay.booking_id=b.id
       WHERE b.professional_id=$1 AND b.status='completed' AND b.completed_at>=NOW()-$2::interval
         AND pay.captured_pence>pay.refunded_pence
       GROUP BY b.service_name ORDER BY bookings DESC,b.service_name ASC LIMIT 5`,[id,interval])).rows;
    return {row,referrals,code,popularServices};
  }).catch(()=>null);
  const money=(pence:number)=>new Intl.NumberFormat("en-GB",{style:"currency",currency:"GBP"}).format(pence/100);
  return <main style={{maxWidth:950,margin:"0 auto",padding:"clamp(20px,4vw,48px)"}}>
    <Link href="/professional">← Professional dashboard</Link>
    <header style={{margin:"22px 0"}}><p className="eyebrow">PRIVATE PROFESSIONAL INSIGHTS</p><h1>My Performance</h1>
      <p>Your completed bookings, customers and referrals. Only you can access these figures.</p></header>
    <nav style={{display:"flex",flexWrap:"wrap",gap:10,marginBottom:20}} aria-label="Reporting period">
      {(["week","month","year"] as const).map(p=><Link key={p} href={`/professional/performance?period=${p}`} className="button small" aria-current={p===period?"page":undefined}>{p==="week"?"7 days":p==="month"?"Month":"Year"}</Link>)}
    </nav>
    {!metrics?<p role="alert">Performance data is temporarily unavailable. No estimated figures are shown.</p>:<>
      <section className="admin-detail-card" style={{padding:24}}>
        <h2>My bookings</h2><p><strong>{metrics.row.bookings}</strong> completed bookings · <strong>{metrics.row.clients}</strong> unique clients · <strong>{metrics.row.repeatClients}</strong> repeat clients</p>
        <p>{money(metrics.row.netPence)} captured payments net of refunds on completed bookings.</p>
      </section>
      <section className="admin-detail-card" style={{padding:24,marginTop:20}}>
        <h2>Your most popular services</h2>
        {metrics.popularServices.length ? <ol>{metrics.popularServices.map(item=><li key={item.serviceName}>{item.serviceName}: {item.bookings} completed bookings</li>)}</ol> : <p>No completed services for this period.</p>}
      </section>
      <section className="admin-detail-card" style={{padding:24,marginTop:20}}>
        <h2>Refer &amp; Grow</h2><p><strong>{metrics.referrals.qualified}</strong> qualified referrals out of {metrics.referrals.total} attributed accounts.</p>
        {metrics.code?<><p>Your referral code: <strong>{metrics.code}</strong></p><p>Share your code directly with someone interested in GLOHAUS.</p><ReferralShareActions code={metrics.code} /></>:<p>No referral code assigned yet.</p>}
        <p>Reward incentives are not yet active; referrals do not create automatic credits or payouts.</p>
      </section>
    </>}
  </main>;
}
