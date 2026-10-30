import Link from "next/link";
import {pageAccount} from "@/lib/page-access";
import {AccessMessage} from "@/components/access-message";
import {withOwner} from "@/modules/admin/repository";
import type {AcademyOverview} from "@/modules/academies/domain";
import {OwnerAcademyPanel} from "@/components/owner-academy-panel";
export const dynamic="force-dynamic";
export const metadata={title:"Academy onboarding pilot · GLOHAUS",robots:{index:false,follow:false}};
export default async function Page(){const access=await pageAccount("admin");if(!access.account)return <AccessMessage code={access.error}/>;if(!access.account.roles.includes("owner"))return <p role="alert">Owner access required.</p>;
 const data=await withOwner(async db=>(await db.query<{data:AcademyOverview}>("SELECT beauty.owner_academy_overview() AS data")).rows[0].data).catch(()=>null);
 return <main id="main" className="admin-workspace" style={{padding:24}}><Link href="/admin/growth">← Growth and Performance</Link><h1>Academy onboarding pilot</h1><p>Organise existing professionals into private cohorts after recording their permission. Review page publication, services, availability and completed paid bookings. No student or academy portal is created.</p><p>Cohort membership is separate from sign-up referral attribution. It does not change verification, prices, commission commitments or rewards, and it sends no messages. Completed paid counts exclude disputed bookings and fully refunded payments; they are not reward qualification.</p>{data?<OwnerAcademyPanel data={data}/>:<p role="alert">Academy management is unavailable. No figures have been estimated.</p>}</main>;
}
