import Link from "next/link";
import {pageAccount} from "@/lib/page-access";
import {withIdentity} from "@/lib/db";
import {AccessMessage} from "@/components/access-message";
import {ClientImportForm,type ImportedContactSummary} from "@/components/client-import-form";
export const dynamic="force-dynamic";
export const metadata={title:"Import your clients | GLOHAUS PRO",robots:{index:false,follow:false}};
export default async function Page(){
 const access=await pageAccount("professional");if(!access.account)return <AccessMessage code={access.error}/>;
 const account=access.account;
 const contacts=await withIdentity(account.authId,async db=>(await db.query<ImportedContactSummary>("SELECT id,name,email,phone,permission_date::text AS permission_date FROM beauty.professional_imported_contacts WHERE professional_id=$1 AND removed_at IS NULL ORDER BY created_at DESC,id LIMIT 500",[account.professionalId])).rows).catch(()=>null);
 return <main className="professional-shell" style={{maxWidth:950,margin:"0 auto",padding:24}}><Link href="/professional/clients">← Your clients</Link><h1>Bring your existing clients</h1>
 <p>Import only clients who agreed to have their contact details stored here for your business. Keep evidence of when and how each person agreed. Imported contacts are private to your business; they are not GLOHAUS accounts or verified marketing subscribers.</p>
 <p>No accounts, referrals, messages, rewards or marketing permissions are created by an import. Do not upload payment details, health information or private treatment notes. <Link href="/privacy">Privacy policy</Link>.</p>
 {contacts===null?<p role="alert">Client import is not available yet. No file has been uploaded.</p>:<ClientImportForm contacts={contacts}/>}
 </main>;
}
