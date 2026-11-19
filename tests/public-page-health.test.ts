import {it,expect} from 'vitest';
import {publicPageHealth} from '@/lib/public-page-health.mjs';
const response=(html:string)=>new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8'}});
it('accepts a complete public main document without returning its contents',async()=>{expect(await publicPageHealth(response('<html><main>Public content</main></html>'))).toEqual({ok:true,reason:'document_received'});});
it.each(['1:E{"digest":"fixture"}',String.raw`1:E{\"digest\":\"fixture\"}`])('detects streamed error records after successful shells',async record=>{expect(await publicPageHealth(response('<main>Shell</main><script>'+record+'</script>'))).toEqual({ok:false,reason:'render_error'});});
it('does not confuse a Next redirect control record with a render exception',async()=>{expect((await publicPageHealth(response('<main>Public</main>1:E{"digest":"NEXT_REDIRECT;replace;/sign-in;307;"}'))).ok).toBe(true);});
it.each(['<html id="__next_error__"><main>Error</main></html>','<main data-next-error="true">Error</main>'])('rejects explicit Next error documents',async html=>{expect((await publicPageHealth(response(html))).reason).toBe('render_error');});
it('rejects empty shells, JSON and failed HTTP responses',async()=>{
 expect((await publicPageHealth(response('<html>Shell only</html>'))).reason).toBe('missing_main');
 expect((await publicPageHealth(Response.json({ok:true}))).reason).toBe('unexpected_content');
 expect((await publicPageHealth(new Response('',{status:503}))).reason).toBe('http_error');
 expect((await publicPageHealth(new Response(null,{headers:{'Content-Type':'text/html'}}))).reason).toBe('empty_document');
});
it('cancels oversized streams without logging document contents',async()=>{
 let cancelled=false;const stream=new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(1024*1024));},cancel(){cancelled=true;}});
 expect((await publicPageHealth(new Response(stream,{headers:{'Content-Type':'text/html'}}))).reason).toBe('document_limit');expect(cancelled).toBe(true);
});
it('detects an error marker split across network chunks',async()=>{
 const encoder=new TextEncoder();const stream=new ReadableStream({start(c){for(const piece of ['<main>Shell</main>1:E{"di','gest":"fixture"}'])c.enqueue(encoder.encode(piece));c.close();}});
 expect((await publicPageHealth(new Response(stream,{headers:{'Content-Type':'text/html'}}))).reason).toBe('render_error');
});
