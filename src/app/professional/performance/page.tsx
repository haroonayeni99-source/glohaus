import {businessInsights,businessDisputesCte,reportingDays,retentionWindow} from "@/modules/professionals/business-insights";
import { AcquisitionReport } from "@/components/acquisition-report";
import type { AcquisitionOverview } from "@/modules/admin/acquisition";
import Link from "next/link";
import { ReferralShareActions } from "@/components/referral-share-actions";
import { pageAccount } from "@/lib/page-access";
import { withAccount } from "@/lib/api-account";
import { AuthFrame } from "@/components/auth-frame";
import { AccessMessage } from "@/components/access-message";
import { growthPeriod } from "@/modules/admin/growth-performance";
export const dynamic = "force-dynamic";
export const metadata = { title: "Business Hub | GLOHAUS" };

export default async function Page({searchParams}:{searchParams:Promise<{period?:string;retention?:string}>}) {
  const access = await pageAccount("professional");
  if(!access.account) return <AuthFrame><AccessMessage code={access.error??undefined}/></AuthFrame>;
  const params = await searchParams;
  const period = growthPeriod(params.period);
  const retention = retentionWindow(params.retention);
  const interval = `${reportingDays[period]} days`;
  const acquisition = await withAccount("professional",async db=>(await db.query<{data:AcquisitionOverview}>("SELECT beauty.acquisition_overview($1,false) AS data",[period==="week"?7:period==="year"?366:31])).rows[0]?.data??null).catch(()=>null);
  const invitation = await withAccount("professional",async db=>(await db.query<{data:{token:string}}>("SELECT beauty.my_acquisition_invitation() AS data")).rows[0]?.data??null).catch(()=>null);
  const metrics = await withAccount("professional",async (db,account)=>{
    const id=account.professionalId;
    if(!id) return null;
    const row=await businessInsights(db,id,period,retention);
    const profile=(await db.query<{slug:string|null;publication_status:string}>("SELECT slug,publication_status FROM beauty.professional_profiles WHERE id=$1",[id])).rows[0];
    const referral=(await db.query<{data:{code:string;totalReferrals:number;qualifiedReferrals:number}|null}>(
      "SELECT beauty.my_professional_referral_overview() AS data"
    )).rows[0]?.data ?? null;
    const referrals={ total:referral?.totalReferrals??0, qualified:referral?.qualifiedReferrals??0 };
    const code=referral?.code??null;
    const popularServices=(await db.query<{serviceName:string;bookings:number}>(
      `WITH ${businessDisputesCte} SELECT b.service_name AS "serviceName",COUNT(*)::integer AS bookings
       FROM beauty.bookings b
       JOIN beauty.payments p ON p.booking_id=b.id
       WHERE b.professional_id=$1 AND b.status='completed'
         AND b.completed_at>=NOW()-$2::interval AND b.completed_at<=NOW()
         AND p.captured_pence>p.refunded_pence
         AND NOT EXISTS(SELECT 1 FROM excluded_disputes d WHERE d.booking_id=b.id)
       GROUP BY b.service_name ORDER BY bookings DESC,b.service_name ASC LIMIT 5`,[id,interval])).rows;
    const profileOpens=(await db.query<{opens:string}>(
      "SELECT beauty.my_profile_open_count($1,$2) AS opens",
      [id,period==="week"?7:period==="year"?366:31]
    )).rows[0]?.opens??"0";
    return {row,referrals,code,popularServices,profile,profileOpens:Number(profileOpens)};
  }).catch(()=>null);
  const money=(pence:number)=>new Intl.NumberFormat("en-GB",{style:"currency",currency:"GBP"}).format(pence/100);
  return <main style={{maxWidth:950,margin:"0 auto",padding:"clamp(20px,4vw,48px)"}}><AcquisitionReport data={acquisition}/>
    {invitation&&<section className="admin-detail-card" style={{padding:24,marginTop:20}}><h2>Your customer invitation</h2><p>Share this link or QR code with your clients. They choose whether to record the invitation. It never proves customer ownership or changes fees.</p><p><a href={`/i/${invitation.token}`}>{`https://glohaus.shop/i/${invitation.token}`}</a></p><a className="button" href="/api/v1/professional/invitation-qr">Download invitation QR code</a></section>}

    <Link href="/professional">← Professional dashboard</Link>
    <header style={{margin:"22px 0"}}><p className="eyebrow">PRIVATE PROFESSIONAL INSIGHTS</p><h1>Business Hub</h1>
      <p>Your completed bookings, customers, aggregate profile opens and referrals. Only you can access these figures.</p></header>
    <nav style={{display:"flex",flexWrap:"wrap",gap:10,marginBottom:20}} aria-label="Reporting period">
      {(["week","month","year"] as const).map(p=><Link key={p} href={`/professional/performance?period=${p}&retention=${retention}`} className="button small" aria-current={p===period?"page":undefined}>{p==="week"?"7 days":p==="month"?"31 days":"366 days"}</Link>)}
    </nav>
    {!metrics?<p role="alert">Performance data is temporarily unavailable. No estimated figures are shown.</p>:<>
      <section className="admin-detail-card" style={{padding:24}}>
        <h2>My bookings</h2><p><strong>{metrics.profileOpens}</strong> recorded signed-in profile opens in this period.</p><p><strong>{metrics.row.bookings}</strong> completed bookings · <strong>{metrics.row.clients}</strong> unique clients · <strong>{metrics.row.returningClients}</strong> returning clients</p>
        <p>{money(metrics.row.serviceValuePence)} booked service value · {money(metrics.row.netCapturedPence)} captured payments after refunds.</p>
        <p>Captured payments can include deposits and customer fees. They are not your earnings, profit or available balance. <Link href="/professional/wallet">View your wallet</Link>.</p>
        <p>Returning clients have an earlier completed paid appointment with you, including before this reporting period. {metrics.row.multipleVisitClients} clients had multiple visits in this period; {metrics.row.futureBookedClients} clients have a confirmed future booking. Cancelled, unpaid, fully refunded and disputed appointments are excluded.</p>
      </section>
      <section className="admin-detail-card" style={{padding:24,marginTop:20}}>
        <h2>Bring your own clients</h2>
        {metrics.profile?.publication_status==="published"&&metrics.profile.slug?<p>Your personal booking page: <Link href={`/p/${metrics.profile.slug}`}>{`https://www.glohaus.shop/p/${metrics.profile.slug}`}</Link></p>:<p><Link href="/professional/profile">Complete and publish your profile</Link> to share your personal booking page.</p>}
        <p>Share your page with existing clients. They can browse without recording an invitation. Invitation tracking does not grant marketing permission, change fees or establish ownership of a client.</p>
        <p><Link href="/professional/clients">Manage your clients</Link> · <Link href="/professional/services">Manage services</Link> · <Link href="/professional/availability">Manage availability</Link></p>
      </section>
      <section className="admin-detail-card" style={{padding:24,marginTop:20}}>
        <h2>Client retention</h2>
        <nav aria-label="Return window" style={{display:"flex",flexWrap:"wrap",gap:10}}>{([30,60,90] as const).map(days=><Link key={days} className="button small" aria-current={days===retention?"page":undefined} href={`/professional/performance?period=${period}&retention=${days}`}>{days}-day return</Link>)}</nav>
        <p>For clients whose first completed paid appointment was between {reportingDays[period]+retention} and {retention} days ago, how many returned within {retention} days? Every client in this cohort has a full observation window.</p>
        {metrics.row.cohortClients?<p><strong>{metrics.row.cohortReturned} of {metrics.row.cohortClients}</strong> returned ({Math.round(100*metrics.row.cohortReturned/metrics.row.cohortClients)}%). This describes recorded appointments, not an estimate or proof of growth.</p>:<p>Not enough mature booking history for this cohort. No retention percentage is estimated.</p>}
      </section>
      <section className="admin-detail-card" style={{padding:24,marginTop:20}}>
        <h2>Most popular booked services</h2>
        <p>Based on completed, paid, undisputed bookings in this period.</p>
        <ol>{metrics.popularServices.map(service=><li key={service.serviceName}>{service.serviceName} — {service.bookings} bookings</li>)}</ol>
        {!metrics.popularServices.length&&<p>No completed services in this period.</p>}
      </section>
      <section className="admin-detail-card" style={{padding:24,marginTop:20}}>
        <h2>Refer &amp; Grow</h2><p><strong>{metrics.referrals.qualified}</strong> qualified referrals out of {metrics.referrals.total} attributed accounts.</p>
        {metrics.code?<><p>Your referral code: <strong>{metrics.code}</strong></p><p>Share your code directly with someone interested in GLOHAUS.</p><ReferralShareActions code={metrics.code} /></>:<p>No referral code assigned yet.</p>}
        <p>Reward incentives are not yet active; referrals do not create automatic credits or payouts.</p>
      </section>
    </>}
  </main>;
}
