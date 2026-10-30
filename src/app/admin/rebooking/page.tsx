import Link from "next/link";
import {pageAccount} from "@/lib/page-access";
import {AccessMessage} from "@/components/access-message";
import {withOwner} from "@/modules/admin/repository";
import type {RebookingOverview} from "@/modules/rebooking/domain";
import {OwnerRebookingPanel} from "@/components/owner-rebooking-panel";
export const dynamic="force-dynamic";
export const metadata={title:"Rebooking reminder pilot · GLOHAUS",robots:{index:false,follow:false}};
export default async function Page(){const access=await pageAccount("admin");if(!access.account)return <AccessMessage code={access.error}/>;if(!access.account.roles.includes("owner"))return <p role="alert">Owner access required.</p>;
 const data=await withOwner(async db=>(await db.query<{data:RebookingOverview}>("SELECT beauty.owner_rebooking_overview() AS data")).rows[0].data).catch(()=>null);
 return <main id="main" className="admin-workspace" style={{padding:24}}><Link href="/admin/growth">← Growth and Performance</Link><h1>Rebooking reminders</h1><p>Optional marketing to customers with an explicit rebooking opt-in and a completed, paid, unrefunded and undisputed visit. Imported contacts never enter this queue. New appointments, blocks, account restrictions, opt-outs and email suppression are checked again immediately before sending.</p><p>Only the latest completed visit with a professional can qualify. A seven-day eligibility window prevents old booking lists turning into a backlog campaign. Default: 28 days after a visit, at least 30 days between reminders per customer, 25 daily and 100 monthly across GLOHAUS. Automation starts OFF.</p>{data?<OwnerRebookingPanel key={JSON.stringify(data.settings)} data={data}/>:<p role="alert">Rebooking automation is unavailable. No counts have been estimated.</p>}</main>;
}
