// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {PortfolioOrganisation} from '@/components/portfolio-organisation';
const collection='11111111-1111-4111-8111-111111111111';
const upload='22222222-2222-4222-8222-222222222222';
let node:HTMLDivElement,root:Root;
const snapshot={collections:[{id:collection,name:'Braids',publication_status:'published' as const,sort_order:2}],memberships:[],presentation:[]};
beforeEach(async()=>{vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('fetch',vi.fn());node=document.createElement('div');document.body.append(node);root=createRoot(node);await act(async()=>root.render(<PortfolioOrganisation initial={snapshot} uploads={[{id:upload,caption:'Uploaded braids',publication_status:'draft'}]} social={[]}/>));});
afterEach(async()=>{await act(async()=>root.unmount());node.remove();vi.unstubAllGlobals();});
function form(index=0){return node.querySelectorAll('form')[index];}
async function submit(index=0){await act(async()=>form(index).dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));}
it('retains collection entries after a rejected save and allows retry',async()=>{
 const name=form().querySelector<HTMLInputElement>('[name="name"]')!;name.value='New collection';
 vi.mocked(fetch).mockResolvedValueOnce(Response.json({}, {status:400}));await submit();
 expect(name.value).toBe('New collection');expect(node.textContent).toContain('must be unique');
 expect(form().querySelector('fieldset')!.disabled).toBe(false);
 vi.mocked(fetch).mockResolvedValueOnce(Response.json({})).mockResolvedValueOnce(Response.json(snapshot));await submit();
 expect(name.value).toBe('');expect(node.textContent).toContain('Source visibility has not changed');
});
it('saves uploaded pin, order and collection membership together without publishing the source',async()=>{
 const f=form(2);f.querySelector<HTMLInputElement>('[name="featured"]')!.checked=true;f.querySelector<HTMLInputElement>('[name="sortOrder"]')!.value='3';f.querySelector<HTMLInputElement>('[name="collectionId"]')!.checked=true;
 vi.mocked(fetch).mockResolvedValueOnce(Response.json({})).mockResolvedValueOnce(Response.json(snapshot));await submit(2);
 expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))).toEqual({action:'saveUpload',id:upload,featured:true,sortOrder:3,collectionIds:[collection]});
 expect(node.textContent).toContain('Uploaded file · draft');
});
it('prevents duplicate submissions while saving',async()=>{
 let finish!:(r:Response)=>void;vi.mocked(fetch).mockImplementationOnce(()=>new Promise(r=>{finish=r;})).mockResolvedValueOnce(Response.json(snapshot));
 await act(async()=>{form().dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));form().dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});expect(fetch).toHaveBeenCalledTimes(1);
 await act(async()=>finish(Response.json({})));
});
it('requires a successful refresh before another save after a committed change cannot refresh',async()=>{
 vi.mocked(fetch).mockResolvedValueOnce(Response.json({})).mockRejectedValueOnce(new TypeError('offline'));await submit();
 expect(node.textContent).toContain('Saved, but the list could not refresh');expect(form().querySelector('fieldset')!.disabled).toBe(true);
 await submit();expect(fetch).toHaveBeenCalledTimes(2);
 vi.mocked(fetch).mockResolvedValueOnce(Response.json(snapshot));await act(async()=>Array.from(node.querySelectorAll('button')).find(b=>b.textContent==='Reload collection list')!.click());
 expect(form().querySelector('fieldset')!.disabled).toBe(false);
});
it('does not retry an uncertain timeout until the server list is checked',async()=>{
 vi.mocked(fetch).mockRejectedValueOnce(new DOMException('timeout','TimeoutError'));await submit();
 expect(node.textContent).toContain('Reload the list before retrying');await submit();expect(fetch).toHaveBeenCalledTimes(1);
});
it('confirms collection deletion and explains that source media are retained',async()=>{
 const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);await act(async()=>Array.from(form(1).querySelectorAll('button')).find(b=>b.textContent==='Delete collection')!.click());
 expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Photos, videos and linked posts are kept'));expect(fetch).not.toHaveBeenCalled();confirm.mockRestore();
});
