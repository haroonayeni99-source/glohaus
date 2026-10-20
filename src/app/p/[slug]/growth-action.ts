"use server";
import {redirect} from "next/navigation";
import {withAccount} from "@/lib/api-account";
export async function recordConsentedView(form:FormData) {
 const id=String(form.get("professionalId")??"");
 const slug=String(form.get("slug")??"");
 if(!/^[0-9a-f-]{36}$/.test(id)||!/^[a-z0-9][a-z0-9-]{2,59}$/.test(slug)) return;
 if(form.get("consent")!=="yes") return;
 const accepted=await withAccount("customer",async db =>
 (await db.query<{accepted:boolean}>("SELECT beauty.record_consented_profile_view($1) AS accepted",[id])).rows[0]?.accepted===true
 ).catch(()=>false);
 redirect("/p/"+slug+(accepted?"?tracking=recorded":"?tracking=unavailable"));
}
