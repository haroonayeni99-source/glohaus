"use client";
import {useRef,useState,type FormEvent} from 'react';
import {LoadingDots} from './loading-dots';
import type {PortfolioOrganisation as Organisation,WorkCollection,OrganisationAction} from '@/modules/portfolio-organisation/domain';
import './portfolio-organisation.css';
type Work={id:string;caption:string;publication_status:string};
export function PortfolioOrganisation({initial,uploads,social}:{initial:Organisation;uploads:Work[];social:Work[]}){
 const [data,setData]=useState(initial),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[needsRefresh,setNeedsRefresh]=useState(false);const inFlight=useRef(false);
 async function refresh(){const r=await fetch('/api/v1/professional/portfolio/organisation',{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('refresh');setData(await r.json());setNeedsRefresh(false);}
 async function save(input:OrganisationAction,form?:HTMLFormElement){
  if(inFlight.current||needsRefresh)return;inFlight.current=true;setBusy(true);setNotice('');let committed=false;
  try{const r=await fetch('/api/v1/professional/portfolio/organisation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),signal:AbortSignal.timeout(20000)});
   if(!r.ok)throw Error(r.status===401?'Your session expired. Sign in again before saving.':r.status===400?'Check the collection name and order. Collection names must be unique.':'The change could not be saved. Your entries are still here.');
   committed=true;await refresh();if(input.action==='saveCollection'&&!input.id)form?.reset();setNotice('Portfolio organisation saved. Source visibility has not changed.');
  }catch(e){if(committed||!(e instanceof Error&&e.name==='Error'))setNeedsRefresh(true);setNotice(committed?'Saved, but the list could not refresh. Reload the list before editing again.':e instanceof Error&&e.name==='Error'?e.message:'Could not confirm the change. Reload the list before retrying; your entries are still here.');}
  finally{inFlight.current=false;setBusy(false);}
 }
 const statusOptions=<><option value="draft">Draft — only you</option><option value="published">Published collection</option><option value="hidden">Hidden collection</option></>;
 function collectionForm(c?:WorkCollection){return <form key={c?`${c.id}:${c.name}:${c.publication_status}:${c.sort_order}`:'new'} onSubmit={(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const f=new FormData(e.currentTarget);void save({action:'saveCollection',...(c?{id:c.id}:{}),name:String(f.get('name')??'').trim(),publicationStatus:f.get('publicationStatus') as 'draft'|'published'|'hidden',sortOrder:Number(f.get('sortOrder'))},e.currentTarget);}}>
  <fieldset disabled={busy||needsRefresh}><legend>{c?'Edit '+c.name:'Create a collection'}</legend>
   <label>Collection name<input name="name" minLength={1} maxLength={80} required defaultValue={c?.name}/></label>
   <label>Collection visibility<select name="publicationStatus" defaultValue={c?.publication_status??'draft'}>{statusOptions}</select></label>
   <label>Collection order (lower first)<input type="number" name="sortOrder" min={0} max={10000} step={1} required defaultValue={c?.sort_order??data.collections.length}/></label>
   <button type="submit" className="button">{c?'Save collection':'Create collection'}<LoadingDots busy={busy}/></button>
   {c&&<button type="button" className="button button-secondary" onClick={()=>{if(window.confirm('Delete this collection? Photos, videos and linked posts are kept.'))void save({action:'deleteCollection',id:c.id});}}>Delete collection</button>}
  </fieldset></form>;}
 function workForm(item:Work,upload:boolean){const placement=data.presentation.find(p=>p.asset_id===item.id);const selected=data.memberships.filter(m=>upload?m.asset_id===item.id:m.social_post_id===item.id).map(m=>m.collection_id);return <form key={`${item.id}:${placement?.featured}:${placement?.sort_order}:${selected.join(',')}`} onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget),collectionIds=f.getAll('collectionId').map(String);void save(upload?{action:'saveUpload',id:item.id,featured:f.get('featured')==='on',sortOrder:Number(f.get('sortOrder')),collectionIds}:{action:'saveSocialCollections',id:item.id,collectionIds});}}>
  <fieldset disabled={busy||needsRefresh}><legend>{item.caption.slice(0,160)||'Linked work'}</legend><p>{upload?'Uploaded file':'Linked social post'} · {item.publication_status}</p>
   {upload&&<><label className="organisation-check"><input type="checkbox" name="featured" defaultChecked={placement?.featured??false}/>Pin as featured work</label><label>Display order (lower first)<input name="sortOrder" type="number" min={0} max={10000} step={1} required defaultValue={placement?.sort_order??0}/></label></>}
   {data.collections.length?<fieldset><legend>Collections for this work</legend>{data.collections.map(c=><label className="organisation-check" key={c.id}><input type="checkbox" name="collectionId" value={c.id} defaultChecked={selected.includes(c.id)}/>{c.name} · {c.publication_status}</label>)}</fieldset>:<p>Create a collection above to organise this work.</p>}
   <button type="submit" className="button">{upload?'Save uploaded work':'Save linked collections'}<LoadingDots busy={busy}/></button>
  </fieldset></form>;}
 return <section className="pro-editor-surface portfolio-organisation" aria-label="Collections and uploaded ordering"><h2>Collections &amp; featured uploads</h2>
  <p>Choose which published work belongs together. Publishing a collection does not publish its photos, videos or linked posts. Drafts and hidden work stay private. Social pins and display order remain in their existing post controls.</p>
  {notice&&<p role="status" className="form-notice">{notice}</p>}
  <button type="button" className="button button-secondary" disabled={busy} onClick={()=>{if(inFlight.current)return;inFlight.current=true;setBusy(true);void refresh().then(()=>setNotice('Collection list refreshed.')).catch(()=>setNotice('Could not reload the list. Your entries are still here.')).finally(()=>{inFlight.current=false;setBusy(false);});}}>Reload collection list</button>
  {collectionForm()}{data.collections.map(c=>collectionForm(c))}
  <h3>Organise uploaded work</h3>{uploads.length?uploads.map(item=>workForm(item,true)):<p>No uploaded media yet.</p>}
  <h3>Organise linked work</h3>{social.length?social.map(item=>workForm(item,false)):<p>No linked social posts yet.</p>}
 </section>;
}
