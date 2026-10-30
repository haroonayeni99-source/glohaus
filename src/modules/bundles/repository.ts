import "server-only";
import type {SqlClient} from "@/modules/accounts/repository";
export type BundleChoices={slug:string;services:{id:string;name:string;price_pence:number}[];products:{id:string;name:string;description:string;price_pence:number}[]};
export async function bundleChoices(db:SqlClient,professionalId:string,selected?:{serviceId:string;productId:string}):Promise<BundleChoices|null>{
 const access=(await db.query<{data:{verified:boolean;paymentReady:boolean}}>("SELECT beauty.professional_access_state($1) AS data",[professionalId])).rows[0]?.data;
 if(!access?.verified||!access.paymentReady)return null;
 const profile=(await db.query<{slug:string}>("SELECT slug FROM beauty.public_professionals WHERE id=$1",[professionalId])).rows[0];if(!profile)return null;
 const [services,products]=await Promise.all([
 db.query<{id:string;name:string;price_pence:number}>("SELECT id,name,price_pence FROM beauty.public_services WHERE professional_id=$1 AND ($2::uuid IS NULL OR id=$2) ORDER BY name,id LIMIT 200",[professionalId,selected?.serviceId??null]),
 db.query<{id:string;name:string;description:string;price_pence:number}>("SELECT id,name,description,price_pence FROM beauty.public_products WHERE professional_id=$1 AND in_stock AND NOT seller_away AND ($2::uuid IS NULL OR id=$2) ORDER BY name,id LIMIT 200",[professionalId,selected?.productId??null])]);
 return {...profile,services:services.rows,products:products.rows};
}
