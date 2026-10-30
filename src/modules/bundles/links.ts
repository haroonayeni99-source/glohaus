import "server-only";
import {createHmac,timingSafeEqual} from "node:crypto";
import {z} from "zod";
const selection=z.object({version:z.literal(1),professionalId:z.uuid(),serviceId:z.uuid(),productId:z.uuid()}).strict();
export type BundleSelection=z.infer<typeof selection>;
function key(){return process.env.GLOHAUS_BUNDLE_LINK_SECRET?.trim()||process.env.CRON_SECRET?.trim();}
function signature(body:string,secret:string){return createHmac("sha256",secret).update(`glohaus-public-service-product-selection-v1:${body}`).digest("base64url");}
export function signBundleSelection(value:BundleSelection){const secret=key();if(!secret)throw Error("BUNDLE_LINKS_UNAVAILABLE");const body=Buffer.from(JSON.stringify(selection.parse(value))).toString("base64url");return `${body}.${signature(body,secret)}`;}
export function readBundleSelection(token:unknown):BundleSelection|null{const secret=key();if(!secret||typeof token!=="string"||token.length>512)return null;const parts=token.split(".");if(parts.length!==2||!parts.every(p=>/^[a-zA-Z0-9_-]+$/.test(p)))return null;const expected=Buffer.from(signature(parts[0],secret));const actual=Buffer.from(parts[1]);if(expected.length!==actual.length||!timingSafeEqual(expected,actual))return null;try{const value=selection.safeParse(JSON.parse(Buffer.from(parts[0],"base64url").toString("utf8")));return value.success?value.data:null;}catch{return null;}}
