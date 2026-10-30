import {z} from "zod";
export const importFields=["name","email","phone","import_permission","permission_date","permission_source"] as const;
export type ImportField=typeof importFields[number];
function londonToday(){const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/London",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());return ["year","month","day"].map(k=>parts.find(p=>p.type===k)!.value).join("-");}
export const importedClientSchema=z.object({
 name:z.string().trim().min(1).max(100).regex(/^[^\x00-\x1f]*$/),
 email:z.string().trim().toLowerCase().max(254).pipe(z.email()),
 phone:z.string().trim().max(30).regex(/^([+]?[0-9 ()-]{7,30})?$/).default(""),
 import_permission:z.literal(true),
 permission_date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s=>{const n=Date.parse(s);return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===s&&s<=londonToday();}),
 permission_source:z.string().trim().min(5).max(300).regex(/^[^\x00-\x1f]*$/),
}).strict();
export type ImportedClient=z.infer<typeof importedClientSchema>;
export const clientImportSchema=z.object({rows:z.array(importedClientSchema).min(1).max(500),confirmed:z.literal(true)}).strict().superRefine((x,ctx)=>{
 const seen=new Set<string>();x.rows.forEach((r,i)=>{if(seen.has(r.email))ctx.addIssue({code:"custom",path:["rows",i,"email"],message:"Duplicate email"});seen.add(r.email);});
});
export function parseClientCsv(text:string):string[][]{
 if(new TextEncoder().encode(text).length>524288)throw Error("Use a CSV file smaller than 512 KB.");
 text=text.replace(/^\uFEFF/,"");const rows:string[][]=[];let row:string[]=[],value="",quoted=false,closed=false;
 function cell(){row.push(value);value="";closed=false;if(row.length>20)throw Error("Use no more than 20 columns.");}
 function line(){cell();if(row.some(v=>v.trim()))rows.push(row);row=[];if(rows.length>501)throw Error("Import no more than 500 clients at a time.");}
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(quoted){if(c==='"'){if(text[i+1]==='"'){value+='"';i++;}else{quoted=false;closed=true;}}else value+=c;continue;}
  if(c===','){cell();continue;}if(c==='\r'||c==='\n'){if(c==='\r'&&text[i+1]==='\n')i++;line();continue;}
  if(c==='"'){if(value||closed)throw Error("Check the CSV quotation marks.");quoted=true;continue;}
  if(closed){if(c===' '||c==='\t')continue;throw Error("Check the CSV quotation marks.");}value+=c;
 }
 if(quoted)throw Error("A quoted CSV field has not been closed.");if(value||row.length||closed)line();
 if(rows.length<2)throw Error("Include a header row and at least one client.");
 if(rows.some(r=>r.length!==rows[0].length))throw Error("Every row must have the same number of columns.");return rows;
}
export function inferImportMapping(headers:string[]):(ImportField|"")[]{
 const aliases:Record<string,ImportField>={full_name:"name",email_address:"email",phone_number:"phone"};
 return headers.map(h=>{const k=h.trim().toLowerCase().replace(/\s+/g,"_");return importFields.includes(k as ImportField)?k as ImportField:aliases[k]??"";});
}
export function previewClientImport(csv:string[][],mapping:(ImportField|"")[]){
 const fields=mapping.filter(Boolean);if(new Set(fields).size!==fields.length)throw Error("Map each field only once.");
 for(const field of importFields.filter(f=>f!=="phone"))if(!fields.includes(field))throw Error(`Map the ${field.replaceAll("_"," ")} column.`);
 const rows:ImportedClient[]=[];const errors:{row:number;message:string}[]=[];const seen=new Set<string>();
 csv.slice(1).forEach((cells,i)=>{
  const raw:Record<string,unknown>={};mapping.forEach((field,index)=>{if(field)raw[field]=field==="import_permission"?cells[index].trim().toLowerCase()==="true":cells[index];});
  const result=importedClientSchema.safeParse(raw);
  if(!result.success){errors.push({row:i+2,message:"Check "+[...new Set(result.error.issues.map(x=>String(x.path[0]).replaceAll("_"," ")))].join(", ")+". Import permission must be true, with a valid past/current date and specific evidence."});return;}
  if(seen.has(result.data.email)){errors.push({row:i+2,message:"Duplicate email in this file."});return;}seen.add(result.data.email);rows.push(result.data);
 });return {rows,errors};
}
