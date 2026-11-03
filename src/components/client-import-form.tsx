"use client";
import {useMemo,useRef,useState} from "react";
import {useRouter} from "next/navigation";
import {importFields,inferImportMapping,parseClientCsv,previewClientImport,type ImportField} from "@/modules/client-imports/domain";
export type ImportedContactSummary={id:string;name:string;email:string;phone:string|null;permission_date:string};
export function ClientImportForm({contacts}:{contacts:ImportedContactSummary[]}){
 const fileVersion=useRef(0);
 const router=useRouter();const [csv,setCsv]=useState<string[][]>([]);const [mapping,setMapping]=useState<(ImportField|"")[]>([]);
 const [confirmed,setConfirmed]=useState(false);const [pending,setPending]=useState(false);const [message,setMessage]=useState("");
 const preview=useMemo(()=>{if(!csv.length)return null;try{return {...previewClientImport(csv,mapping),mappingError:""};}catch(e){return {rows:[],errors:[],mappingError:e instanceof Error?e.message:"Check the column mapping."};}},[csv,mapping]);
 async function fileChanged(file:File|undefined){const version=++fileVersion.current;setCsv([]);setMapping([]);setConfirmed(false);setMessage("");if(!file)return;
  if(file.size>524288){setMessage("Use a CSV file smaller than 512 KB.");return;}
  try{const rows=parseClientCsv(await file.text());if(version!==fileVersion.current)return;setCsv(rows);setMapping(inferImportMapping(rows[0]));}catch(e){if(version===fileVersion.current)setMessage(e instanceof Error?e.message:"The file could not be read.");}
 }
 async function submit(){if(!preview||preview.errors.length||preview.mappingError||!confirmed||pending)return;setPending(true);setMessage("");
  try{const response=await fetch("/api/v1/professional/client-imports",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({rows:preview.rows,confirmed:true})});
   const data=await response.json();if(!response.ok){setMessage(data.error?.code==="IMPORT_LIMIT_REACHED"?"This pilot supports 500 active imported contacts. Remove unused contacts before importing more.":"Import could not be completed. Check your permissions and file, then try again.");return;}
   setCsv([]);setMapping([]);setConfirmed(false);setMessage(`${data.imported} contacts imported; ${data.skipped} existing or previously removed contacts skipped. No messages were sent.`);router.refresh();
  }catch{setMessage("The import result could not be confirmed. Refresh and review your contacts before retrying; duplicates are prevented.");}finally{setPending(false);}
 }
 async function remove(contact:ImportedContactSummary){if(pending||!window.confirm(`Remove ${contact.name}'s imported contact details? No GLOHAUS account or booking will be changed.`))return;setPending(true);
  try{const response=await fetch("/api/v1/professional/client-imports",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:contact.id,confirmed:true})});setMessage(response.ok?"Imported contact details removed. Previously removed contacts are not restored by uploading the file again.":"Contact could not be removed. Please try again.");if(response.ok)router.refresh();}
  catch{setMessage("Removal could not be confirmed. Refresh to check the contact before retrying.");}finally{setPending(false);}
 }
 return <>
 <section className="admin-detail-card" style={{padding:24}}><h2>Preview an import</h2><p>Up to 500 contacts per file and 500 active imported contacts in this pilot. Files are read in your browser for preview and sent only when you confirm the import. Keep permission evidence specific to storing the record here; it is not permission for promotional messages.</p>
 <p><a className="button small" download="glohaus-client-import-template.csv" href="data:text/csv;charset=utf-8,name%2Cemail%2Cphone%2Cimport_permission%2Cpermission_date%2Cpermission_source%0A">Download CSV template</a></p>
 <label>Client CSV <input type="file" accept=".csv,text/csv" disabled={pending} onChange={e=>void fileChanged(e.target.files?.[0])}/></label>
 {csv.length>0&&<><h3>Map your columns</h3><div className="editor-form">{csv[0].map((header,index)=><label key={index}>{header||`Column ${index+1}`}<select value={mapping[index]??""} disabled={pending} onChange={e=>setMapping(old=>old.map((v,i)=>i===index?e.target.value as ImportField|"":v))}><option value="">Do not import this column</option>{importFields.map(field=><option key={field} value={field}>{field.replaceAll("_"," ")}</option>)}</select></label>)}</div></>}
 {preview&&<>{preview.mappingError&&<p role="alert">{preview.mappingError}</p>}{preview.errors.length>0&&<div role="alert"><p>Fix these rows before importing. Nothing has been uploaded.</p><ul>{preview.errors.slice(0,20).map(error=><li key={error.row}>Row {error.row}: {error.message}</li>)}</ul>{preview.errors.length>20&&<p>{preview.errors.length-20} more rows need correction.</p>}</div>}
 {!preview.mappingError&&<><p>{preview.rows.length} valid contacts. Preview shows the first 20.</p><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Permission date</th><th>Permission evidence</th></tr></thead><tbody>{preview.rows.slice(0,20).map(row=><tr key={row.email}><td>{row.name}</td><td>{row.email}</td><td>{row.phone}</td><td>{row.permission_date}</td><td>{row.permission_source}</td></tr>)}</tbody></table></div></>}
 <label><input type="checkbox" checked={confirmed} disabled={pending} onChange={e=>setConfirmed(e.target.checked)}/>I have checked every row and hold permission evidence for storing these existing clients&apos; details for my business on GLOHAUS. I understand this does not grant marketing consent.</label>
 <p><button className="button" type="button" disabled={pending||!confirmed||!!preview.mappingError||preview.errors.length>0||preview.rows.length===0} onClick={()=>void submit()}>{pending?"Importing…":"Confirm import"}</button></p></>}
 <p role="status" aria-live="polite">{message}</p></section>
 <section className="admin-detail-card" style={{padding:24,marginTop:20}}><h2>Imported contacts ({contacts.length})</h2><p>These records are separate from booked GLOHAUS clients. Existing and removed contacts are skipped on reimport. Removal clears contact details and retains a private matching fingerprint to prevent accidental restoration.</p>
 {contacts.length?<div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Permission date</th><th>Manage</th></tr></thead><tbody>{contacts.map(c=><tr key={c.id}><td>{c.name}</td><td>{c.email}</td><td>{c.phone}</td><td>{c.permission_date}</td><td><button type="button" className="button small" disabled={pending} onClick={()=>void remove(c)}>Remove contact</button></td></tr>)}</tbody></table></div>:<p>No imported contacts yet.</p>}</section>
 </>;
}
